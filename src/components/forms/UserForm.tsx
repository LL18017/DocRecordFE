'use client'

import React, { useState } from 'react'
import { User, Role } from '@/types'

interface UserFormProps {
  onSubmit: (user: Partial<User>) => void
  onCancel: () => void
}

export const UserForm: React.FC<UserFormProps> = ({ onSubmit, onCancel }) => {
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
      role,
      specialty: role === 'medico' ? specialty : '—',
      status: 'Activo',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Nombre completo *
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. Roberto Carlos Mejía"
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Correo electrónico *
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@docrecord.sv"
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Contraseña temporal
        </label>
        <input
          type="password"
          defaultValue="temporal123"
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Rol
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
        >
          <option value="medico">Médico</option>
          <option value="enfermera">Enfermera</option>
          <option value="Administrador">Administrador</option>
        </select>
      </div>

      {role === 'medico' && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            Especialidad
          </label>
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Ej: Pediatría, Medicina Interna..."
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
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
