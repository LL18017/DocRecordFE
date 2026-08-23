'use client'

import React, { useId, useState } from 'react'
import { useAppContext } from '@/context/AppContext'
import {
  actualizarConsulta,
  crearConsulta,
  nombreDePaciente,
  puedeRegistrarDiagnostico,
  type ActualizarConsultaPayload,
  type ConsultaDto,
  type CrearConsultaPayload,
} from '@/services/consultas'

/**
 * Paciente como lo necesita este formulario: el `personaId` que viaja al
 * backend y lo que se lee en la lista. Se recibe ya resuelto en vez de
 * pedirlo aquí porque las pantallas que montan el formulario (consultas y el
 * expediente) ya tienen la lista cargada; volver a pedirla dispararía una
 * segunda petición por cada apertura del modal.
 */
export interface OpcionPaciente {
  personaId: number
  nombre: string
  expediente?: string | null
}

interface ConsultationFormProps {
  /** Pacientes elegibles. Se ignora al editar: una consulta no cambia de paciente. */
  pacientes: OpcionPaciente[]
  /** Preselección al registrar (p. ej. el expediente abierto). */
  pacienteIdPorDefecto?: number
  /** Consulta a editar. Ausente = alta nueva. */
  consulta?: ConsultaDto
  /** Se llama cuando el servidor confirmó el alta o la edición. */
  onGuardada: (consulta: ConsultaDto) => void
  onCancel: () => void
}

const campoBase =
  'border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-amber focus-visible:ring-2 focus-visible:ring-doc-amber/40'
