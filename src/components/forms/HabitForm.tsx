'use client'

import React, { useId, useState } from 'react'
import { Habito } from '@/types'

interface HabitFormProps {
  onSubmit: (habit: Habito) => void
  onCancel: () => void
}

// Clases compartidas de los controles. Lo único que se agrega a las que ya
// había es `focus-visible:ring-*`, que acompaña al `focus:outline-none`:
// quitar el contorno del navegador sin reponer nada deja a quien navega con
// teclado sin saber dónde está parado.
const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/40'
const textareaClass = `${campoBase} resize-none h-20`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const HabitForm: React.FC<HabitFormProps> = ({ onSubmit, onCancel }) => {
  // Un prefijo por instancia: este formulario es un componente reutilizable y
  // nada impide montarlo dos veces en la misma pantalla. Con ids fijos, la
  // etiqueta del segundo apuntaría al campo del primero y el clic enfocaría el
  // que no es.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

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
        <label htmlFor={id('tipo')} className={labelClass}>
          Tipo de hábito<Obligatorio />
        </label>
        <select
          id={id('tipo')}
          required
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={campoBase}
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
        <label htmlFor={id('descripcion')} className={labelClass}>
          Descripción del hábito
        </label>
        <textarea
          id={id('descripcion')}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Camina 30 min diarios, 4 veces por semana. Dieta baja en sodio..."
          className={textareaClass}
        />
      </div>

      <div>
        <label htmlFor={id('nivel')} className={labelClass}>
          Nivel / Frecuencia
        </label>
        <select
          id={id('nivel')}
          value={nivel}
          onChange={(e) => setNivel(e.target.value)}
          className={campoBase}
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
