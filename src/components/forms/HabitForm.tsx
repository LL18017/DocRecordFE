'use client'

import React, { useState } from 'react'
import { Habito } from '@/types'

interface HabitFormProps {
  onSubmit: (habit: Habito) => void
  onCancel: () => void
}

export const HabitForm: React.FC<HabitFormProps> = ({ onSubmit, onCancel }) => {
  const [tipo, setTipo] = useState('Actividad física')
  const [descripcion, setDescripcion] = useState('')
  const [nivel, setNivel] = useState('Moderado')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!tipo.trim()) return

    onSubmit({
      tipo,
      descripcion: descripcion || 'Sin descripción detallada',
      nivel,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Tipo de hábito *
        </label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white"
        >
          {[
            'Actividad física',
            'Alimentación',
            'Tabaquismo',
            'Alcoholismo',
            'Sedentarismo',
            'Higiene del sueño',
            'Consumo de cafeína',
            'Otro',
          ].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Descripción del hábito
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Camina 30 min diarios, 4 veces por semana. Dieta baja en sodio..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 resize-none h-20 bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Nivel / Frecuencia
        </label>
        <select
          value={nivel}
          onChange={(e) => setNivel(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 bg-white"
        >
          {['Bajo', 'Moderado', 'Alto'].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition-all cursor-pointer"
        >
          Guardar Hábito
        </button>
      </div>
    </form>
  )
}
