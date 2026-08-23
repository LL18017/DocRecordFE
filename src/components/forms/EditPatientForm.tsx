'use client'

import React, { useId, useMemo, useState } from 'react'
import { ApiError } from '@/lib/api'
import {
  actualizarPaciente,
  type ActualizarPacientePayload,
  type PacienteDto,
} from '@/services/pacientes'

interface EditPatientFormProps {
  paciente: PacienteDto
  /** Se llama cuando `PUT /pacientes/{personaId}` responde con éxito. */
  onUpdated: (paciente: PacienteDto) => void
  onCancel: () => void
}

// `focus-visible:ring-*` acompaña al `focus:outline-none`: quitar el contorno
// del navegador sin reponer nada deja a quien navega con teclado sin saber
// dónde está parado.
const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40 bg-white'
const readOnlyClass =
  'w-full border-2 border-dashed border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-400 bg-slate-50'
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const EditPatientForm: React.FC<EditPatientFormProps> = ({ paciente, onUpdated, onCancel }) => {
  // Un prefijo por instancia: dos formularios montados a la vez (o este junto
  // al de alta) no deben compartir ids, o la etiqueta del segundo apuntaría al
  // campo del primero.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const original = paciente.persona

  const [nombres, setNombres] = useState(original.nombres)
  const [apellidos, setApellidos] = useState(original.apellidos)
  const [telefono, setTelefono] = useState(original.telefono ?? '')
  const [direccion, setDireccion] = useState(original.direccion ?? '')
  const [fechaNacimiento, setFechaNacimiento] = useState(original.fechaNacimiento ?? '')
  const [sexo, setSexo] = useState<'M' | 'F'>(original.sexo ?? 'M')
  // '' representa "sin registrar" (tipoSangre puede venir null del backend);
  // nunca se manda como cambio real, solo una selección de verdad cuenta.
  const [tipoSangre, setTipoSangre] = useState(paciente.tipoSangre ?? '')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El backend completa sin destruir: solo se manda lo que realmente cambió.
  // El DUI y el expediente no forman parte de este cálculo porque no son
  // editables aquí (ver los campos de solo lectura más abajo).
  const cambios = useMemo(() => {
    const persona: NonNullable<ActualizarPacientePayload['persona']> = {}
    if (nombres !== original.nombres) persona.nombres = nombres
    if (apellidos !== original.apellidos) persona.apellidos = apellidos
    if (telefono !== (original.telefono ?? '')) persona.telefono = telefono
    if (direccion !== (original.direccion ?? '')) persona.direccion = direccion
    if (fechaNacimiento !== (original.fechaNacimiento ?? '')) persona.fechaNacimiento = fechaNacimiento
    if (sexo !== original.sexo) persona.sexo = sexo

    const payload: ActualizarPacientePayload = {}
    if (Object.keys(persona).length > 0) payload.persona = persona
    if (tipoSangre && tipoSangre !== (paciente.tipoSangre ?? '')) payload.tipoSangre = tipoSangre
    return payload
  }, [nombres, apellidos, telefono, direccion, fechaNacimiento, sexo, tipoSangre, original, paciente.tipoSangre])

  const hayCambios = Object.keys(cambios).length > 0

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!hayCambios) return

    setError(null)
    setEnviando(true)
    try {
      const actualizado = await actualizarPaciente(paciente.personaId, cambios)
      onUpdated(actualizado)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Ocurrió un error inesperado al guardar los cambios.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={labelClass}>Identificación (DUI)</span>
          <div className={readOnlyClass}>{original.dui || 'Sin DUI (menor de edad)'}</div>
        </div>
        <div>
          <span className={labelClass}>Número de expediente</span>
          <div className={readOnlyClass}>{paciente.expediente}</div>
        </div>

        <div>
          <label htmlFor={id('nombres')} className={labelClass}>
            Nombres<Obligatorio />
          </label>
          <input
            required
            id={id('nombres')}
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={id('apellidos')} className={labelClass}>
            Apellidos<Obligatorio />
          </label>
          <input
            required
            id={id('apellidos')}
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
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
            required
            type="date"
            id={id('fecha-nacimiento')}
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

        <div>
          <span
            id={id('sexo-label')}
            className="text-xs font-semibold text-slate-500 mb-1.5 block uppercase tracking-wider"
          >
            Sexo
          </span>
          <div role="radiogroup" aria-labelledby={id('sexo-label')} className="flex gap-4 pt-1.5">
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
            <option value="">Sin registrar</option>
            {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!hayCambios || enviando}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {enviando ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  )
}
