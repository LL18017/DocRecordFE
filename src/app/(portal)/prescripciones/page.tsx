'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'
import type { OpcionPaciente } from '@/components/forms/ConsultationForm'
import { listarPacientes } from '@/services/pacientes'
import { formatearFechaHora } from '@/services/consultas'
import {
  eliminarPrescripcion,
  listarPrescripcionesDePaciente,
  nombreDeMedicoQueReceta,
  textoOpcional,
  type PrescripcionDto,
} from '@/services/prescripciones'

const CABECERAS = ['Medicamento', 'Dosis', 'Frecuencia', 'Duración']

export default function PrescripcionesPage() {
  // El contrato no expone un `GET /prescripciones` sin filtro: las recetas se
  // piden por consulta o por paciente. Por eso esta pantalla empieza eligiendo
  // paciente en vez de intentar listar «todas» y recibir un 400.
  const [pacientes, setPacientes] = useState<OpcionPaciente[]>([])
  const [pacienteId, setPacienteId] = useState<string>('')
  const [prescripciones, setPrescripciones] = useState<PrescripcionDto[]>([])
  const [cargandoPacientes, setCargandoPacientes] = useState(true)
  const [cargandoRecetas, setCargandoRecetas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)

  const cargarPacientes = useCallback(async () => {
    try {
      const lista = await listarPacientes()
      setPacientes(
        lista.map((p) => ({
          personaId: p.personaId,
          nombre: `${p.persona.nombres} ${p.persona.apellidos}`.trim(),
          expediente: p.expediente,
        })),
      )
      // Se preselecciona el primero para que la pantalla muestre algo útil de
      // entrada; sin pacientes no se selecciona nada y el aviso lo explica.
      setPacienteId(lista[0] ? String(lista[0].personaId) : '')
      setError(null)
    } catch (err) {
      setError(describir('No se pudo cargar el catálogo de pacientes', err))
    } finally {
      setCargandoPacientes(false)
    }
  }, [])

  const cargarRecetas = useCallback(async (idPaciente: string) => {
    if (!idPaciente) {
      setPrescripciones([])
      setCargandoRecetas(false)
      return
    }
    try {
      const lista = await listarPrescripcionesDePaciente(Number(idPaciente))
      setPrescripciones(lista)
      setError(null)
    } catch (err) {
      setPrescripciones([])
      setError(describir('No se pudieron cargar las recetas del paciente', err))
    } finally {
      setCargandoRecetas(false)
    }
  }, [])

  // Ver el comentario equivalente en (portal)/pacientes/page.tsx: la regla
  // rastrea los setState posteriores al await, pero cargar datos remotos al
  // montar no produce el render en cascada que la regla persigue.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarPacientes()
  }, [cargarPacientes])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarRecetas(pacienteId)
  }, [cargarRecetas, pacienteId])

  const reintentar = () => {
    setError(null)
    if (pacientes.length === 0) {
      setCargandoPacientes(true)
      void cargarPacientes()
      return
    }
    setCargandoRecetas(true)
    void cargarRecetas(pacienteId)
  }

  const handleCambioDePaciente = (valor: string) => {
    setPacienteId(valor)
    setCargandoRecetas(true)
  }

  const handleEmitida = () => {
    setEmitiendo(false)
    // No se inserta la receta recién emitida en la lista: `PrescripcionDto` no
    // dice de qué paciente es (solo trae `consultaId` y el médico), y el
    // formulario permite recetar a un paciente distinto del que se está
    // mirando. Meterla a ciegas mostraría bajo un paciente una receta que es
    // de otro. Se vuelve a pedir la lista del paciente filtrado, que es la
    // única respuesta verdadera.
    setCargandoRecetas(true)
    void cargarRecetas(pacienteId)
  }

  const handleAnular = async (prescripcionId: number) => {
    // Igual que en consultas: la tarjeta desaparece solo cuando el servidor
    // confirmó la baja.
    try {
      await eliminarPrescripcion(prescripcionId)
      setPrescripciones((prev) => prev.filter((p) => p.prescripcionId !== prescripcionId))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo anular la receta.'))
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">
            Prescripción de Medicamentos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Control y emisión de recetas médicas</p>
        </div>
        <button
          onClick={() => setEmitiendo(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-purple-600 hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nueva Prescripción
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

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 max-w-md">
        <label
          htmlFor="filtro-paciente"
          className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide"
        >
          Paciente
        </label>
        <select
          id="filtro-paciente"
          value={pacienteId}
          onChange={(e) => handleCambioDePaciente(e.target.value)}
          disabled={cargandoPacientes || pacientes.length === 0}
          className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40 disabled:bg-slate-50 disabled:text-slate-400"
        >
          {cargandoPacientes && <option value="">Cargando pacientes…</option>}
          {!cargandoPacientes && pacientes.length === 0 && (
            <option value="">No hay pacientes registrados</option>
          )}
          {pacientes.map((p) => (
            <option key={p.personaId} value={String(p.personaId)}>
              {p.expediente ? `${p.nombre} (${p.expediente})` : p.nombre}
            </option>
          ))}
        </select>
      </div>

      {cargandoRecetas ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando recetas…
        </div>
      ) : prescripciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-400 italic">
          {pacienteId
            ? 'Este paciente todavía no tiene recetas emitidas.'
            : 'Elige un paciente para ver sus recetas.'}
        </div>
      ) : (
        <div className="space-y-4">
          {prescripciones.map((rx) => (
            <div
              key={rx.prescripcionId}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80 hover:border-slate-200 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 font-outfit text-base">
                    Receta #{rx.prescripcionId}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatearFechaHora(rx.fecha)} · {nombreDeMedicoQueReceta(rx)} · Consulta #
                    {rx.consultaId}
                  </p>
                </div>
                <button
                  onClick={() => handleAnular(rx.prescripcionId)}
                  aria-label={`Anular la receta ${rx.prescripcionId}`}
                  title="Anular receta"
                  className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {CABECERAS.map((h) => (
                        <th
                          key={h}
                          className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider pr-6"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rx.medicamentos.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 text-sm font-medium text-slate-800 pr-6">
                          {m.medicamento}
                        </td>
                        {/* dosis, frecuencia y duración son opcionales al
                            crear, así que vuelven null: `textoOpcional` evita
                            que la receta muestre «null» camino a la farmacia. */}
                        <td className="py-2.5 text-sm text-slate-600 pr-6 font-mono text-xs">
                          {textoOpcional(m.dosis)}
                        </td>
                        <td className="py-2.5 text-sm text-slate-600 pr-6">
                          {textoOpcional(m.frecuencia)}
                        </td>
                        <td className="py-2.5 text-sm text-slate-600">
                          {textoOpcional(m.duracion)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={emitiendo}
        onClose={() => setEmitiendo(false)}
        title="Nueva Prescripción"
        subtitle="Emisión de receta con dosificación e indicaciones"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
        maxWidth="xl"
      >
        <PrescriptionForm
          pacientes={pacientes}
          pacienteIdPorDefecto={pacienteId ? Number(pacienteId) : undefined}
          onCreada={handleEmitida}
          onCancel={() => setEmitiendo(false)}
        />
      </Modal>
    </div>
  )
}

/**
 * Mensaje que verá el usuario ante un fallo. Se conserva siempre el motivo del
 * error: `lib/api.ts` ya extrae el del backend y el servicio solo lo sustituye
 * cuando puede ser más preciso.
 */
function mensajeDe(causa: unknown, respaldo: string): string {
  return causa instanceof Error && causa.message ? causa.message : respaldo
}

/**
 * Igual que `mensajeDe`, pero anteponiendo QUÉ se estaba haciendo: en esta
 * pantalla se piden dos cosas distintas (el catálogo de pacientes y las
 * recetas del elegido) y «Error del servidor (500).» a secas no dice cuál
 * falló. Se AÑADE contexto, nunca se reemplaza el motivo.
 */
function describir(contexto: string, causa: unknown): string {
  const motivo = causa instanceof Error && causa.message ? causa.message : null
  return motivo ? `${contexto}: ${motivo}` : `${contexto}.`
}
