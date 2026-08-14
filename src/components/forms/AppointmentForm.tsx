'use client'

import React, { useState } from 'react'
import { Patient, Appointment } from '@/types'

interface AppointmentFormProps {
  patients: Patient[]
  defaultDoctor?: string
  onSubmit: (appointment: Appointment) => void
  onCancel: () => void
}

export const AppointmentForm: React.FC<AppointmentFormProps> = ({
  patients,
  defaultDoctor = 'Dr. Juan Guerra',
  onSubmit,
  onCancel,
}) => {
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
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Paciente *
        </label>
        <select
          value={patient}
          onChange={(e) => setPatient(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber bg-white"
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
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Fecha *
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Hora *
          </label>
          <input
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber bg-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Tipo de cita
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber bg-white"
        >
          {['Consulta médica', 'Control rutinario', 'Seguimiento', 'Pediatría', 'Urgencia'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Notas u observaciones
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Motivo preliminar o notas para el médico..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber resize-none h-20 bg-white"
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
