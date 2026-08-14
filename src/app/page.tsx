// 'use client'

import { Icon } from '@/components/ui/Icon'
import { IconName } from '@/types'
import Link from 'next/link'

const statsCards: { icon: IconName; label: string; val: string; color: string }[] = [
  { icon: 'patients', label: 'Pacientes Activos', val: '48', color: 'bg-blue-600' },
  { icon: 'consultas', label: 'Consultas hoy', val: '12', color: 'bg-doc-amber' },
  { icon: 'prescripciones', label: 'Prescripciones', val: '31', color: 'bg-emerald-600' },
  { icon: 'clinicas', label: 'Clínicas', val: '3', color: 'bg-purple-600' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#EEF2F7] to-[#dde8f5]">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-4 bg-gradient-to-r from-doc-navy to-doc-navy-light shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-amber shadow-sm">
            <Icon name="shield" size={16} color="white" />
          </div>
          <span className="text-white font-bold text-lg font-outfit">
            DocRecord <span className="text-doc-amber">Sv</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-blue-200 hover:text-white text-sm font-medium transition-colors px-4 py-2"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-doc-amber hover:opacity-90 transition-all shadow-sm"
          >
            Registrarme
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="flex-1 grid lg:grid-cols-2 items-center max-w-6xl mx-auto w-full px-8 gap-12 py-16">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6 text-xs font-semibold bg-doc-blue/10 text-doc-blue border border-doc-blue/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            Sistema clínico ambulatorio · El Salvador
          </div>

          <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-800 mb-6 leading-tight font-outfit">
            Gestiona expedientes, consultas y citas{' '}
            <span className="text-doc-amber">desde un solo lugar.</span>
          </h1>

          <p className="text-slate-600 text-lg mb-8 leading-relaxed">
            Digitaliza y centraliza el historial clínico de tus pacientes. Trazabilidad completa entre médicos,
            enfermeras y pacientes en clínicas ambulatorias.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="px-8 py-3.5 rounded-2xl font-semibold text-white text-base bg-gradient-to-r from-doc-blue to-doc-blue-light shadow-lg shadow-doc-blue/25 hover:opacity-95 hover:-translate-y-0.5 transition-all"
            >
              Registrar médico
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-2xl font-semibold text-slate-700 text-base border-2 border-slate-300 hover:border-slate-400 bg-white/50 backdrop-blur-xs transition-colors"
            >
              Ingresar
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-8 border-t border-slate-200/80 pt-6">
            {[
              ['9+', 'Módulos clínicos'],
              ['Multi-rol', 'Médico · Enfermera'],
              ['Geoloc.', 'Mapa de clínicas'],
            ].map(([val, lbl]) => (
              <div key={lbl}>
                <p className="text-xl font-bold text-slate-800 font-outfit">{val}</p>
                <p className="text-xs text-slate-500">{lbl}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Hero preview cards */}
        <div className="relative hidden lg:flex justify-center">
          <div className="absolute inset-0 rounded-3xl opacity-50 bg-radial from-blue-200/50 to-transparent blur-xl" />
          <div className="relative grid grid-cols-2 gap-4 max-w-sm w-full">
            {statsCards.map(({ icon, label, val, color }) => (
              <div
                key={label}
                className="bg-white/90 backdrop-blur-xs rounded-2xl p-5 shadow-lg border border-slate-100/80 hover:scale-[1.02] transition-transform"
              >
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3 shadow-xs`}>
                  <Icon name={icon} size={18} color="white" />
                </div>
                <p className="text-2xl font-bold text-slate-800 font-outfit">{val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
