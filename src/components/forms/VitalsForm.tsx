'use client'

import React, { useState } from 'react'
import { Patient, Vital } from '@/types'

interface VitalsFormProps {
  patients?: Patient[]
  defaultPatientId?: string
  defaultNurse?: string
  onSubmit: (data: Partial<Vital> & { patientId?: string }) => void
  onCancel: () => void
}

export const VitalsForm: React.FC<VitalsFormProps> = ({
  patients,
  defaultPatientId,
  defaultNurse = 'Enf. María López',
  onSubmit,
  onCancel,
}) => {
  const [patientId, setPatientId] = useState(defaultPatientId || patients?.[0]?.id || '')
  const [form, setForm] = useState({
    weight: '72',
    height: '175',
    temp: '36.8',
    bp: '120/80',
    pulse: '78',
    resp: '16',
    sat: '98',
    nurse: defaultNurse,
  })

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const today = new Date().toLocaleDateString('es-SV', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    onSubmit({
      patientId,
      date: today,
      nurse: form.nurse,
      weight: form.weight ? `${form.weight} kg` : '70 kg',
      height: form.height ? `${form.height} cm` : '170 cm',
      temp: form.temp ? `${form.temp}°C` : '36.5°C',
      bp: form.bp ? `${form.bp} mmHg` : '120/80 mmHg',
      pulse: form.pulse ? `${form.pulse} bpm` : '75 bpm',
      resp: form.resp ? `${form.resp} rpm` : '16 rpm',
      sat: form.sat ? `${form.sat}%` : '98%',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {patients && patients.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Paciente
          </label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-teal bg-white"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id_num})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          ['Peso (kg)', 'weight', '72'],
          ['Talla (cm)', 'height', '175'],
          ['Temperatura (°C)', 'temp', '36.8'],
          ['Presión arterial (mmHg)', 'bp', '120/80'],
          ['Pulso (bpm)', 'pulse', '78'],
          ['Frecuencia resp. (rpm)', 'resp', '16'],
          ['Saturación O₂ (%)', 'sat', '98'],
        ].map(([label, key, ph]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
            <input
              placeholder={ph}
              value={(form as Record<string, string>)[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-doc-teal transition-colors bg-white"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Enfermera responsable
        </label>
        <input
          value={form.nurse}
          onChange={(e) => setForm((prev) => ({ ...prev, nurse: e.target.value }))}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-teal bg-white"
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-teal hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          Guardar Registro
        </button>
      </div>
    </form>
  )
}
