'use client'

import React, { useId, useMemo, useState } from 'react'
import type { RegistrarSignosVitalesPayload } from '@/services/signosVitales'

/**
 * Toma de constantes. Lo llena enfermería, antes de la consulta.
 *
 * ── Dos cosas que este formulario TENÍA y se quitaron ──────────────────────
 *
 * 1. Venía PRECARGADO: peso 72, talla 175, temperatura 36.8, presión 120/80,
 *    pulso 78, respiración 16, saturación 98. Una enfermera que abriera el
 *    modal y pulsara «Guardar» sin tocar nada dejaba en el expediente siete
 *    constantes que nadie tomó, con aspecto de medidas reales. Es el mismo
 *    defecto que el expediente ya corrigió al dejar de inventar alergias, solo
 *    que aquí el dato falso lo firma una persona real.
 *
 *    Ahora los campos nacen vacíos y el envío exige al menos una medida —la
 *    misma regla que impone el backend, que responde 400 a una toma sin
 *    ninguna—. Vacío significa «no se tomó», y así viaja: como ausencia, no
 *    como cero.
 *
 * 2. Tenía un campo de texto «Enfermera responsable», por defecto «Enf. María
 *    López», una enfermera que no existe. Quien firma la toma sale del token
 *    en el backend y no del cuerpo de la petición, exactamente igual que el
 *    médico de una consulta: un campo libre aquí permitiría atribuirle una
 *    presión arterial a cualquier compañera.
 *
 * ── Por qué la presión va en dos casillas ─────────────────────────────────
 * «120/80» es un par de números que la costumbre escribe con una barra, no un
 * dato único. El backend guarda dos columnas para poder preguntar «quiénes
 * tienen la sistólica sobre 140»; pedirlo como texto obligaría a parsear aquí
 * una cadena que el usuario puede escribir de seis maneras.
 */

/** Paciente al que se le pueden tomar constantes. */
export interface PacienteParaToma {
  personaId: number
  nombre: string
  expediente: string
}

interface VitalsFormProps {
  /**
   * A quién se le pueden tomar constantes. Puede venir vacío si el paciente ya
   * está fijado por `defaultPacienteId`: entonces no se pinta el desplegable,
   * porque un rótulo «Paciente» sin control detrás es una etiqueta rota.
   */
  pacientes?: PacienteParaToma[]
  defaultPacienteId?: number
  onSubmit: (payload: RegistrarSignosVitalesPayload) => void
  onCancel: () => void
  /** Deshabilita el envío mientras la petición está en vuelo. */
  guardando?: boolean
  /** Error devuelto por el backend, para mostrarlo junto al formulario. */
  error?: string | null
}

const anillo = 'focus-visible:ring-2 focus-visible:ring-doc-teal/40'
const campoAnchoClass = `w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-teal ${anillo} bg-white`
const campoCortoClass = `w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-doc-teal ${anillo} transition-colors bg-white`
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'
const labelCortoClass = 'block text-xs font-semibold text-slate-500 mb-1'

/**
 * Las medidas: clave del estado, rótulo, ejemplo y rango.
 *
 * Los mínimos y máximos son los MISMOS que los CHECK de la migración V9 y las
 * validaciones del DTO. No son validación de formato sino de plausibilidad
 * fisiológica: no existe un ser humano a 90 grados. Repetirlos aquí no
 * sustituye a los del backend —quien manda es él—, sino que evita un viaje de
 * ida y vuelta para decirle a la enfermera lo que se puede saber en la propia
 * pantalla.
 */
const MEDIDAS = [
  { clave: 'pesoKg', label: 'Peso (kg)', ejemplo: '68.4', min: 0.1, max: 500, paso: '0.01' },
  { clave: 'estaturaCm', label: 'Talla (cm)', ejemplo: '162', min: 0.1, max: 300, paso: '0.01' },
  { clave: 'temperaturaC', label: 'Temperatura (°C)', ejemplo: '36.8', min: 25, max: 45, paso: '0.1' },
  { clave: 'presionSistolica', label: 'Presión sistólica (mmHg)', ejemplo: '120', min: 40, max: 300, paso: '1' },
  { clave: 'presionDiastolica', label: 'Presión diastólica (mmHg)', ejemplo: '80', min: 20, max: 200, paso: '1' },
  { clave: 'pulsoLpm', label: 'Pulso (lpm)', ejemplo: '74', min: 20, max: 300, paso: '1' },
  { clave: 'frecuenciaRespRpm', label: 'Frecuencia resp. (rpm)', ejemplo: '16', min: 4, max: 90, paso: '1' },
  { clave: 'saturacionPct', label: 'Saturación O₂ (%)', ejemplo: '98', min: 50, max: 100, paso: '1' },
] as const

