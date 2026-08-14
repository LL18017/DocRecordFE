'use client'

import React, { useState } from 'react'
import { Clinica } from '@/types'

interface ClinicFormProps {
  onSubmit: (clinic: Clinica) => void
  onCancel: () => void
}

export const ClinicForm: React.FC<ClinicFormProps> = ({ onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    lat: '13.6929',
    lng: '-89.2182',
  })

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.name.trim()) return

    onSubmit({
      id: Date.now(),
      name: form.name,
      address: form.address || 'El Salvador',
      phone: form.phone || '2200-0000',
      lat: parseFloat(form.lat) || 13.6929,
      lng: parseFloat(form.lng) || -89.2182,
      patients: 0,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        ['Nombre de la clínica *', 'name', 'Clínica Familiar Escalón'],
        ['Dirección *', 'address', 'Paseo General Escalón, San Salvador'],
        ['Teléfono', 'phone', '2245-0000'],
        ['Latitud', 'lat', '13.7053'],
        ['Longitud', 'lng', '-89.2182'],
      ].map(([label, field, ph]) => (
        <div key={field}>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            {label}
          </label>
          <input
            required={field === 'name' || field === 'address'}
            placeholder={ph}
            value={(form as Record<string, string>)[field]}
            onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors bg-white"
          />
        </div>
      ))}

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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
        >
          Guardar Clínica
        </button>
      </div>
    </form>
  )
}
