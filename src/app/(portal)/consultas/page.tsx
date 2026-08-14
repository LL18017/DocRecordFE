'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Consultation } from '@/types'
import { consultations as initialConsultations, patients } from '@/data/mockData'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ConsultationForm } from '@/components/forms/ConsultationForm'

export default function ConsultasPage() {
  const [consultationsList, setConsultationsList] = useState<Consultation[]>(initialConsultations)
  const [showNew, setShowNew] = useState(false)

  const handleCreate = (data: { reason: string; diagnosis: string; meds: string[]; patientId: string }) => {
    const today = new Date().toLocaleDateString('es-SV', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    setConsultationsList((prev) => [
      {
        date: today,
        reason: data.reason,
        diagnosis: data.diagnosis,
        status: 'Finalizada',
        meds: data.meds.length ? data.meds : ['Control médico general'],
        doctor: 'Dr. Juan Guerra',
      },
      ...prev,
    ])
    setShowNew(false)
  }

  const columns: Column<Consultation>[] = [
    {
      header: 'Fecha',
      accessorKey: 'date',
      className: 'whitespace-nowrap text-slate-600',
    },
    {
      header: 'Paciente',
      cell: () => (
        <Link
          href={`/pacientes/${patients[0].id}`}
          className="font-medium text-slate-800 hover:text-doc-blue transition-colors font-outfit"
        >
          {patients[0].name}
        </Link>
      ),
    },
    {
      header: 'Motivo',
      accessorKey: 'reason',
      className: 'max-w-[180px] truncate text-slate-600',
    },
    {
      header: 'Diagnóstico',
      accessorKey: 'diagnosis',
      className: 'max-w-[180px] truncate font-medium text-slate-800',
    },
    {
      header: 'Medicamentos',
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.meds.map((m) => (
            <Badge key={m} color="blue">
              {m}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Estado',
      cell: (c) => <Badge color="green">{c.status}</Badge>,
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
      {/* Header and trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Consultas Médicas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Historial y atención clínica de consultas</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nueva Consulta
        </button>
      </div>

      {/* Reusable DataTable Component */}
      <DataTable
        data={consultationsList}
        columns={columns}
        keyExtractor={(_, i) => i}
        searchable
        searchPlaceholder="Buscar por motivo, diagnóstico o medicamento..."
        searchFilter={(c, q) =>
          c.reason.toLowerCase().includes(q) ||
          c.diagnosis.toLowerCase().includes(q) ||
          c.meds.some((m) => m.toLowerCase().includes(q))
        }
        pageSize={5}
      />

      {/* Reusable Modal with ConsultationForm */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nueva Consulta Médica"
        subtitle="Evaluación clínica y plan terapéutico"
        icon="consultas"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
        maxWidth="lg"
      >
        <ConsultationForm
          patients={patients}
          onSubmit={handleCreate}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
