'use client'

import React, { useState } from 'react'
import { Appointment } from '@/types'
import { appointments as initialAppointments, patients } from '@/data/mockData'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { AppointmentForm } from '@/components/forms/AppointmentForm'

export default function AgendaPage() {
  const [appointmentsList, setAppointmentsList] = useState<Appointment[]>(initialAppointments)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [showNew, setShowNew] = useState(false)

  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

  const handleCreateAppointment = (apt: Appointment) => {
    setAppointmentsList((prev) => [apt, ...prev])
    setShowNew(false)
  }

  const handleDelete = (id: number) => {
    setAppointmentsList((prev) => prev.filter((a) => a.id !== id))
  }

  const columns: Column<Appointment>[] = [
    {
      header: 'Paciente',
      cell: (apt) => (
        <span className="font-medium text-slate-800 font-outfit">
          {apt.patient.split(' ').slice(0, 2).join(' ')}
        </span>
      ),
    },
    {
      header: 'Fecha',
      cell: (apt) => (
        <span className="text-slate-600">
          {new Date(apt.date).toLocaleDateString('es-SV', { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
    {
      header: 'Hora',
      accessorKey: 'time',
      className: 'font-mono text-slate-700 font-medium',
    },
    {
      header: 'Tipo',
      accessorKey: 'type',
      className: 'text-slate-600',
    },
    {
      header: 'Médico',
      accessorKey: 'doctor',
      className: 'text-slate-600',
    },
    {
      header: 'Estado',
      cell: (apt) => (
        <Badge color={apt.status === 'Confirmada' ? 'green' : 'yellow'}>{apt.status}</Badge>
      ),
    },
    {
      header: 'Acciones',
      cell: (apt) => (
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer">
            <Icon name="eye" size={14} />
          </button>
          <button
            onClick={() => handleDelete(apt.id)}
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
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Agenda de Citas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programación y gestión de citas ambulatorias</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs p-0.5">
            {(['list', 'calendar'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium transition-all rounded-lg cursor-pointer ${
                  view === v
                    ? 'bg-doc-blue text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {v === 'list' ? 'Lista' : 'Calendario'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-amber hover:opacity-90 shadow-sm transition-all cursor-pointer"
          >
            <Icon name="add" size={16} color="white" /> Nueva Cita
          </button>
        </div>
      </div>

      {/* View: List */}
      {view === 'list' ? (
        <DataTable
          data={appointmentsList}
          columns={columns}
          keyExtractor={(apt) => apt.id}
          searchable
          searchPlaceholder="Buscar cita por paciente o tipo..."
          searchFilter={(a, q) =>
            a.patient.toLowerCase().includes(q) ||
            a.type.toLowerCase().includes(q) ||
            a.doctor.toLowerCase().includes(q)
          }
          pageSize={5}
        />
      ) : (
        /* View: Calendar */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 text-lg font-outfit capitalize">
              {now.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-1">
              {['‹', '›'].map((a) => (
                <button
                  key={a}
                  className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 font-bold transition-colors cursor-pointer"
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {days.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const hasApt = appointmentsList.some((a) => new Date(a.date).getDate() === day)
              const isToday = day === now.getDate()
              return (
                <div
                  key={day}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm cursor-pointer transition-all ${
                    isToday
                      ? 'bg-doc-blue text-white font-bold shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{day}</span>
                  {hasApt && !isToday && (
                    <div className="w-1.5 h-1.5 rounded-full mt-0.5 bg-doc-amber animate-pulse" />
                  )}
                  {hasApt && isToday && (
                    <div className="w-1.5 h-1.5 rounded-full mt-0.5 bg-amber-300" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal with AppointmentForm */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nueva Cita"
        subtitle="Agendamiento de paciente en clínica"
        icon="agenda"
        headerGradient="bg-gradient-to-r from-doc-amber to-doc-amber-dark"
      >
        <AppointmentForm
          patients={patients}
          onSubmit={handleCreateAppointment}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
