'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Patient } from '@/types'
import { patients as initialPatients } from '@/data/mockData'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PatientForm } from '@/components/forms/PatientForm'

export default function PacientesPage() {
  const [patientsList, setPatientsList] = useState<Patient[]>(initialPatients)
  const [showModal, setShowModal] = useState(false)

  const handleDelete = (id: string) => {
    setPatientsList((prev) => prev.filter((p) => p.id !== id))
  }

  const handleCreatePatient = (data: Partial<Patient>) => {
    const newPatient: Patient = {
      id: `P00${patientsList.length + 1}`,
      name: data.name || 'Nuevo Paciente',
      phone: data.phone || '7000-0000',
      age: data.age || 30,
      sex: data.sex || 'Masculino',
      consultations: 0,
      status: 'Activo',
      blood: data.blood || 'O+',
      email: data.email || 'paciente@correo.com',
      address: data.address || 'San Salvador, El Salvador',
      born: data.born || '01 de Enero de 1995',
      id_num: data.id_num || '01234567-9',
    }
    setPatientsList((prev) => [newPatient, ...prev])
    setShowModal(false)
  }

  const columns: Column<Patient>[] = [
    {
      header: 'Nombre',
      cell: (p) => (
        <Link
          href={`/pacientes/${p.id}`}
          className="font-semibold text-slate-800 hover:text-doc-blue transition-colors text-sm font-outfit"
        >
          {p.name}
        </Link>
      ),
    },
    {
      header: 'Teléfono',
      accessorKey: 'phone',
      className: 'font-mono text-xs text-slate-600',
    },
    {
      header: 'Edad',
      cell: (p) => <span className="text-slate-600">{p.age} años</span>,
    },
    {
      header: 'Sexo',
      accessorKey: 'sex',
      className: 'text-slate-600',
    },
    {
      header: 'Consultas',
      cell: (p) => (
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs ${
            p.consultations > 0 ? 'bg-doc-blue' : 'bg-slate-400'
          }`}
        >
          {p.consultations}
        </span>
      ),
    },
    {
      header: 'Estado',
      cell: (p) => <Badge color="green">{p.status}</Badge>,
    },
    {
      header: 'Acciones',
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/pacientes/${p.id}`}
            className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
            title="Ver expediente clínico"
          >
            <Icon name="eye" size={14} />
          </Link>
          <button
            onClick={() => handleDelete(p.id)}
            className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
            title="Eliminar paciente"
          >
            <Icon name="delete" size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header and create button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">
            Administración de Pacientes
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Directorio y registro centralizado de pacientes ambulatorios
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nuevo Paciente
        </button>
      </div>

      {/* Reusable DataTable Component */}
      <DataTable
        data={patientsList}
        columns={columns}
        keyExtractor={(p) => p.id}
        searchable
        searchPlaceholder="Buscar por nombre, teléfono o expediente..."
        searchFilter={(p, q) =>
          p.name.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.id_num.includes(q)
        }
        pageSize={5}
      />

      {/* Reusable Modal + Patient Form */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Nuevo Paciente"
        subtitle="Registro clínico integral"
        icon="patients"
        maxWidth="xl"
      >
        <PatientForm
          onSubmit={handleCreatePatient}
          onCancel={() => setShowModal(false)}
        />
      </Modal>
    </div>
  )
}
