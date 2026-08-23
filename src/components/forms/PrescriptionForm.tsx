'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  formatearFechaHora,
  listarConsultas,
  type ConsultaDto,
} from '@/services/consultas'
import {
  crearPrescripcion,
  normalizarMedicamentos,
  MENSAJE_RECETA_VACIA,
  type MedicamentoPayload,
  type PrescripcionDto,
} from '@/services/prescripciones'
import type { OpcionPaciente } from './ConsultationForm'

interface PrescriptionFormProps {
  /** Pacientes elegibles. Se ignora si la receta ya nace atada a una consulta. */
  pacientes: OpcionPaciente[]
  /** Consulta fija: emitir la receta desde una consulta concreta. */
  consulta?: ConsultaDto
  /** Preselección del paciente cuando no hay consulta fija. */
  pacienteIdPorDefecto?: number
  /** Se llama cuando el servidor confirmó la emisión. */
  onCreada: (prescripcion: PrescripcionDto) => void
  onCancel: () => void
}

/** Línea del formulario. Todo cadena: es lo que devuelven los `input`. */
interface LineaMedicamento {
  medicamento: string
  dosis: string
  frecuencia: string
  duracion: string
}

const LINEA_VACIA: LineaMedicamento = {
  medicamento: '',
  dosis: '',
  frecuencia: '',
  duracion: '',
}

const campoBase =
  'border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40'
const inputClass = `w-full ${campoBase}`
const inputLineaClass =
  'w-full border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40'
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

/** Cómo se lee una consulta en la lista desplegable. */
function etiquetaDeConsulta(c: ConsultaDto): string {
  return `${formatearFechaHora(c.fecha)} · ${c.motivo}`
}

