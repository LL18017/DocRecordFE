'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ConsultationForm, type OpcionPaciente } from '@/components/forms/ConsultationForm'
import { listarPacientes } from '@/services/pacientes'
import {
  eliminarConsulta,
  formatearFechaHora,
  listarConsultas,
  nombreDeClinica,
  nombreDePaciente,
  type ConsultaDto,
} from '@/services/consultas'

/** Cómo se pinta cada estado. El backend solo maneja estos dos. */
const COLOR_DE_ESTADO = { PENDIENTE: 'yellow', FINALIZADA: 'green' } as const

export default function ConsultasPage() {
  // La lista sale de GET /consultas. Antes se sembraba con los datos de la
  // maqueta y el formulario no enviaba nada: lo que se escribía aquí no
  // llegaba a la base ni sobrevivía a un refresco.
  const [consultas, setConsultas] = useState<ConsultaDto[]>([])
  const [pacientes, setPacientes] = useState<OpcionPaciente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const [editando, setEditando] = useState<ConsultaDto | null>(null)

  // Ningún setState ocurre antes del primer await: hacerlo de forma síncrona
  // dentro del efecto provoca renders en cascada y lo prohíbe la regla
  // react-hooks/set-state-in-effect. `cargando` ya arranca en true.
  //
  // Las dos peticiones van con `allSettled` y no con `all`: si el catálogo de
  // pacientes falla, las consultas ya traídas se siguen mostrando (leerlas es
  // lo principal de esta pantalla) y el aviso explica qué se quedó sin cargar.
  const cargar = useCallback(async () => {
    const [resConsultas, resPacientes] = await Promise.allSettled([
      listarConsultas(),
      listarPacientes(),
    ])

    const problemas: string[] = []

    if (resConsultas.status === 'fulfilled') {
      setConsultas(resConsultas.value)
    } else {
      problemas.push(describir('No se pudieron cargar las consultas', resConsultas.reason))
    }

    if (resPacientes.status === 'fulfilled') {
      setPacientes(
        resPacientes.value.map((p) => ({
          personaId: p.personaId,
          nombre: `${p.persona.nombres} ${p.persona.apellidos}`.trim(),
          expediente: p.expediente,
        })),
      )
    } else {
      problemas.push(describir('No se pudo cargar el catálogo de pacientes', resPacientes.reason))
    }

    setError(problemas.length > 0 ? problemas.join(' ') : null)
    setCargando(false)
  }, [])

  // Ver el comentario equivalente en (portal)/pacientes/page.tsx: cargar datos
  // remotos al montar es el caso que la regla no puede modelar, y el setState
  // ocurre cuando llega la respuesta, no durante el render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargar()
  }, [cargar])

  // Reintentar sí es un manejador de evento: aquí marcar el estado de carga
  // antes de pedir es correcto y da respuesta inmediata.
  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargar()
  }

  const handleEliminar = async (consultaId: number) => {
    // Optimista no: en un expediente clínico la fila desaparece solo cuando el
    // servidor confirmó la baja.
    try {
      await eliminarConsulta(consultaId)
      setConsultas((prev) => prev.filter((c) => c.consultaId !== consultaId))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar la consulta.'))
    }
  }

  const handleRegistrada = (consulta: ConsultaDto) => {
    setConsultas((prev) => [consulta, ...prev])
    setRegistrando(false)
  }

  const handleActualizada = (consulta: ConsultaDto) => {
    setConsultas((prev) =>
      prev.map((c) => (c.consultaId === consulta.consultaId ? consulta : c)),
    )
    setEditando(null)
  }

  const columns = useMemo<Column<ConsultaDto>[]>(
    () => [
      {
        header: 'Fecha',
        cell: (c) => (
          <span className="whitespace-nowrap text-slate-600">{formatearFechaHora(c.fecha)}</span>
        ),
      },
      {
        header: 'Paciente',
        cell: (c) => (
          <Link
            href={`/pacientes/${c.paciente.personaId}`}
            className="font-medium text-slate-800 hover:text-doc-blue transition-colors font-outfit"
          >
            {nombreDePaciente(c)}
          </Link>
        ),
      },
      {
        header: 'Motivo',
        accessorKey: 'motivo',
        className: 'max-w-[180px] truncate text-slate-600',
      },
      {
        header: 'Diagnóstico',
        // `diagnostico` llega null mientras la consulta sigue pendiente. El
        // guion es el mismo que usa el expediente para lo que falta; pintar
        // «null» o dejar la celda vacía haría dudar de si se perdió el dato.
        cell: (c) =>
          c.diagnostico ? (
            <span className="font-medium text-slate-800">{c.diagnostico}</span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
        className: 'max-w-[180px] truncate',
      },
      {
        header: 'Clínica',
        // `clinica` PUEDE SER NULL (el contrato lo dice y `clinicaId` es
        // opcional al crear). Se resuelve con `nombreDeClinica`, que devuelve
        // null en vez de reventar en `c.clinica.name`.
        cell: (c) => {
          const clinica = nombreDeClinica(c)
          return clinica ? (
            <span className="text-slate-600">{clinica}</span>
          ) : (
            <span className="text-slate-400 italic">Sin sede registrada</span>
          )
        },
      },
      {
        header: 'Estado',
        cell: (c) => <Badge color={COLOR_DE_ESTADO[c.estado] ?? 'gray'}>{c.estado}</Badge>,
      },
      {
        header: 'Acciones',
        cell: (c) => (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditando(c)}
              aria-label={`Editar la consulta de ${nombreDePaciente(c)}`}
              title="Editar consulta"
              className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              onClick={() => handleEliminar(c.consultaId)}
              aria-label={`Eliminar la consulta de ${nombreDePaciente(c)}`}
              title="Eliminar consulta"
              className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Consultas Médicas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Historial y atención clínica de consultas
          </p>
        </div>
        <button
          onClick={() => setRegistrando(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nueva Consulta
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
          Cargando consultas…
        </div>
      ) : (
        <DataTable
          data={consultas}
          columns={columns}
          keyExtractor={(c) => c.consultaId}
          searchable
          searchPlaceholder="Buscar por paciente, motivo o diagnóstico..."
          searchFilter={(c, q) =>
            nombreDePaciente(c).toLowerCase().includes(q) ||
            c.motivo.toLowerCase().includes(q) ||
            (c.diagnostico?.toLowerCase().includes(q) ?? false)
          }
          emptyMessage="Todavía no hay consultas registradas."
          pageSize={5}
        />
      )}

      <Modal
        isOpen={registrando}
        onClose={() => setRegistrando(false)}
        title="Nueva Consulta Médica"
        subtitle="Evaluación clínica del paciente"
        icon="consultas"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
        maxWidth="lg"
      >
        <ConsultationForm
          pacientes={pacientes}
          onGuardada={handleRegistrada}
          onCancel={() => setRegistrando(false)}
        />
      </Modal>

      <Modal
        isOpen={editando !== null}
        onClose={() => setEditando(null)}
        title="Editar Consulta"
        subtitle="Actualizar motivo o diagnóstico"
        icon="edit"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
        maxWidth="lg"
      >
        {editando && (
          <ConsultationForm
            pacientes={pacientes}
            consulta={editando}
            onGuardada={handleActualizada}
            onCancel={() => setEditando(null)}
          />
        )}
      </Modal>
    </div>
  )
}

/**
 * Mensaje que verá el usuario ante un fallo.
 *
 * Se conserva SIEMPRE el motivo del error: `lib/api.ts` ya extrae el del
 * backend y `services/consultas.ts` solo lo sustituye cuando puede ser más
 * preciso. El texto de respaldo es para lo que no llega como `Error` con
 * mensaje.
 */
function mensajeDe(causa: unknown, respaldo: string): string {
  return causa instanceof Error && causa.message ? causa.message : respaldo
}

/**
 * Igual que `mensajeDe`, pero anteponiendo QUÉ se estaba haciendo.
 *
 * Aquí conviven dos peticiones y el aviso puede juntar las dos: «Error del
 * servidor (500).» a secas no dice si lo que se cayó fueron las consultas o el
 * catálogo de pacientes, y de eso depende si lo que se ve en la tabla es de
 * fiar. Se AÑADE contexto, no se reemplaza el motivo: sustituirlo por una
 * frase propia es justo lo que este proyecto tiene prohibido.
 */
function describir(contexto: string, causa: unknown): string {
  const motivo = causa instanceof Error && causa.message ? causa.message : null
  return motivo ? `${contexto}: ${motivo}` : `${contexto}.`
}
