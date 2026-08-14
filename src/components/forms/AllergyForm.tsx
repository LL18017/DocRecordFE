'use client'

import React, { useState } from 'react'
import { Alergia } from '@/types'

interface AllergyFormProps {
  onSubmit: (allergy: Alergia) => void
  onCancel: () => void
}

export const AllergyForm: React.FC<AllergyFormProps> = ({ onSubmit, onCancel }) => {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('Medicamento')
  const [severidad, setSeveridad] = useState('Moderada')
  const [reaccion, setReaccion] = useState('')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!nombre.trim()) return

    onSubmit({
      nombre,
      tipo,
      severidad,
      reaccion: reaccion || 'Reacción no especificada',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Nombre del alérgeno *
        </label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Penicilina, Sulfonamidas..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 transition-colors bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Tipo
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white"
          >
            {['Medicamento', 'Alimento', 'Ambiental', 'Contacto', 'Otro'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Severidad
          </label>
          <select
            value={severidad}
            onChange={(e) => setSeveridad(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white"
          >
            {['Leve', 'Moderada', 'Alta'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Reacción reportada
        </label>
        <textarea
          value={reaccion}
          onChange={(e) => setReaccion(e.target.value)}
          placeholder="Ej: Urticaria, prurito, dificultad respiratoria..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none h-20 bg-white"
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all cursor-pointer"
        >
          Guardar Alergia
        </button>
      </div>
    </form>
  )
}
