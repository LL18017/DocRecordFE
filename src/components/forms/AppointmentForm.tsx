'use client'

import React, { useId, useState } from 'react'
import { Patient, Appointment } from '@/types'

interface AppointmentFormProps {
  patients: Patient[]
  defaultDoctor?: string
  onSubmit: (appointment: Appointment) => void
  onCancel: () => void
}

// Clases de los controles. Lo único que se agrega a las que ya había es
// `focus-visible:ring-*`, que acompaña al `focus:outline-none`: quitar el
// contorno del navegador sin reponer nada deja a quien navega con teclado sin
// saber dónde está parado.
const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-amber focus-visible:ring-2 focus-visible:ring-doc-amber/40'
const textareaClass = `${campoBase} resize-none h-20`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const AppointmentForm: React.FC<AppointmentFormProps> = ({
  patients,
  defaultDoctor = 'Dr. Juan Guerra',
  onSubmit,
  onCancel,
}) => {
  // Un prefijo por instancia: este formulario es un componente reutilizable y
  // nada impide montarlo dos veces en la misma pantalla (agendar y reagendar,
  // por ejemplo). Con ids fijos, la etiqueta del segundo apuntaría al campo
  // del primero y el clic enfocaría el que no es.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const [patient, setPatient] = useState(patients[0]?.name || '')
  const [date, setDate] = useState('2026-08-20')
  const [time, setTime] = useState('09:00')
  const [type, setType] = useState('Consulta médica')
  const [notes, setNotes] = useState('')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit({
      id: Date.now(),
      patient,
      date,
      time,
      type,
      doctor: defaultDoctor,
      status: 'Confirmada',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={id('paciente')} className={labelClass}>
          Paciente<Obligatorio />
        </label>
        <select
          id={id('paciente')}
          required
          value={patient}
          onChange={(e) => setPatient(e.target.value)}
          className={campoBase}
        >
          {patients.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name} ({p.id_num})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id('fecha')} className={labelClass}>
            Fecha<Obligatorio />
          </label>
          <input
            id={id('fecha')}
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('hora')} className={labelClass}>
            Hora<Obligatorio />
          </label>
          <input
            id={id('hora')}
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={campoBase}
          />
        </div>
      </div>

      <div>
        <label htmlFor={id('tipo')} className={labelClass}>
          Tipo de cita
        </label>
        <select
          id={id('tipo')}
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={campoBase}
        >
          {['Consulta médica', 'Control rutinario', 'Seguimiento', 'Pediatría', 'Urgencia'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={id('notas')} className={labelClass}>
          Notas u observaciones
        </label>
        <textarea
          id={id('notas')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Motivo preliminar o notas para el médico..."
          className={textareaClass}
        />
      </div>

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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-amber hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          Agendar Cita
        </button>
      </div>
    </form>
  )
}
