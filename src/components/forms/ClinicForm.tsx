'use client'

import React, { useId, useState } from 'react'
import { Clinica } from '@/types'

interface ClinicFormProps {
  onSubmit: (clinic: Clinica) => void
  onCancel: () => void
}

// Clases de los controles. Lo único que se agrega a las que ya había es
// `focus-visible:ring-*`, que acompaña al `focus:outline-none`: quitar el
// contorno del navegador sin reponer nada deja a quien navega con teclado sin
// saber dónde está parado.
const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-colors'
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

/**
 * Rótulo visible, clave del estado, ejemplo y si el backend lo exige. El
 * asterisco ya no vive dentro del rótulo: se pinta aparte y oculto al lector
 * de pantalla, que se entera por `required`.
 */
const CAMPOS: { rotulo: string; campo: 'name' | 'address' | 'phone' | 'lat' | 'lng'; ejemplo: string; obligatorio: boolean }[] = [
  { rotulo: 'Nombre de la clínica', campo: 'name', ejemplo: 'Clínica Familiar Escalón', obligatorio: true },
  { rotulo: 'Dirección', campo: 'address', ejemplo: 'Paseo General Escalón, San Salvador', obligatorio: true },
  { rotulo: 'Teléfono', campo: 'phone', ejemplo: '2245-0000', obligatorio: false },
  { rotulo: 'Latitud', campo: 'lat', ejemplo: '13.7053', obligatorio: false },
  { rotulo: 'Longitud', campo: 'lng', ejemplo: '-89.2182', obligatorio: false },
]

export const ClinicForm: React.FC<ClinicFormProps> = ({ onSubmit, onCancel }) => {
  const [form, setForm] = useState<Clinica>({
    clinicaId: 0,
    name: '',
    latitud: 13.7053,
    longitud: -93.7053,
    userId: 0
  })

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.name.trim()) return

    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        ['Nombre de la clínica *', 'name', 'Clínica Familiar Escalón'],
        ['Latitud', 'latitud', '13.7053'],
        ['Longitud', 'longitud', '-89.2182'],
      ].map(([label, field, ph]) => (
        <div key={field}>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            {label}
          </label>
          <input
            required={field === 'name' || field === 'address'}
            placeholder={ph}
            value={form[field as keyof Clinica]}
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
