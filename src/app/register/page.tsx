'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { IconName } from '@/types'

const specialties = [
  'Medicina General',
  'Pediatría',
  'Ginecología',
  'Cardiología',
  'Dermatología',
  'Neurología',
  'Ortopedia',
]

const features: { icon: IconName; text: string }[] = [
  { icon: 'history', text: 'Historial clínico completo' },
  { icon: 'vitals', text: 'Signos vitales en tiempo real' },
  { icon: 'map', text: 'Geolocalización de clínicas' },
]
export default function RegisterPage() {
  const router = useRouter()

  const handleRegister = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    router.push('/login')
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-doc-surface">
      {/* Right registration form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
          >
            <Icon name="back" size={16} /> Volver
          </Link>

          <form onSubmit={handleRegister} className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6 font-outfit">Datos del médico</h3>
            <div className="space-y-4">
              {[
                { label: 'Nombre completo', placeholder: 'Juan Armando Guerra Guevara', type: 'text' },
                { label: 'Correo electrónico', placeholder: 'ejemplo@correo.com', type: 'email' },
                { label: 'Contraseña', placeholder: '••••••••', type: 'password' },
              ].map(({ label, placeholder, type }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    {label} *
                  </label>
                  <input
                    required
                    type={type}
                    placeholder={placeholder}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                  Especialidad
                </label>
                <select className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white">
                  {specialties.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input type="checkbox" className="mt-0.5 rounded text-doc-blue" defaultChecked />
                <span className="text-xs text-slate-500">
                  He leído y acepto las{' '}
                  <span className="font-semibold text-doc-blue">Políticas de Privacidad</span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-base mt-6 bg-gradient-to-r from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all cursor-pointer"
            >
              Crear cuenta
            </button>
          </form>
        </div>
      </div>

      {/* Left decorative card */}
      <div className="lg:flex flex-col justify-center items-center p-12 bg-gradient-to-br from-doc-navy to-doc-navy-light text-white">
        <Link href="/" className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-doc-amber shadow-sm">
            <Icon name="shield" size={20} color="white" />
          </div>
          <span className="text-white font-bold text-2xl font-outfit">
            DocRecord <span className="text-doc-amber">Sv</span>
          </span>
        </Link>

        <div className="text-center max-w-xs">
          <h2 className="text-3xl font-bold text-white mb-4 font-outfit">Estamos deseando que seas parte</h2>
          <p className="text-blue-200 leading-relaxed text-sm">
            Completa tus datos para crear tu cuenta en DocRecord Sv y comenzar a gestionar pacientes.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 w-full max-w-xs">
          {features.map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 backdrop-blur-xs">
              <Icon name={icon} size={16} color="#E8A838" />
              <span className="text-blue-100 text-sm font-medium">{text}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
