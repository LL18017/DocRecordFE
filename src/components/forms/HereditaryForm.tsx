'use client'

import React, { useId, useState } from 'react'
import { Hereditaria } from '@/types'

interface HereditaryFormProps {
  onSubmit: (condition: Hereditaria) => void
  onCancel: () => void
}

// Clases compartidas de los controles. Lo único que se agrega a las que ya
// había es `focus-visible:ring-*`, que acompaña al `focus:outline-none`:
// quitar el contorno del navegador sin reponer nada deja a quien navega con
// teclado sin saber dónde está parado.
const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40'
const inputClass = `${campoBase} transition-colors`
const textareaClass = `${campoBase} resize-none h-20`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const HereditaryForm: React.FC<HereditaryFormProps> = ({ onSubmit, onCancel }) => {
  // Un prefijo por instancia: este formulario es un componente reutilizable y
  // nada impide montarlo dos veces en la misma pantalla. Con ids fijos, la
  // etiqueta del segundo apuntaría al campo del primero y el clic enfocaría el
  // que no es.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

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
        <label htmlFor={id('condicion')} className={labelClass}>
          Condición hereditaria<Obligatorio />
        </label>
        <input
          id={id('condicion')}
          required
          value={condicion}
          onChange={(e) => setCondicion(e.target.value)}
          placeholder="Ej: Cáncer de colon, Diabetes tipo 2, Cardiopatía..."
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('parentesco')} className={labelClass}>
          Parentesco
        </label>
        <select
          id={id('parentesco')}
          value={parentesco}
          onChange={(e) => setParentesco(e.target.value)}
          className={campoBase}
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
        <label htmlFor={id('observaciones')} className={labelClass}>
          Observaciones
        </label>
        <textarea
          id={id('observaciones')}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Detalles sobre edad de diagnóstico, tratamiento o evolución..."
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer"
        >
          Guardar Condición
        </button>
      </div>
    </form>
  )
}
