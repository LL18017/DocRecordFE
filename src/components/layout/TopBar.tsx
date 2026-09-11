'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { useAppContext } from '@/context/AppContext'
import { authService } from '@/services/auth.service'

interface TopBarProps {
  title?: string
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard General',
  '/pacientes': 'Administración de Pacientes',
  '/consultas': 'Consultas Médicas',
  '/enfermeria': 'Registro de Enfermería',
  '/prescripciones': 'Prescripción de Medicamentos',
  '/clinicas': 'Gestión de Clínicas',
  '/agenda': 'Agenda de Citas',
  '/usuarios': 'Usuarios y Roles',
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  sidebarOpen,
  setSidebarOpen,
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const { activeClinic, user } = useAppContext()
  const [menuOpen, setMenuOpen] = useState(false)

  const currentTitle =
    title ||
    routeTitles[pathname] ||
    (pathname.startsWith('/pacientes/') ? 'Expediente del Paciente' : 'DocRecord Sv')

  const userInitials = user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

  return (
    <header className="bg-white border-b border-slate-200/70 px-6 py-3.5 flex items-center justify-between shadow-2xs sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <button
          className="lg:hidden text-slate-600 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Abrir menú de navegación"
        >
          <Icon name="menu" size={22} />
        </button>
        <h2 className="font-semibold text-slate-800 text-base font-outfit">{currentTitle}</h2>
      </div>

      <div className="flex items-center gap-3 relative">
        {/* Active clinic pill */}
        {activeClinic && (
          <Link
            href="/clinicas"
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100/80 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-900 max-w-[160px] truncate">
              {activeClinic.name}
            </span>
            <Icon name="chevron_down" size={13} color="#92400e" />
          </Link>
        )}

        {/* Notifications bell */}
        <button className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors relative cursor-pointer">
          <Icon name="bell" size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-doc-amber rounded-full ring-2 ring-white" />
        </button>

        {/* User avatar button */}
        <button
          className="w-9 h-9 rounded-full bg-doc-amber flex items-center justify-center text-white font-bold text-sm shadow-2xs hover:opacity-90 transition-opacity cursor-pointer"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menú de usuario"
        >
          {userInitials}
        </button>

        {/* User dropdown menu */}
        {menuOpen && (
          <div className="absolute top-12 right-0 bg-white rounded-2xl shadow-xl border border-slate-100 w-60 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800 text-sm truncate">{user.name}</p>
              <p className="text-xs text-slate-500 capitalize">
                {user.specialty ? ` · ${user.specialty}` : ''}
              </p>
              {activeClinic && (
                <p className="text-xs text-amber-700 font-medium mt-1 truncate flex items-center gap-1">
                  <span>📍</span> {activeClinic.name}
                </p>
              )}
            </div>

            <Link
              href="/usuarios"
              onClick={() => setMenuOpen(false)}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <Icon name="person" size={16} /> Mi Perfil
            </Link>
            <Link
              href="/clinicas"
              onClick={() => setMenuOpen(false)}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <Icon name="clinicas" size={16} /> Cambiar clínica
            </Link>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors font-medium cursor-pointer"
                onClick={() => {
                  setMenuOpen(false)
                  authService.logout()
                  router.push('/')
                }}
              >
                <Icon name="logout" size={16} color="#dc2626" /> Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