const inputClass = `w-full ${campoBase}`
const textareaClass = `w-full ${campoBase} resize-none h-20`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const ConsultationForm: React.FC<ConsultationFormProps> = ({
  pacientes,
  pacienteIdPorDefecto,
  consulta,
  onGuardada,
  onCancel,
}) => {
  // Un prefijo por instancia: puede haber dos formularios montados a la vez
  // (alta y edición) y dos `id` iguales harían que la etiqueta del segundo
  // apunte al campo del primero.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const { user, activeClinic } = useAppContext()

  // Regla de negocio: el diagnóstico es exclusivo del médico. Sin sesión
  // legible se asume que NO se puede: es la suposición que no ofrece un campo
  // que el servidor vaya a rechazar.
  const puedeDiagnosticar = user ? puedeRegistrarDiagnostico(user.role) : false

  const editando = consulta !== undefined

  const [pacienteId, setPacienteId] = useState<string>(() => {
    if (consulta) return String(consulta.paciente.personaId)
    if (pacienteIdPorDefecto !== undefined) return String(pacienteIdPorDefecto)
    return pacientes[0] ? String(pacientes[0].personaId) : ''
  })
  // `motivo` puede venir null igual que `diagnostico` (la columna no lo exige
  // y el DTO de alta tampoco): el textarea necesita una cadena.
  const [motivo, setMotivo] = useState(consulta?.motivo ?? '')
  // `diagnostico` puede venir null (consulta todavía PENDIENTE): el textarea
  // necesita una cadena, así que el nulo se traduce aquí y no en el JSX.
  const [diagnostico, setDiagnostico] = useState(consulta?.diagnostico ?? '')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Cuerpo del alta. `fecha` se omite a propósito: la pone el servidor (ver el
   * docblock de `CrearConsultaPayload`).
   */
  const payloadDeAlta = (motivoLimpio: string, diagnosticoLimpio: string): CrearConsultaPayload => ({
    pacienteId: Number(pacienteId),
    motivo: motivoLimpio,
    // La sede es la que está activa en la sesión. Sin sede activa se OMITE el
    // campo: `clinicaId` es opcional en el contrato y mandar null —o un 0
    // inventado— sería peor que no mandarlo.
    ...(activeClinic ? { clinicaId: activeClinic.id } : {}),
    // Nunca se envía diagnóstico si el rol no puede escribirlo: aunque el
    // campo no se pinte, el estado podría arrastrar texto de un render
    // anterior y el backend respondería 403.
    ...(puedeDiagnosticar && diagnosticoLimpio ? { diagnostico: diagnosticoLimpio } : {}),
  })

  /**
   * Al editar se manda SOLO lo que cambió, que es lo que el `PUT` espera
   * («campo ausente = no lo toco»). `clinicaId` no viaja nunca aquí: la sede
   * activa de quien edita no tiene por qué ser donde se atendió, y mandarla
   * movería la consulta de clínica sin que nadie lo pidiera.
   */
  const cambiosDe = (
    original: ConsultaDto,
    motivoLimpio: string,
    diagnosticoLimpio: string,
  ): ActualizarConsultaPayload => {
    const cambios: ActualizarConsultaPayload = {}
    // Se compara contra `?? ''` —igual que el diagnóstico de la línea de
    // abajo— porque `original.motivo` puede ser null: comparar una cadena
    // contra null da «distinto» siempre, así que reabrir y guardar una
    // consulta sin motivo mandaba un `motivo` que nadie había tocado.
    if (motivoLimpio !== (original.motivo ?? '')) cambios.motivo = motivoLimpio
    if (puedeDiagnosticar && diagnosticoLimpio !== (original.diagnostico ?? '')) {
      cambios.diagnostico = diagnosticoLimpio
    }
    return cambios
  }

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    const motivoLimpio = motivo.trim()
    const diagnosticoLimpio = diagnostico.trim()
    if (!motivoLimpio) return
    if (!consulta && !pacienteId) return

    setError(null)
    setEnviando(true)
    try {
      const guardada = consulta
        ? await actualizarConsulta(
            consulta.consultaId,
            cambiosDe(consulta, motivoLimpio, diagnosticoLimpio),
          )
        : await crearConsulta(payloadDeAlta(motivoLimpio, diagnosticoLimpio))
      onGuardada(guardada)
    } catch (err) {
      // `lib/api.ts` ya redactó el motivo real del backend y los servicios
      // solo lo mejoran cuando pueden ser más precisos; sustituirlo aquí por
      // una frase fija taparía justo el dato útil. El genérico queda para lo
      // que no es un Error con mensaje.
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado al guardar la consulta.')
    } finally {
      setEnviando(false)
    }
  }

  const pacienteEditado = consulta ? nombreDePaciente(consulta) : null

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

      <div>
        {pacienteEditado ? (
          // Al editar el paciente no se elige: se muestra para dar contexto.
          // Aquí no hay control que etiquetar, así que el rótulo es un <span>:
          // un `<label htmlFor>` apuntando a un <p> es una etiqueta rota —el
          // navegador no la asocia a nada y el clic no enfoca nada—, y de paso
          // hacía que `getByLabelText('Paciente')` devolviera un párrafo.
          <>
            <span className={labelClass}>Paciente</span>
            <p className="rounded-xl border-2 border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
              {pacienteEditado}
            </p>
          </>
        ) : (
          <>
            <label htmlFor={id('paciente')} className={labelClass}>
              Paciente
              <Obligatorio />
            </label>
            <select
              id={id('paciente')}
              required
              value={pacienteId}
              onChange={(e) => setPacienteId(e.target.value)}
              className={inputClass}
            >
              {pacientes.length === 0 && <option value="">No hay pacientes registrados</option>}
              {pacientes.map((p) => (
                <option key={p.personaId} value={String(p.personaId)}>
                  {p.expediente ? `${p.nombre} (${p.expediente})` : p.nombre}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div>
        <label htmlFor={id('motivo')} className={labelClass}>
          Motivo de consulta
          <Obligatorio />
        </label>
        <textarea
          id={id('motivo')}
          required
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Describa el motivo principal de la visita médica..."
          className={textareaClass}
        />
      </div>

      {/* El diagnóstico solo existe para quien puede escribirlo. Ofrecérselo a
          una enfermera sería pedirle que redacte algo que el backend va a
          rechazar con un 403 al guardar. */}
      {puedeDiagnosticar ? (
        <div>
          <label htmlFor={id('diagnostico')} className={labelClass}>
            Diagnóstico
          </label>
          <textarea
            id={id('diagnostico')}
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            placeholder="Diagnóstico clínico, CIE-10 u observaciones diagnósticas..."
            aria-describedby={id('diagnostico-ayuda')}
            className={textareaClass}
          />
          <p id={id('diagnostico-ayuda')} className="text-xs text-slate-400 mt-1">
            Puede dejarse en blanco y completarse cuando la consulta se finalice.
          </p>
        </div>
      ) : (
        <p className="rounded-xl border-2 border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
          El diagnóstico lo registra el médico responsable; desde este perfil se puede
          consultar, pero no escribir.
        </p>
      )}

      <p className="text-xs text-slate-400">
        Los medicamentos se recetan desde Prescripciones, sobre la consulta ya registrada.
      </p>

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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-amber hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar consulta'}
        </button>
      </div>
    </form>
  )
}
