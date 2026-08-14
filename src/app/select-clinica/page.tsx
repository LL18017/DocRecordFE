'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clinica } from '@/types'
import { clinicas } from '@/data/mockData'
import { Icon } from '@/components/ui/Icon'
import { useAppContext } from '@/context/AppContext'

export default function SelectClinicaPage() {
  const router = useRouter()
  const { user, setActiveClinic } = useAppContext()
  const [hovered, setHovered] = useState<number | null>(null)

  const select = (c: Clinica) => {
    setActiveClinic(c)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-doc-navy to-doc-navy-light">
      {/* Brand Bar */}
      <div className="flex items-center gap-3 px-8 py-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-amber shadow-sm">
            <Icon name="shield" size={16} color="white" />
          </div>
          <span className="text-white font-bold text-lg font-outfit">
            DocRecord <span className="text-doc-amber">Sv</span>
          </span>
        </Link>
      </div>

      {/* Selector Container */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-doc-amber flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
              <Icon name="clinicas" size={28} color="white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 font-outfit">Selecciona tu clínica</h1>
            <p className="text-blue-200">
              Bienvenido, <span className="font-semibold text-white">{user.name}</span>. ¿En qué clínica vas a operar hoy?
            </p>
          </div>

          <div className="grid gap-4">
            {clinicas.map((c) => (
              <button
                key={c.id}
                onClick={() => select(c)}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                className="w-full text-left rounded-2xl p-5 border-2 transition-all duration-200 flex items-center gap-5 cursor-pointer backdrop-blur-xs"
                style={{
                  background: hovered === c.id ? 'rgba(232,168,56,0.15)' : 'rgba(255,255,255,0.06)',
                  borderColor: hovered === c.id ? '#E8A838' : 'rgba(255,255,255,0.12)',
                }}
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ background: hovered === c.id ? '#E8A838' : 'rgba(255,255,255,0.1)' }}
                >
                  <Icon name="clinicas" size={24} color="white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-lg font-outfit">{c.name}</p>
                  <p className="text-blue-300 text-sm mt-0.5">{c.address}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-blue-200 text-xs flex items-center gap-1">
                      <Icon name="patients" size={12} color="#93c5fd" /> {c.patients} pacientes
                    </span>
                    <span className="text-blue-200 text-xs">{c.phone}</span>
                    <span className="text-xs font-mono text-blue-300">
                      {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                    </span>
                  </div>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                    hovered === c.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'
                  }`}
                  style={{ background: '#E8A838' }}
                >
                  <Icon name="chevron_right" size={20} color="white" />
                </div>
              </button>
            ))}
          </div>

          <p className="text-center text-blue-300 text-sm mt-8">
            ¿Deseas gestionar las sedes?{' '}
            <Link
              href="/clinicas"
              className="text-doc-amber font-semibold hover:text-amber-300 transition-colors"
            >
              Gestionar clínicas
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
