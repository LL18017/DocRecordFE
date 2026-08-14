'use client'

import React, { useState } from 'react'
import { Vital } from '@/types'
import { vitals as initialVitals, patients } from '@/data/mockData'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { VitalsForm } from '@/components/forms/VitalsForm'

export default function EnfermeriaPage() {
  const [vitalsList, setVitalsList] = useState<Vital[]>(initialVitals)
  const [showNew, setShowNew] = useState(false)

  const handleSave = (vital: Partial<Vital>) => {
    setVitalsList((prev) => [vital as Vital, ...prev])
    setShowNew(false)
  }

  const columns: Column<Vital>[] = [
    {
      header: 'Fecha',
      accessorKey: 'date',
      className: 'whitespace-nowrap text-slate-600',
    },
    {
      header: 'Paciente',
      cell: (_, i) => (
        <span className="font-medium text-slate-800 font-outfit">
          {patients[i % patients.length].name.split(' ').slice(0, 2).join(' ')}
        </span>
      ),
    },
    {
      header: 'Enfermera',
      accessorKey: 'nurse',
      className: 'text-slate-600',
    },
    {
      header: 'Peso',
      accessorKey: 'weight',
      className: 'font-mono text-xs text-slate-700',
    },
    {
      header: 'Talla',
      accessorKey: 'height',
      className: 'font-mono text-xs text-slate-700',
    },
    {
      header: 'Temp.',
      accessorKey: 'temp',
      className: 'font-mono text-xs text-slate-700',
    },
    {
      header: 'Presión',
      accessorKey: 'bp',
      className: 'font-mono text-xs text-slate-700',
    },
    {
      header: 'Pulso',
      accessorKey: 'pulse',
      className: 'font-mono text-xs text-slate-700',
    },
    {
      header: 'Saturación',
      cell: (v) => (
        <Badge color={parseInt(v.sat) >= 97 ? 'green' : 'yellow'}>{v.sat}</Badge>
      ),
    },
    {
      header: 'Acciones',
      cell: () => (
        <button className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer">
          <Icon name="eye" size={14} />
        </button>
      ),
    },
  ]

  return (
    <div>
      {/* Header and action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Registro de Enfermería</h1>
          <p className="text-sm text-slate-500 mt-0.5">Triage, toma y monitoreo de constantes vitales</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-teal hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Registrar Signos Vitales
        </button>
      </div>

      {/* Reusable DataTable Component */}
      <DataTable
        data={vitalsList}
        columns={columns}
        keyExtractor={(_, i) => i}
        searchable
        searchPlaceholder="Buscar por enfermera o fecha..."
        searchFilter={(v, q) =>
          v.nurse.toLowerCase().includes(q) || v.date.toLowerCase().includes(q)
        }
        pageSize={5}
      />

      {/* Reusable Modal + VitalsForm */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Registrar Signos Vitales"
        subtitle="Constantes vitales del paciente"
        icon="enfermeria"
        headerGradient="bg-gradient-to-r from-doc-teal to-teal-700"
        maxWidth="lg"
      >
        <VitalsForm
          patients={patients}
          onSubmit={handleSave}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
