'use client'

import React, { useId, useState } from 'react'
import { Enfermedad } from '@/types'

interface ChronicFormProps {
  onSubmit: (disease: Enfermedad) => void
  onCancel: () => void
}

// Clases compartidas de los controles. Lo único que se agrega a las que ya
// había es `focus-visible:ring-*`, que acompaña al `focus:outline-none`:
// quitar el contorno del navegador sin reponer nada deja a quien navega con
// teclado sin saber dónde está parado.
const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'
const inputClass = `${campoBase} transition-colors`
const textareaClass = `${campoBase} resize-none h-20`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const ChronicForm: React.FC<ChronicFormProps> = ({ onSubmit, onCancel }) => {
  // Un prefijo por instancia: este formulario es un componente reutilizable y
  // nada impide montarlo dos veces en la misma pantalla. Con ids fijos, la
  // etiqueta del segundo apuntaría al campo del primero y el clic enfocaría el
  // que no es.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

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
        <label htmlFor={id('nombre')} className={labelClass}>
          Nombre de la enfermedad<Obligatorio />
        </label>
        <input
          id={id('nombre')}
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Hipertensión arterial, Diabetes Mellitus 2..."
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('desde')} className={labelClass}>
          Año / Fecha de diagnóstico
        </label>
        <input
          id={id('desde')}
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          placeholder="2020"
          className={campoBase}
        />
      </div>

      <div>
        <label htmlFor={id('tratamiento')} className={labelClass}>
          Tratamiento actual
        </label>
        <textarea
          id={id('tratamiento')}
          value={tratamiento}
          onChange={(e) => setTratamiento(e.target.value)}
          placeholder="Ej: Losartán 50mg cada 24 horas..."
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          Guardar Enfermedad
        </button>
      </div>
    </form>
  )
}
