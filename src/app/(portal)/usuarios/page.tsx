'use client'

import React, { useState } from 'react'
import { User } from '@/types'
import { users as initialUsers } from '@/data/mockData'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { UserForm } from '@/components/forms/UserForm'

export default function UsuariosPage() {
  const [usersList, setUsersList] = useState<User[]>(initialUsers)
  const [showNew, setShowNew] = useState(false)

  const handleCreateUser = (newUser: Partial<User>) => {
    setUsersList((prev) => [
      {
        id: Date.now(),
        name: newUser.name || '',
        email: newUser.email || '',
        role: newUser.role || 'medico',
        specialty: newUser.specialty || '—',
        status: 'Activo',
      },
      ...prev,
    ])
    setShowNew(false)
  }

  const handleDelete = (id?: number) => {
    if (id) setUsersList((prev) => prev.filter((u) => u.id !== id))
  }

  const columns: Column<User>[] = [
    {
      header: 'Usuario',
      cell: (u) => {
        const initials = u.name
          .split(' ')
          .map((w) => w[0])
          .slice(0, 2)
          .join('')
        return (
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-2xs ${
                u.role === 'medico' ? 'bg-doc-blue' : 'bg-doc-teal'
              }`}
            >
              {initials}
            </div>
            <span className="font-medium text-slate-800 text-sm font-outfit">{u.name}</span>
          </div>
        )
      },
    },
    {
      header: 'Correo',
      accessorKey: 'email',
      className: 'font-mono text-xs text-slate-600',
    },
    {
      header: 'Rol',
      cell: (u) => (
        <Badge color={u.role === 'medico' ? 'blue' : 'green'}>{u.role}</Badge>
      ),
    },
    {
      header: 'Especialidad',
      accessorKey: 'specialty',
      className: 'text-slate-600',
    },
    {
      header: 'Estado',
      cell: (u) => (
        <Badge color={u.status === 'Activo' ? 'green' : 'gray'}>{u.status}</Badge>
      ),
    },
    {
      header: 'Acciones',
      cell: (u) => (
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
            <Icon name="edit" size={14} />
          </button>
          <button
            onClick={() => handleDelete(u.id)}
            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
          >
            <Icon name="delete" size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header and trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Usuarios y Roles</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Administración del personal médico, enfermería y permisos
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nuevo Usuario
        </button>
      </div>

      {/* Reusable DataTable Component */}
      <DataTable
        data={usersList}
        columns={columns}
        keyExtractor={(u, i) => u.id || i}
        searchable
        searchPlaceholder="Buscar por nombre o correo electrónico..."
        searchFilter={(u, q) =>
          u.name.toLowerCase().includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false) ||
          u.role.toLowerCase().includes(q)
        }
        pageSize={5}
      />

      {/* Modal with UserForm */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nuevo Usuario"
        subtitle="Alta de personal y asignación de rol en el sistema"
        icon="usuarios"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
      >
        <UserForm
          onSubmit={handleCreateUser}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