export const PrescriptionForm: React.FC<PrescriptionFormProps> = ({
  pacientes,
  consulta,
  pacienteIdPorDefecto,
  onCreada,
  onCancel,
}) => {
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const [pacienteId, setPacienteId] = useState<string>(() => {
    if (pacienteIdPorDefecto !== undefined) return String(pacienteIdPorDefecto)
    return pacientes[0] ? String(pacientes[0].personaId) : ''
  })

  // Una receta cuelga siempre de una consulta, así que hay que elegir cuál.
  // Con `consulta` fija no se pide nada: ni la lista ni el desplegable.
  const [consultas, setConsultas] = useState<ConsultaDto[]>([])
  const [consultaId, setConsultaId] = useState<string>(
    consulta ? String(consulta.consultaId) : '',
  )
  const [cargandoConsultas, setCargandoConsultas] = useState(consulta === undefined)
  const [errorConsultas, setErrorConsultas] = useState<string | null>(null)

  const [lineas, setLineas] = useState<LineaMedicamento[]>([{ ...LINEA_VACIA }])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Trae las consultas del paciente elegido y preselecciona la más reciente
   * (el backend las devuelve en ese orden), que es casi siempre la que se está
   * recetando. No se preselecciona nada si la lista viene vacía: sin consulta
   * no hay receta posible, y el formulario lo dice en vez de dejar un
   * desplegable que parece elegible.
   */
  const cargarConsultas = useCallback(async (idPaciente: string) => {
    if (!idPaciente) {
      setConsultas([])
      setConsultaId('')
      setCargandoConsultas(false)
      return
    }
    try {
      const lista = await listarConsultas(Number(idPaciente))
      setConsultas(lista)
      setConsultaId(lista[0] ? String(lista[0].consultaId) : '')
      setErrorConsultas(null)
    } catch (err) {
      setConsultas([])
      setConsultaId('')
      setErrorConsultas(
        err instanceof Error ? err.message : 'No se pudieron cargar las consultas del paciente.',
      )
    } finally {
      setCargandoConsultas(false)
    }
  }, [])

  // Mismo caso que en la pantalla de pacientes: la regla
  // react-hooks/set-state-in-effect rastrea los setState que ocurren tras el
  // await, pero aquí no hay render en cascada —el estado se escribe cuando la
  // respuesta llega, no durante el render—. Es el patrón «cargar datos
  // remotos al montar» que la regla no puede modelar; se desactiva acotado.
  useEffect(() => {
    if (consulta) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarConsultas(pacienteId)
  }, [cargarConsultas, consulta, pacienteId])

  const handlePacienteChange = (valor: string) => {
    setPacienteId(valor)
    setCargandoConsultas(true)
    setConsultaId('')
  }

  const actualizarLinea = (indice: number, cambios: Partial<LineaMedicamento>) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, ...cambios } : l)))
  }

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Regla de negocio: una receta sin medicamentos no es una receta. Se
    // comprueba con `normalizarMedicamentos`, el mismo criterio que aplica el
    // servicio, para que «tres líneas en blanco» cuente como cero y no como
    // tres. El aviso se muestra en vez de deshabilitar el botón: un botón
    // apagado sin explicación deja al médico adivinando qué le falta.
    const medicamentos: MedicamentoPayload[] = normalizarMedicamentos(lineas)
    if (medicamentos.length === 0) {
      setError(MENSAJE_RECETA_VACIA)
      return
    }
    if (!consultaId) {
      setError('Elige la consulta a la que pertenece esta receta.')
      return
    }

    setError(null)
    setEnviando(true)
    try {
      const emitida = await crearPrescripcion({
        consultaId: Number(consultaId),
        medicamentos,
      })
      onCreada(emitida)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ocurrió un error inesperado al emitir la receta.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {error && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
        >
          {error}
        </p>
      )}

      {consulta ? (
        <div>
          <span className={labelClass}>Consulta</span>
          <p className="rounded-xl border-2 border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
            {etiquetaDeConsulta(consulta)}
          </p>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={id('paciente')} className={labelClass}>
              Paciente
              <Obligatorio />
            </label>
            <select
              id={id('paciente')}
              required
              value={pacienteId}
              onChange={(e) => handlePacienteChange(e.target.value)}
              className={inputClass}
            >
              {pacientes.length === 0 && <option value="">No hay pacientes registrados</option>}
              {pacientes.map((p) => (
                <option key={p.personaId} value={String(p.personaId)}>
                  {p.expediente ? `${p.nombre} (${p.expediente})` : p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={id('consulta')} className={labelClass}>
              Consulta
              <Obligatorio />
            </label>
            <select
              id={id('consulta')}
              required
              value={consultaId}
              onChange={(e) => setConsultaId(e.target.value)}
              disabled={cargandoConsultas || consultas.length === 0}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            >
              {cargandoConsultas && <option value="">Cargando consultas…</option>}
              {!cargandoConsultas && consultas.length === 0 && (
                <option value="">Este paciente no tiene consultas registradas</option>
              )}
              {consultas.map((c) => (
                <option key={c.consultaId} value={String(c.consultaId)}>
                  {etiquetaDeConsulta(c)}
                </option>
              ))}
            </select>
            {errorConsultas ? (
              <p role="alert" className="text-xs text-red-600 mt-1">
                {errorConsultas}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Toda receta pertenece a una consulta; si no aparece ninguna, regístrala primero.
              </p>
            )}
          </div>
        </>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={`${labelClass} mb-0`}>Medicamentos</span>
          <button
            type="button"
            onClick={() => setLineas((prev) => [...prev, { ...LINEA_VACIA }])}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer"
          >
            <Icon name="add" size={12} color="#7C3AED" /> Agregar medicamento
          </button>
        </div>

        <div className="space-y-2">
          {lineas.map((linea, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70"
            >
              <div className="col-span-2">
                <label htmlFor={id(`medicamento-${i}`)} className="sr-only">
                  Medicamento {i + 1}
                </label>
                <input
                  id={id(`medicamento-${i}`)}
                  placeholder="Medicamento (ej: Amoxicilina)"
                  value={linea.medicamento}
                  onChange={(e) => actualizarLinea(i, { medicamento: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              <div>
                <label htmlFor={id(`dosis-${i}`)} className="sr-only">
                  Dosis del medicamento {i + 1}
                </label>
                <input
                  id={id(`dosis-${i}`)}
                  placeholder="Dosis (500 mg)"
                  value={linea.dosis}
                  onChange={(e) => actualizarLinea(i, { dosis: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              <div>
                <label htmlFor={id(`frecuencia-${i}`)} className="sr-only">
                  Frecuencia del medicamento {i + 1}
                </label>
                <input
                  id={id(`frecuencia-${i}`)}
                  placeholder="Frecuencia (cada 8 h)"
                  value={linea.frecuencia}
                  onChange={(e) => actualizarLinea(i, { frecuencia: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              <div className={lineas.length > 1 ? '' : 'col-span-2'}>
                <label htmlFor={id(`duracion-${i}`)} className="sr-only">
                  Duración del medicamento {i + 1}
                </label>
                <input
                  id={id(`duracion-${i}`)}
                  placeholder="Duración (7 días)"
                  value={linea.duracion}
                  onChange={(e) => actualizarLinea(i, { duracion: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              {lineas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Quitar el medicamento ${i + 1}`}
                  className="flex items-center justify-center border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors bg-white cursor-pointer"
                >
                  <Icon name="delete" size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-2">
          Dosis, frecuencia y duración son opcionales; lo que se deje en blanco no se guarda.
        </p>
      </div>

      {/* Sin campo de «indicaciones adicionales»: el contrato de
          `POST /prescripciones` no lo tiene, así que lo que se escribiera ahí
          se perdería al enviar. La maqueta lo ofrecía y no guardaba nada. */}

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {enviando ? 'Emitiendo…' : 'Emitir prescripción'}
        </button>
      </div>
    </form>
  )
}
