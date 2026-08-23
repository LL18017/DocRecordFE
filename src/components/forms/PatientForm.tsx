'use client'

import React, { useId, useState } from 'react'
import { ApiError } from '@/lib/api'
import { buscarPersonaPorDui, type PersonaDto } from '@/services/personas'
import { crearPaciente, type CrearPacientePayload, type PacienteDto } from '@/services/pacientes'

interface PatientFormProps {
  /** Se llama cuando `POST /pacientes` responde con éxito. */
  onCreated: (paciente: PacienteDto) => void
  onCancel: () => void
}

// Clases compartidas de los controles. `focus-visible:ring-*` acompaña al
// `focus:outline-none`: quitar el contorno del navegador sin reponer nada deja
// a quien navega con teclado sin saber dónde está parado.
const campoBase =
  'border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'
const inputClass = `w-full ${campoBase}`
const textareaClass = `w-full ${campoBase} resize-none h-20`
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

/**
 * Cómo describir a alguien que ya existe, según los roles que ya tiene.
 *
 * Usa sustantivos invariables ("personal médico/de enfermería") en vez de
 * "médico/médica" o "enfermero/enfermera": `sexo` puede venir `null` (p. ej.
 * el de una persona recién registrada como médico), y adivinar el género por
 * el nombre no es una opción.
 */
function describirRegistroPrevio(p: PersonaDto): string {
  if (p.esMedico && p.esEnfermera) return 'ya figura en el sistema como personal médico y de enfermería'
  if (p.esMedico) return 'ya figura en el sistema como personal médico'
  if (p.esEnfermera) return 'ya figura en el sistema como personal de enfermería'
  return 'ya existe en el sistema'
}

function formatearSexo(s: 'M' | 'F' | null): string {
  if (s === 'M') return 'Masculino'
  if (s === 'F') return 'Femenino'
  return '—'
}

