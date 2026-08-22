'use client'

import React from 'react'
import Link from 'next/link'
import { chartData, appointments } from '@/data/mockData'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { useUsuarioAutenticado } from '@/context/AppContext'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export default function DashboardPage() {
  const user = useUsuarioAutenticado()

  const currentDate = new Date().toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Header and fast actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit tracking-tight">
            Bienvenido, {user.name}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumen del expediente clínico · {currentDate}
          </p>
        </div>

        {user.role !== 'enfermera' && (
          <div className="flex gap-2">
            <Link
              href="/pacientes"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all"
            >
              <Icon name="patients" size={16} color="white" /> Paciente
            </Link>
            <Link
              href="/consultas"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-amber hover:opacity-90 shadow-sm transition-all"
            >
              <Icon name="consultas" size={16} color="white" /> Consulta
            </Link>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/pacientes">
          <StatCard
            icon="patients"
            label="Pacientes activos"
            value={48}
            iconColor="bg-blue-600"
          />
        </Link>
        <Link href="/consultas">
          <StatCard
            icon="consultas"
            label="Consultas hoy"
            value={12}
            iconColor="bg-doc-amber"
          />
        </Link>
        <Link href="/prescripciones">
          <StatCard
            icon="prescripciones"
            label="Prescripciones hoy"
            value={7}
            iconColor="bg-purple-600"
          />
        </Link>
        <Link href="/clinicas">
          <StatCard
            icon="clinicas"
            label="Total de clínicas"
            value={3}
            iconColor="bg-emerald-600"
          />
        </Link>
      </div>

      {/* Main Chart + Upcoming Appointments */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart card */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 font-outfit">Pacientes atendidos</h3>
              <p className="text-xs text-slate-400 mt-0.5">Últimos 30 días</p>
            </div>
          </div>

          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="fillPacientes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E3A5F" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: 'none',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pacientes"
                  stroke="#1E3A5F"
                  strokeWidth={2.5}
                  fill="url(#fillPacientes)"
                  dot={{ fill: '#1E3A5F', strokeWidth: 0, r: 3.5 }}
                  activeDot={{ r: 5, fill: '#E8A838' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming appointments card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 mb-4 font-outfit">Próximas citas</h3>
            <div className="space-y-3">
              {appointments.slice(0, 4).map((apt, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100/60">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white bg-doc-blue shadow-2xs">
                    {apt.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {apt.patient.split(' ').slice(0, 2).join(' ')}
                    </p>
                    <p className="text-xs text-slate-400">{apt.type}</p>
                  </div>
                  <Badge color={apt.status === 'Confirmada' ? 'green' : 'yellow'}>{apt.status}</Badge>
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/agenda"
            className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-doc-blue hover:text-doc-blue transition-colors text-center block"
          >
            Ver agenda completa
          </Link>
        </div>
      </div>
    </div>
  )
}
