'use client'

import React, { useId, useMemo, useState } from 'react'
import type { RegistrarSignosVitalesPayload } from '@/services/signosVitales'
import {
  LIMITES_FISIOLOGICOS,
  fueraDeRangoNormal,
  rangoNormalComoTexto,
  type ClaveDeMedida,
} from '@/lib/rangosVitales'

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
 * ── Dos avisos distintos junto a cada campo ──────────────────────────────
 * 1. FUERA DEL RANGO NORMAL (ámbar, HU-16 criterio 2): el valor es posible pero
 *    inusual —40 °C de temperatura, una saturación de 88 %—. Se ADVIERTE y se
 *    deja guardar: un paciente realmente puede llegar así, y un formulario que
 *    lo rechaza por «imposible» obliga a la enfermera a falsear el dato.
 * 2. FUERA DEL LÍMITE FISIOLÓGICO (rojo, HU-17 criterio 3): el valor no puede
 *    ser real —un peso de 500 kg, una talla de 300 cm—, casi siempre es la coma
 *    corrida de sitio. Eso sí BLOQUEA el envío, con el mismo rango que el
 *    servidor rechaza con 400, para que la enfermera lo corrija antes de ir y
 *    volver. El `<input type="number">` no impide teclear el número, así que lo
 *    que se impide es enviarlo y se le dice por qué.
 *
 * Los rangos de ambos salen de `@/lib/rangosVitales`, el único lugar donde se
 * definen.
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
 * Las medidas: clave del estado, rótulo, ejemplo y paso del campo.
 *
 * Los límites (mín. y máx.) NO se escriben aquí: salen de `LIMITES_FISIOLOGICOS`
 * para que haya un solo sitio donde cambiarlos. `nombre` es la frase con que el
 * mensaje de error nombra la medida («El peso debe estar entre…»).
 */
const MEDIDAS: {
  clave: ClaveDeMedida
  label: string
  nombre: string
  unidad: string
  ejemplo: string
  paso: string
}[] = [
  { clave: 'pesoKg', label: 'Peso (kg)', nombre: 'El peso', unidad: 'kg', ejemplo: '68.4', paso: '0.01' },
  { clave: 'estaturaCm', label: 'Talla (cm)', nombre: 'La talla', unidad: 'cm', ejemplo: '162', paso: '0.01' },
  { clave: 'temperaturaC', label: 'Temperatura (°C)', nombre: 'La temperatura', unidad: '°C', ejemplo: '36.8', paso: '0.1' },
  { clave: 'presionSistolica', label: 'Presión sistólica (mmHg)', nombre: 'La presión sistólica', unidad: 'mmHg', ejemplo: '120', paso: '1' },
  { clave: 'presionDiastolica', label: 'Presión diastólica (mmHg)', nombre: 'La presión diastólica', unidad: 'mmHg', ejemplo: '80', paso: '1' },
  { clave: 'pulsoLpm', label: 'Pulso (lpm)', nombre: 'El pulso', unidad: 'lpm', ejemplo: '74', paso: '1' },
  { clave: 'frecuenciaRespRpm', label: 'Frecuencia resp. (rpm)', nombre: 'La frecuencia respiratoria', unidad: 'rpm', ejemplo: '16', paso: '1' },
  { clave: 'saturacionPct', label: 'Saturación O₂ (%)', nombre: 'La saturación', unidad: '%', ejemplo: '98', paso: '1' },
]

/**
 * Qué decirle a la enfermera sobre lo que escribió en una casilla.
 *
 *   · `error`: fuera del límite fisiológico, el servidor lo rechazaría. Bloquea.
 *   · `aviso`: dentro de lo posible pero fuera del rango normal. No bloquea.
 *   · `null`: casilla vacía (no se tomó) o valor normal.
 */
function evaluarCasilla(
  { clave, nombre, unidad }: (typeof MEDIDAS)[number],
  texto: string,
): { tipo: 'error' | 'aviso'; mensaje: string } | null {
  if (texto.trim() === '') return null

  const valor = Number(texto)
  const { min, max } = LIMITES_FISIOLOGICOS[clave]

  if (Number.isNaN(valor) || valor < min || valor > max) {
    return { tipo: 'error', mensaje: `${nombre} debe estar entre ${min} y ${max} ${unidad}.` }
  }
  if (fueraDeRangoNormal(clave, valor)) {
    return {
      tipo: 'aviso',
      mensaje: `Fuera del rango normal (${rangoNormalComoTexto(clave)}). Puede guardarla de todos modos.`,
    }
  }
  return null
}

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

  // Lo que se le dice de cada casilla. Se calcula al vuelo en cada pulsación:
  // el aviso tiene que aparecer mientras escribe, no al enviar.
  const evaluaciones = useMemo(
    () => MEDIDAS.map((m) => ({ medida: m, resultado: evaluarCasilla(m, medidas[m.clave]) })),
    [medidas],
  )
  const hayError = evaluaciones.some((e) => e.resultado?.tipo === 'error')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // `hayError` repite la guarda del botón: se puede enviar con Enter desde un
    // campo, y ahí el botón deshabilitado no frena nada.
    if (!pacienteId || !algunaMedida || hayError || guardando) return

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
    // `noValidate`: los mensajes de los límites los da el propio formulario, en
    // español y junto al campo. Con la validación nativa, el navegador pondría
    // su globo en otro idioma y sin distinguir el aviso del error.
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
        {evaluaciones.map(({ medida: { clave, label, ejemplo, paso }, resultado }) => {
          const { min, max } = LIMITES_FISIOLOGICOS[clave]
          const idMensaje = id(`${clave}-mensaje`)
          return (
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
                aria-invalid={resultado?.tipo === 'error' ? true : undefined}
                aria-describedby={resultado ? idMensaje : undefined}
                className={`${campoCortoClass} ${
                  resultado?.tipo === 'error'
                    ? 'border-red-400'
                    : resultado?.tipo === 'aviso'
                      ? 'border-amber-400'
                      : ''
                }`}
              />
              {/* Error (rojo, bloquea) o aviso (ámbar, no bloquea): el texto lo
                  dice con palabras, no solo con el color. */}
              {resultado && (
                <p
                  id={idMensaje}
                  role={resultado.tipo === 'error' ? 'alert' : 'status'}
                  className={`mt-1 text-[11px] leading-snug ${
                    resultado.tipo === 'error' ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  {resultado.mensaje}
                </p>
              )}
            </div>
          )
        })}
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

      {hayError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800">
          Hay valores que no pueden ser reales (suele ser la coma corrida de sitio). Corríjalos
          para poder guardar.
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
          disabled={guardando || !algunaMedida || !pacienteId || hayError}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-teal hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar Registro'}
        </button>
      </div>
    </form>
  )
}
