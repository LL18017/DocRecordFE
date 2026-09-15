'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Patient } from '@/types'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PatientForm } from '@/components/forms/PatientForm'
import { EditPatientForm } from '@/components/forms/EditPatientForm'
import { ApiError } from '@/lib/api'
import {
  eliminarPaciente,
  listarPacientes,
  obtenerPaciente,
  type PacienteDto,
} from '@/services/pacientes'
import { listarConsultas } from '@/services/consultas'
import { pacienteDtoAPatient } from '@/lib/pacienteAdapter'
import { contarConsultasPorPaciente } from '@/lib/resumenPanel'

export default function PacientesPage() {
  // La lista sale de GET /pacientes. Antes se sembraba con los datos de la
  // maqueta, asi que un paciente recien creado desaparecia al recargar: estaba
  // en la base, pero la pantalla nunca la consultaba.
  const [patientsList, setPatientsList] = useState<Patient[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<PacienteDto | null>(null)
  const [cargandoEdicion, setCargandoEdicion] = useState(false)

  // Ningún setState ocurre antes del primer await: hacerlo de forma síncrona
  // dentro del efecto provoca renders en cascada y lo prohíbe la regla
  // react-hooks/set-state-in-effect. `cargando` ya arranca en true, así que la
  // carga inicial no necesita anunciarse.
  //
  // La columna «Consultas» necesita un segundo dato que `GET /pacientes` no
  // trae. Se resuelve con UNA sola petición más —`GET /consultas` sin filtro
  // devuelve todas— y no con una por paciente: el N+1 crecería con el padrón y
  // un fallo parcial de esa ráfaga daría conteos bajos presentados como
  // ciertos. Van con `allSettled` porque son independientes: si el conteo
  // falla, la lista se sigue viendo y la columna muestra el hueco en vez de un
  // cero que afirmaría que nadie ha venido nunca.
  const cargarPacientes = useCallback(async () => {
    const [resPacientes, resConsultas] = await Promise.allSettled([
      listarPacientes(),
      listarConsultas(),
    ])

    if (resPacientes.status === 'rejected') {
      setError(
        resPacientes.reason instanceof ApiError
          ? resPacientes.reason.message
          : 'No se pudo cargar la lista de pacientes.',
      )
      setCargando(false)
      return
    }

    // `null` = no se sabe; un mapa cargado sin la clave = cero consultas de
    // verdad. La distinción es toda la diferencia entre el hueco y la mentira.
    const conteo =
      resConsultas.status === 'fulfilled'
        ? contarConsultasPorPaciente(resConsultas.value)
        : null

    setPatientsList(
      resPacientes.value.map((p) => ({
        ...pacienteDtoAPatient(p),
        consultations: conteo === null ? null : (conteo.get(p.personaId) ?? 0),
      })),
    )

    setError(
      resConsultas.status === 'rejected'
        ? describirFalloDeConteo(resConsultas.reason)
        : null,
    )
    setCargando(false)
  }, [])

  // La regla react-hooks/set-state-in-effect rastrea dentro de la función
  // llamada y marca los setState que ocurren tras el await. Aquí no hay render
  // en cascada: el estado se escribe cuando la respuesta llega, no durante el
  // render. Es el caso que la regla no puede modelar —cargar datos remotos al
  // montar— y que la propia documentación de React admite mientras no haya una
  // capa de datos del framework. Se desactiva de forma acotada, no global.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarPacientes()
  }, [cargarPacientes])

  // Reintentar sí es un manejador de evento, no un efecto: aquí marcar el
  // estado de carga antes de pedir es correcto y además da respuesta inmediata.
  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargarPacientes()
  }

  const handleDelete = async (id: string) => {
    // Optimista no: en un expediente clinico conviene que la fila desaparezca
    // solo cuando el servidor confirmo la baja.
    try {
      await eliminarPaciente(Number(id))
      setPatientsList((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo dar de baja al paciente.',
      )
    }
  }

  const handlePacienteCreado = (paciente: PacienteDto) => {
    // Aquí el 0 sí es un dato y no un relleno: el backend acaba de crear al
    // paciente, así que todavía no puede tener ninguna consulta.
    setPatientsList((prev) => [{ ...pacienteDtoAPatient(paciente), consultations: 0 }, ...prev])
    setShowModal(false)
  }

  // Se pide el paciente fresco al API en vez de reusar la fila de la tabla
  // (que ya viene adaptada al tipo Patient y perdió campos como sexo/dui
  // crudos): así el formulario de edición parte siempre de datos vigentes.
  const handleAbrirEdicion = async (personaId: string) => {
    setCargandoEdicion(true)
    setError(null)
    try {
      const paciente = await obtenerPaciente(Number(personaId))
      setEditando(paciente)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cargar el paciente para editar.',
      )
    } finally {
      setCargandoEdicion(false)
    }
  }

  const handlePacienteActualizado = (paciente: PacienteDto) => {
    // Se conserva el conteo que ya tenía la fila: editar los datos personales
    // no cambia cuántas consultas tiene, y volver a adaptar el DTO lo dejaría
    // en `null` —un hueco donde sí se sabía el número—.
    setPatientsList((prev) =>
      prev.map((p) =>
        p.id === String(paciente.personaId)
          ? { ...pacienteDtoAPatient(paciente), consultations: p.consultations }
          : p,
      ),
    )
    setEditando(null)
  }

  const columns: Column<Patient>[] = [
    {
      header: 'Nombre',
      cell: (p) => (
        <Link
          href={`/pacientes/${p.id}`}
          className="font-semibold text-slate-800 hover:text-doc-blue transition-colors text-sm font-outfit"
        >
          {p.name}
        </Link>
      ),
    },
    {
      header: 'Teléfono',
      accessorKey: 'phone',
      className: 'font-mono text-xs text-slate-600',
    },
    {
      header: 'Edad',
      cell: (p) => <span className="text-slate-600">{p.age} años</span>,
    },
    {
      header: 'Sexo',
      accessorKey: 'sex',
      className: 'text-slate-600',
    },
    {
      header: 'Consultas',
      // El número sale de `GET /consultas`; cuando esa petición falla se pinta
      // un guion y NO un cero. Un cero aquí se lee como «este paciente nunca
      // ha venido», que es una afirmación clínica: no se hace sin saberlo.
      cell: (p) =>
        p.consultations === null ? (
          <span
            className="text-slate-400"
            title="No se pudo consultar cuántas consultas tiene este paciente."
          >
            —
          </span>
        ) : (
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs ${
              p.consultations > 0 ? 'bg-doc-blue' : 'bg-slate-400'
            }`}
          >
            {p.consultations}
          </span>
        ),
    },
    {
      header: 'Estado',
      cell: (p) => <Badge color="green">{p.status}</Badge>,
    },
    {
      header: 'Acciones',
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/pacientes/${p.id}`}
            className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
            title="Ver expediente clínico"
          >
            <Icon name="eye" size={14} />
          </Link>
          <button
            onClick={() => handleAbrirEdicion(p.id)}
            disabled={cargandoEdicion}
            className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title="Editar paciente"
          >
            <Icon name="edit" size={14} />
          </button>
          <button
            onClick={() => handleDelete(p.id)}
            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
            title="Eliminar paciente"
          >
            <Icon name="delete" size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header and create button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">
            Administración de Pacientes
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Directorio y registro centralizado de pacientes ambulatorios
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nuevo Paciente
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button
            onClick={reintentar}
            className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando pacientes…
        </div>
      ) : (
      /* Reusable DataTable Component */
      <DataTable
        data={patientsList}
        columns={columns}
        keyExtractor={(p) => p.id}
        searchable
        searchPlaceholder="Buscar por nombre, teléfono o expediente..."
        searchFilter={(p, q) =>
          p.name.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.id_num.includes(q)
        }
        pageSize={5}
      />
      )}

      {/* Reusable Modal + Patient Form */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Nuevo Paciente"
        subtitle="Registro clínico integral"
        icon="patients"
        maxWidth="xl"
      >
        <PatientForm
          onCreated={handlePacienteCreado}
          onCancel={() => setShowModal(false)}
        />
      </Modal>

      {/* Editar paciente existente */}
      <Modal
        isOpen={editando !== null}
        onClose={() => setEditando(null)}
        title="Editar Paciente"
        subtitle="Actualizar datos clínicos"
        icon="edit"
        maxWidth="xl"
      >
        {editando && (
          <EditPatientForm
            paciente={editando}
            onUpdated={handlePacienteActualizado}
            onCancel={() => setEditando(null)}
          />
        )}
      </Modal>
    </div>
  )
}

/**
 * Qué se le dice al usuario cuando la lista se pudo cargar pero el conteo de
 * consultas no.
 *
 * El aviso nombra la consecuencia visible —la columna se queda en «—»— en vez
 * de dejar que el usuario deduzca por su cuenta qué significa ese guion. El
 * motivo del backend se conserva cuando lo hay, igual que en el resto de
 * pantallas: explica el caso concreto mejor que una frase fija.
 */
function describirFalloDeConteo(error: unknown): string {
  const motivo = error instanceof ApiError ? ` ${error.message}` : ''
  return `No se pudo contar las consultas de cada paciente, así que esa columna se muestra como «—».${motivo}`
}