export const PatientForm: React.FC<PatientFormProps> = ({ onCreated, onCancel }) => {
  // Un prefijo por instancia: la página de pacientes puede tener el modal de
  // alta abierto mientras otro formulario sigue montado, y dos `id` iguales
  // hacen que la etiqueta del segundo apunte al campo del primero.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const [step, setStep] = useState(1)

  // ── Paso 1: identidad (búsqueda por DUI antes que nada) ──
  const [dui, setDui] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [busquedaHecha, setBusquedaHecha] = useState(false)
  const [personaExistente, setPersonaExistente] = useState<PersonaDto | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)

  // Solo se usan si la búsqueda no encontró a nadie con ese DUI.
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [sexo, setSexo] = useState<'M' | 'F'>('M')

  // Se piden siempre, exista o no la persona.
  const [tipoSangre, setTipoSangre] = useState('O+')

  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  // ── Paso 2: historial clínico inicial (aún no se envía a ningún endpoint) ──
  const [allergies, setAllergies] = useState('')
  const [chronic, setChronic] = useState('')
  const [hereditary, setHereditary] = useState('')

  // ── Paso 3: signos vitales de ingreso (aún no se envía a ningún endpoint) ──
  const [vitals, setVitals] = useState({
    weight: '70',
    height: '170',
    temp: '36.5',
    bp: '120/80',
    pulse: '75',
    sat: '98',
  })

  const handleBuscarDui = async () => {
    if (!dui.trim()) return
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const persona = await buscarPersonaPorDui(dui.trim())
      setPersonaExistente(persona)
      setBusquedaHecha(true)
    } catch (err) {
      setBusquedaHecha(false)
      setErrorBusqueda(
        err instanceof ApiError ? err.message : 'No se pudo consultar el DUI. Intenta de nuevo.',
      )
    } finally {
      setBuscando(false)
    }
  }

  const handleDuiChange = (value: string) => {
    setDui(value)
    // Cualquier cambio al DUI invalida la búsqueda anterior: hay que repetirla.
    setBusquedaHecha(false)
    setPersonaExistente(null)
    setErrorBusqueda(null)
  }

  const puedeAvanzarDesdePaso1 =
    busquedaHecha &&
    (personaExistente
      ? !personaExistente.esPaciente && (personaExistente.fechaNacimiento !== null || fechaNacimiento !== '')
      : nombres.trim() !== '' && apellidos.trim() !== '' && fechaNacimiento !== '')

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (step === 1 && !puedeAvanzarDesdePaso1) return

    if (step < 3) {
      setStep((s) => s + 1)
      return
    }

    setErrorEnvio(null)
    setEnviando(true)
    try {
      const payload: CrearPacientePayload = personaExistente
        ? {
            persona: {
              personaId: personaExistente.personaId,
              // Solo se manda lo que a esta persona le faltaba; completar
              // nunca borra lo que ya tenía. El DUI no se reenvía: no se
              // puede editar al reutilizar una persona ya encontrada.
              ...(personaExistente.fechaNacimiento === null ? { fechaNacimiento } : {}),
              ...(personaExistente.sexo === null ? { sexo } : {}),
            },
            tipoSangre,
          }
        : {
            persona: {
              dui: dui.trim(),
              nombres,
              apellidos,
              fechaNacimiento,
              sexo,
              telefono: telefono.trim() || undefined,
              direccion: direccion.trim() || undefined,
            },
            tipoSangre,
          }

      const paciente = await crearPaciente(payload)
      onCreated(paciente)
    } catch (err) {
      setErrorEnvio(
        err instanceof ApiError ? err.message : 'Ocurrió un error inesperado al guardar el paciente.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-doc-blue">
              Paso 1: Identidad del Paciente
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-doc-blue">1 de 3</span>
          </div>

          <div>
            <label htmlFor={id('dui')} className={labelClass}>
              Identificación (DUI)<Obligatorio />
            </label>
            <div className="flex gap-2">
              <input
                id={id('dui')}
                required
                value={dui}
                onChange={(e) => handleDuiChange(e.target.value)}
                placeholder="01234567-8"
                // El error de la búsqueda lo provoca este campo: enlazarlo hace
                // que el lector de pantalla lo lea al enfocarlo, no solo una vez
                // al aparecer.
                aria-invalid={errorBusqueda ? true : undefined}
                aria-describedby={
                  errorBusqueda ? `${id('dui-error')} ${id('dui-ayuda')}` : id('dui-ayuda')
                }
                className={`flex-1 ${campoBase}`}
              />
              <button
                type="button"
                disabled={!dui.trim() || buscando}
                onClick={handleBuscarDui}
                className="px-5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            <p id={id('dui-ayuda')} className="text-xs text-slate-400 mt-1">
              Se busca primero por DUI para no duplicar a alguien que ya existe en el sistema.
            </p>
          </div>

          {errorBusqueda && (
            <p
              id={id('dui-error')}
              role="alert"
              className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
            >
              {errorBusqueda}
            </p>
          )}

          {busquedaHecha && personaExistente && (
            <>
              <div
                className={`rounded-xl border-2 px-4 py-3 text-sm ${
                  personaExistente.esPaciente
                    ? 'border-amber-100 bg-amber-50 text-amber-800'
                    : 'border-blue-100 bg-blue-50 text-blue-800'
                }`}
              >
                <span className="font-semibold">
                  {personaExistente.nombres} {personaExistente.apellidos}
                </span>{' '}
                {personaExistente.esPaciente
                  ? 'ya tiene un expediente de paciente registrado. No se puede crear uno duplicado.'
                  : `${describirRegistroPrevio(personaExistente)}. ¿Agregarla también como paciente?`}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-xl border border-slate-100 p-3">
                {[
                  ['Teléfono', personaExistente.telefono || '—'],
                  ['Dirección', personaExistente.direccion || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="block text-xs text-slate-400 uppercase tracking-wide">{k}</span>
                    <span className="font-medium text-slate-700">{v}</span>
                  </div>
                ))}
              </div>

              {!personaExistente.esPaciente && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    {/* Si la persona ya tiene fecha, aquí no hay control que
                        etiquetar: un `<label>` suelto es una etiqueta rota. */}
                    {personaExistente.fechaNacimiento !== null ? (
                      <>
                        <span className={labelClass}>Fecha de nacimiento</span>
                        <p className="text-sm font-medium text-slate-700 px-3.5 py-2.5">
                          {personaExistente.fechaNacimiento}
                        </p>
                      </>
                    ) : (
                      <>
                        <label htmlFor={id('fecha-nacimiento')} className={labelClass}>
                          Fecha de nacimiento<Obligatorio />
                        </label>
                        <input
                          id={id('fecha-nacimiento')}
                          required
                          type="date"
                          value={fechaNacimiento}
                          onChange={(e) => setFechaNacimiento(e.target.value)}
                          className={inputClass}
                        />
                      </>
                    )}
                  </div>
                  <div>
                    {personaExistente.sexo !== null ? (
                      <>
                        <span className={labelClass}>Sexo</span>
                        <p className="text-sm font-medium text-slate-700 px-3.5 py-2.5">
                          {formatearSexo(personaExistente.sexo)}
                        </p>
                      </>
                    ) : (
                      <>
                        <span id={id('sexo-existente-label')} className={labelClass}>
                          Sexo<Obligatorio />
                        </span>
                        <div
                          role="radiogroup"
                          aria-labelledby={id('sexo-existente-label')}
                          className="flex gap-4 pt-2.5"
                        >
                          {([['M', 'Masculino'], ['F', 'Femenino']] as const).map(([valor, label]) => (
                            <label
                              key={valor}
                              className="flex items-center gap-2 cursor-pointer text-sm text-slate-700"
                            >
                              <input
                                type="radio"
                                name={id('sexo-existente')}
                                checked={sexo === valor}
                                onChange={() => setSexo(valor)}
                                className="text-doc-blue"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {busquedaHecha && personaExistente === null && (
            <>
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5">
                No se encontró ninguna persona con ese DUI. Completa sus datos para crear su registro.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor={id('nombres')} className={labelClass}>
                    Nombres<Obligatorio />
                  </label>
                  <input
                    id={id('nombres')}
                    required
                    value={nombres}
                    onChange={(e) => setNombres(e.target.value)}
                    placeholder="Carlos Miguel"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor={id('apellidos')} className={labelClass}>
                    Apellidos<Obligatorio />
                  </label>
                  <input
                    id={id('apellidos')}
                    required
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    placeholder="Chávez Aguilar"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={id('telefono')} className={labelClass}>
                    Teléfono
                  </label>
                  <input
                    id={id('telefono')}
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="7000-0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={id('fecha-nacimiento')} className={labelClass}>
                    Fecha de nacimiento<Obligatorio />
                  </label>
                  <input
                    id={id('fecha-nacimiento')}
                    required
                    type="date"
                    value={fechaNacimiento}
                    onChange={(e) => setFechaNacimiento(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor={id('direccion')} className={labelClass}>
                    Dirección de residencia
                  </label>
                  <input
                    id={id('direccion')}
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="San Salvador, El Salvador"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <span
                  id={id('sexo-label')}
                  className="text-xs font-semibold text-slate-500 mb-1.5 block uppercase tracking-wider"
                >
                  Sexo
                </span>
                <div role="radiogroup" aria-labelledby={id('sexo-label')} className="flex gap-4">
                  {([['M', 'Masculino'], ['F', 'Femenino']] as const).map(([valor, label]) => (
                    <label key={valor} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                      <input
                        type="radio"
                        name={id('sexo')}
                        checked={sexo === valor}
                        onChange={() => setSexo(valor)}
                        className="text-doc-blue"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {busquedaHecha && !(personaExistente && personaExistente.esPaciente) && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <div>
                <span className={labelClass}>Número de expediente</span>
                {/* Lo asigna el sistema al guardar. Pedirle a quien registra que
                    invente un número único garantiza colisiones: no puede saber
                    cuál es el siguiente libre, y la base rechaza el duplicado. */}
                <div className="w-full border-2 border-dashed border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-400 bg-slate-50">
                  Se asigna automáticamente
                </div>
              </div>
              <div>
                <label htmlFor={id('tipo-sangre')} className={labelClass}>
                  Tipo Sanguíneo
                </label>
                <select
                  id={id('tipo-sangre')}
                  value={tipoSangre}
                  onChange={(e) => setTipoSangre(e.target.value)}
                  className={inputClass}
                >
                  {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-doc-blue">
              Paso 2: Historial Clínico Inicial
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-doc-blue">2 de 3</span>
          </div>
          <div>
            <label htmlFor={id('alergias')} className={labelClass}>
              Alergias Conocidas
            </label>
            <textarea
              id={id('alergias')}
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Ej: Penicilina, sulfas, mariscos..."
              className={textareaClass}
            />
          </div>
          <div>
            <label htmlFor={id('cronicas')} className={labelClass}>
              Enfermedades Crónicas
            </label>
            <textarea
              id={id('cronicas')}
              value={chronic}
              onChange={(e) => setChronic(e.target.value)}
              placeholder="Ej: Hipertensión arterial, Asma..."
              className={textareaClass}
            />
          </div>
          <div>
            <label htmlFor={id('heredofamiliares')} className={labelClass}>
              Condiciones Heredofamiliares
            </label>
            <textarea
              id={id('heredofamiliares')}
              value={hereditary}
              onChange={(e) => setHereditary(e.target.value)}
              placeholder="Ej: Diabetes Mellitus tipo 2 (Padre)..."
              className={textareaClass}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-doc-blue">
              Paso 3: Signos Vitales de Ingreso
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-doc-blue">3 de 3</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['Peso (kg)', 'weight'],
                ['Talla (cm)', 'height'],
                ['Temperatura (°C)', 'temp'],
                ['Presión arterial (mmHg)', 'bp'],
                ['Pulso (bpm)', 'pulse'],
                ['Saturación O₂ (%)', 'sat'],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                <label htmlFor={id(key)} className={labelClass}>
                  {label}
                </label>
                <input
                  id={id(key)}
                  value={vitals[key]}
                  onChange={(e) => setVitals((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {errorEnvio && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {errorEnvio}
        </p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => (step > 1 ? setStep((s) => s - 1) : onCancel())}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          {step > 1 ? 'Anterior' : 'Cancelar'}
        </button>
        <button
          type="submit"
          disabled={(step === 1 && !puedeAvanzarDesdePaso1) || enviando}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {step < 3 ? 'Siguiente' : enviando ? 'Guardando…' : 'Guardar Paciente'}
        </button>
      </div>
    </form>
  )
}
