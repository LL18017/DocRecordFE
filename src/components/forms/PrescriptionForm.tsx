'use client'

import React, { useState } from 'react'
import { Patient, Prescription, PrescriptionMed } from '@/types'

interface PrescriptionFormProps {
  patients: Patient[]
  defaultDoctor?: string
  onSubmit: (prescription: Prescription) => void
  onCancel: () => void
}

export const PrescriptionForm: React.FC<PrescriptionFormProps> = ({
  patients,
  defaultDoctor = 'Dr. Juan Guerra',
  onSubmit,
  onCancel,
}) => {
  const [selectedPatient, setSelectedPatient] = useState(patients[0]?.name || '')
  const [meds, setMeds] = useState<PrescriptionMed[]>([
    { name: '', dose: '', freq: '', duration: '' },
  ])
  const [directions, setDirections] = useState('')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const validMeds = meds.filter((m) => m.name.trim() !== '')
    if (validMeds.length === 0) return

    const today = new Date().toLocaleDateString('es-SV', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

    onSubmit({
      patient: selectedPatient,
      date: today,
      doctor: defaultDoctor,
      meds: validMeds,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Paciente *
        </label>
        <select
          value={selectedPatient}
          onChange={(e) => setSelectedPatient(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white"
        >
          {patients.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name} ({p.id_num})
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Medicamentos
          </label>
          <button
            type="button"
            onClick={() => setMeds((prev) => [...prev, { name: '', dose: '', freq: '', duration: '' }])}
            className="text-xs text-purple-600 font-semibold hover:text-purple-800 transition-colors cursor-pointer"
          >
            + Agregar Medicamento
          </button>
        </div>

        {meds.map((m, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 mb-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <input
              placeholder="Medicamento (ej: Paracetamol)"
              value={m.name}
              onChange={(e) =>
                setMeds((prev) =>
                  prev.map((item, idx) => (idx === i ? { ...item, name: e.target.value } : item))
                )
              }
              className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400 bg-white"
            />
            <input
              placeholder="Dosis (500mg)"
              value={m.dose}
              onChange={(e) =>
                setMeds((prev) =>
                  prev.map((item, idx) => (idx === i ? { ...item, dose: e.target.value } : item))
                )
              }
              className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400 bg-white"
            />
            <input
              placeholder="Frecuencia (cada 8h)"
              value={m.freq}
              onChange={(e) =>
                setMeds((prev) =>
                  prev.map((item, idx) => (idx === i ? { ...item, freq: e.target.value } : item))
                )
              }
              className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400 bg-white"
            />
            <input
              placeholder="Duración (5 días)"
              value={m.duration}
              onChange={(e) =>
                setMeds((prev) =>
                  prev.map((item, idx) => (idx === i ? { ...item, duration: e.target.value } : item))
                )
              }
              className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400 bg-white"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Indicaciones adicionales
        </label>
        <textarea
          value={directions}
          onChange={(e) => setDirections(e.target.value)}
          placeholder="Indicaciones sobre la toma, dieta o cuidados especiales..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 resize-none h-20 bg-white"
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer"
        >
          Emitir Prescripción
        </button>
      </div>
    </form>
  )
}