type ClaveDeMedida = (typeof MEDIDAS)[number]['clave']

export const VitalsForm: React.FC<VitalsFormProps> = ({
  pacientes = [],
  defaultPacienteId,
  onSubmit,
  onCancel,
  guardando = false,
  error = null,
}) => {
  // El desplegable solo tiene sentido si hay a quién elegir. Con el paciente
  // ya fijado no se pinta, en vez de dejar un select de una sola opción -o,
  // peor, un rótulo sin control.
  const eligePaciente = pacientes.length > 0
  // Un prefijo por instancia: nada impide que una pantalla monte este
  // componente dos veces, y con ids fijos la etiqueta del segundo apuntaría al
  // campo del primero. En una toma de constantes, escribir el peso en la
  // casilla del pulso no es un detalle estético.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  // SIN paciente preseleccionado. Antes caía en `pacientes[0]`, es decir en
  // quien el catálogo pusiera primero, y esa es la clase de valor por defecto
  // que termina en el expediente equivocado: quien abre el modal con el
  // tensiómetro en la mano ve un nombre ya escrito, escribe las medidas y
  // guarda sin releer el desplegable. Una toma en la ficha de otro paciente no
  // se distingue después de una real.
  //
  // `defaultPacienteId` sí se respeta, y no es lo mismo: ahí el paciente viene
  // de dónde se abrió el formulario -su propio expediente-, no del orden de
  // una lista.
  const [pacienteId, setPacienteId] = useState<string>(
    defaultPacienteId !== undefined ? String(defaultPacienteId) : '',
  )

  // Todo vacío. Ver el comentario de cabecera: un valor por defecto aquí es un
  // dato clínico inventado.
  const [medidas, setMedidas] = useState<Record<ClaveDeMedida, string>>({
    pesoKg: '',
    estaturaCm: '',
    temperaturaC: '',
    presionSistolica: '',
    presionDiastolica: '',
    pulsoLpm: '',
    frecuenciaRespRpm: '',
    saturacionPct: '',
  })
  const [observaciones, setObservaciones] = useState('')

  const algunaMedida = useMemo(
    () => Object.values(medidas).some((v) => v.trim() !== ''),
    [medidas],
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!pacienteId || !algunaMedida || guardando) return

    const payload: RegistrarSignosVitalesPayload = { pacienteId: Number(pacienteId) }

    // Solo viajan las medidas que se escribieron. Una casilla vacía se OMITE
    // del cuerpo en vez de mandarse como 0 o como null explícito: el backend
    // distingue «no se tomó» de un valor, y esa distinción es la que separa un
    // hueco de una urgencia.
    for (const { clave } of MEDIDAS) {
      const texto = medidas[clave].trim()
      if (texto !== '') payload[clave] = Number(texto)
    }
    if (observaciones.trim() !== '') payload.observaciones = observaciones.trim()

    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {eligePaciente && (
        <div>
          <label htmlFor={id('paciente')} className={labelClass}>
            Paciente
          </label>
          <select
            id={id('paciente')}
            required
            value={pacienteId}
            onChange={(e) => setPacienteId(e.target.value)}
            className={campoAnchoClass}
          >
            {/* La opción vacía es la que obliga a elegir a conciencia. Con
                `required`, el navegador no deja enviar mientras siga puesta. */}
            <option value="">Selecciona un paciente…</option>
            {pacientes.map((p) => (
              <option key={p.personaId} value={p.personaId}>
                {p.nombre} ({p.expediente})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {MEDIDAS.map(({ clave, label, ejemplo, min, max, paso }) => (
          <div key={clave}>
            <label htmlFor={id(clave)} className={labelCortoClass}>
              {label}
            </label>
            <input
              id={id(clave)}
              type="number"
              inputMode="decimal"
              step={paso}
              min={min}
              max={max}
              placeholder={ejemplo}
              value={medidas[clave]}
              onChange={(e) => setMedidas((prev) => ({ ...prev, [clave]: e.target.value }))}
              className={campoCortoClass}
            />
          </div>
        ))}
      </div>

      <div>
        <label htmlFor={id('observaciones')} className={labelClass}>
          Observaciones
        </label>
        <textarea
          id={id('observaciones')}
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Lo que note al tomar las constantes"
          className={campoAnchoClass}
        />
      </div>

      {/* Se dice por qué no se puede guardar ANTES de que lo intente, en vez de
          dejar el botón muerto sin explicación. */}
      {!algunaMedida && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
          Escriba al menos una medida. Las casillas vacías se guardan como «no se tomó», nunca
          como cero, así que no hace falta rellenar las que no midió.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800"
        >
          {error}
        </p>
      )}

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
          disabled={guardando || !algunaMedida || !pacienteId}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-teal hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar Registro'}
        </button>
      </div>
    </form>
  )
}
