'use client'

import React, { useState } from 'react'
import { Hereditaria } from '@/types'

interface HereditaryFormProps {
  onSubmit: (condition: Hereditaria) => void
  onCancel: () => void
}

export const HereditaryForm: React.FC<HereditaryFormProps> = ({ onSubmit, onCancel }) => {
  const [condicion, setCondicion] = useState('')
  const [parentesco, setParentesco] = useState('Padre')
  const [observaciones, setObservaciones] = useState('')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!condicion.trim()) return

    onSubmit({
      condicion,
      parentesco,
      observaciones: observaciones || 'Sin observaciones adicionales',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Condición hereditaria *
        </label>
        <input
          required
          value={condicion}
          onChange={(e) => setCondicion(e.target.value)}
          placeholder="Ej: Cáncer de colon, Diabetes tipo 2, Cardiopatía..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 transition-colors bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Parentesco
        </label>
        <select
          value={parentesco}
          onChange={(e) => setParentesco(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white"
        >
          {[
            'Padre',
            'Madre',
            'Abuelo paterno',
            'Abuela paterna',
            'Abuelo materno',
            'Abuela materna',
            'Hermano/a',
            'Tío/a',
            'Otro',
          ].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Observaciones
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Detalles sobre edad de diagnóstico, tratamiento o evolución..."
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
          Guardar Condición
        </button>
      </div>
    </form>
  )
}
