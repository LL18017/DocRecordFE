'use client'

import React, { useId, useState } from 'react'
import { Alergia } from '@/types'

interface AllergyFormProps {
  onSubmit: (allergy: Alergia) => void
  onCancel: () => void
}

// Clases compartidas de los controles. Lo único que se agrega a las que ya
// había es `focus-visible:ring-*`, que acompaña al `focus:outline-none`:
// quitar el contorno del navegador sin reponer nada deja a quien navega con
// teclado sin saber dónde está parado.
const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-red-400 focus-visible:ring-2 focus-visible:ring-red-400/40'
const inputClass = `${campoBase} transition-colors`
const selectClass = campoBase
const textareaClass = `${campoBase} resize-none h-20`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const AllergyForm: React.FC<AllergyFormProps> = ({ onSubmit, onCancel }) => {
  // Un prefijo por instancia: este formulario es un componente reutilizable y
  // nada impide montarlo dos veces en la misma pantalla. Con ids fijos, la
  // etiqueta del segundo apuntaría al campo del primero y el clic enfocaría el
  // que no es.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

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
        <label htmlFor={id('nombre')} className={labelClass}>
          Nombre del alérgeno<Obligatorio />
        </label>
        <input
          id={id('nombre')}
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Penicilina, Sulfonamidas..."
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id('tipo')} className={labelClass}>
            Tipo
          </label>
          <select
            id={id('tipo')}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={selectClass}
          >
            {['Medicamento', 'Alimento', 'Ambiental', 'Contacto', 'Otro'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('severidad')} className={labelClass}>
            Severidad
          </label>
          <select
            id={id('severidad')}
            value={severidad}
            onChange={(e) => setSeveridad(e.target.value)}
            className={selectClass}
          >
            {['Leve', 'Moderada', 'Alta'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={id('reaccion')} className={labelClass}>
          Reacción reportada
        </label>
        <textarea
          id={id('reaccion')}
          value={reaccion}
          onChange={(e) => setReaccion(e.target.value)}
          placeholder="Ej: Urticaria, prurito, dificultad respiratoria..."
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all cursor-pointer"
        >
          Guardar Alergia
        </button>
      </div>
    </form>
  )
}
