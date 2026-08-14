'use client'

import React, { useState } from 'react'
import { Enfermedad } from '@/types'

interface ChronicFormProps {
  onSubmit: (disease: Enfermedad) => void
  onCancel: () => void
}

export const ChronicForm: React.FC<ChronicFormProps> = ({ onSubmit, onCancel }) => {
  const [nombre, setNombre] = useState('')
  const [desde, setDesde] = useState('2022')
  const [tratamiento, setTratamiento] = useState('')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!nombre.trim()) return

    onSubmit({
      nombre,
      desde: desde || 'No especificado',
      tratamiento: tratamiento || 'Sin tratamiento farmacológico actual',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Nombre de la enfermedad *
        </label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Hipertensión arterial, Diabetes Mellitus 2..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Año / Fecha de diagnóstico
        </label>
        <input
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          placeholder="2020"
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Tratamiento actual
        </label>
        <textarea
          value={tratamiento}
          onChange={(e) => setTratamiento(e.target.value)}
          placeholder="Ej: Losartán 50mg cada 24 horas..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue resize-none h-20 bg-white"
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          Guardar Enfermedad
        </button>
      </div>
    </form>
  )
}
