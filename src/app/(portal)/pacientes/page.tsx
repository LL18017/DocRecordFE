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
import type { PacienteDto } from '@/services/pacientes'

function calcularEdad(fechaISO: string): number {
  const nacimiento = new Date(fechaISO)
  if (Number.isNaN(nacimiento.getTime())) return 0
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noHaCumplidoAun =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noHaCumplidoAun) edad--
  return edad
}

function formatearFecha(fechaISO: string): string {
  const fecha = new Date(fechaISO)
  if (Number.isNaN(fecha.getTime())) return fechaISO
  return fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * La tabla y el expediente todavía se muestran con el tipo `Patient` de la
 * maqueta; esto adapta la respuesta real de `POST /pacientes` a ese shape.
 * `email` no existe en `persona`, así que queda vacío.
 */
function pacienteDtoAPatient(p: PacienteDto): Patient {
  // fechaNacimiento y sexo siempre vienen presentes en un PacienteDto: el
  // backend exige ambos para crear el paciente (ver PatientForm).
  return {
    id: String(p.personaId),
    name: `${p.persona.nombres} ${p.persona.apellidos}`.trim(),
    phone: p.persona.telefono || '—',
    age: p.persona.fechaNacimiento ? calcularEdad(p.persona.fechaNacimiento) : 0,
    sex: p.persona.sexo === 'F' ? 'Femenino' : 'Masculino',
    consultations: 0,
    status: 'Activo',
    blood: p.tipoSangre,
    email: '',
    address: p.persona.direccion || '—',
    born: p.persona.fechaNacimiento ? formatearFecha(p.persona.fechaNacimiento) : '—',
    id_num: p.persona.dui,
  }
}

export default function PacientesPage() {
  const [patientsList, setPatientsList] = useState<Patient[]>(initialPatients)
  const [showModal, setShowModal] = useState(false)

  const handleDelete = (id: string) => {
    setPatientsList((prev) => prev.filter((p) => p.id !== id))
  }

  const handlePacienteCreado = (paciente: PacienteDto) => {
    setPatientsList((prev) => [pacienteDtoAPatient(paciente), ...prev])
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
          onCreated={handlePacienteCreado}
          onCancel={() => setShowModal(false)}
        />
      </Modal>
    </div>
  )
}
