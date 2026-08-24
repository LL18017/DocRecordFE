'use client'

import React, { useId, useState } from 'react'
import { User, Role } from '@/types'

interface UserFormProps {
  onSubmit: (user: Partial<User>) => void
  onCancel: () => void
}

// Clases de los controles. Lo único que se agrega a las que ya había es
// `focus-visible:ring-*`, que acompaña al `focus:outline-none`: quitar el
// contorno del navegador sin reponer nada deja a quien navega con teclado sin
// saber dónde está parado.
const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'
const inputClass = `${campoBase} transition-colors`
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

export const UserForm: React.FC<UserFormProps> = ({ onSubmit, onCancel }) => {
  // Un prefijo por instancia: este formulario es un componente reutilizable y
  // nada impide montarlo dos veces en la misma pantalla. Con ids fijos, la
  // etiqueta del segundo apuntaría al campo del primero y el clic enfocaría el
  // que no es.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('medico')
  const [specialty, setSpecialty] = useState('Medicina General')

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    onSubmit({
      name,
      email,
      roles: [role],
      specialty: role === 'medico' ? specialty : '—',
      status: 'Activo',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={id('nombre')} className={labelClass}>
          Nombre completo<Obligatorio />
        </label>
        <input
          id={id('nombre')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. Roberto Carlos Mejía"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('email')} className={labelClass}>
          Correo electrónico<Obligatorio />
        </label>
        <input
          id={id('email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@docrecord.sv"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('password')} className={labelClass}>
          Contraseña temporal
        </label>
        <input
          id={id('password')}
          type="password"
          defaultValue="temporal123"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('rol')} className={labelClass}>
          Rol
        </label>
        <select
          id={id('rol')}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={campoBase}
        >
          <option value="medico">Médico</option>
          <option value="enfermera">Enfermera</option>
          <option value="Administrador">Administrador</option>
        </select>
      </div>

      {role === 'medico' && (
        <div>
          <label htmlFor={id('especialidad')} className={labelClass}>
            Especialidad
          </label>
          <input
            id={id('especialidad')}
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Ej: Pediatría, Medicina Interna..."
            className={inputClass}
          />
        </div>
      )}

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
          Crear Usuario
        </button>
      </div>
    </form>
  )
}
