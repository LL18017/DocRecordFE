'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Role, IconName } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { useAppContext, useUsuarioAutenticado } from '@/context/AppContext'

interface NavItem {
  href: string
  label: string
  icon: IconName
  roles: Role[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles:  [{roleId: 1, name: 'Medico'}, {roleId: 2, name: 'Enfermera'}]},
  { href: '/pacientes', label: 'Pacientes', icon: 'patients', roles: [{roleId: 1, name: 'Medico'}, {roleId: 2, name: 'Enfermera'}]},
  { href: '/consultas', label: 'Consultas Médicas', icon: 'consultas', roles: [{roleId: 1, name: 'Medico'}] },
  { href: '/enfermeria', label: 'Registro Enfermería', icon: 'enfermeria', roles: [{roleId: 2, name: 'Enfermera'}] },
  { href: '/prescripciones', label: 'Prescripciones', icon: 'prescripciones', roles: [{roleId: 1, name: 'Medico'}] },
  { href: '/agenda', label: 'Agenda de Citas', icon: 'agenda', roles: [{roleId: 1, name: 'Medico'}, {roleId: 2, name: 'Enfermera'}] },
  { href: '/clinicas', label: 'Clínicas', icon: 'clinicas', roles: [{roleId: 1, name: 'Medico'}, {roleId: 2, name: 'Enfermera'}] },
  { href: '/usuarios', label: 'Usuarios y Roles', icon: 'usuarios', roles: [{roleId: 1, name: 'Medico'}] },
]

interface SidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const pathname = usePathname()
  const { activeClinic } = useAppContext()
  const user = useUsuarioAutenticado()

  const visibleItems = navItems.filter((i) => i.roles.some((r) => 
      user.roles.some((ur) => ur.roleId === r.roleId)
  ))

  const userInitials = user.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-transform duration-300 w-60 shadow-xl bg-gradient-to-b from-doc-navy to-doc-navy-light ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand header */}
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-6 py-5 border-b border-white/10 hover:bg-white/5 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-amber shadow-sm">
            <Icon name="shield" size={16} color="white" />
          </div>
          <div>
            <p className="text-white font-bold text-base font-outfit tracking-tight">DocRecord</p>
            <p className="text-blue-300 text-xs">Sv · Sistema Clínico</p>
          </div>
        </Link>

        {/* Navigation list */}
        <nav className="flex-1 p-4 overflow-y-auto space-y-1">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-nav-item w-full ${isActive ? 'active' : ''}`}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom active clinic & user info */}
        <div className="p-4 border-t border-white/10 space-y-3 bg-black/10">
          {activeClinic && (
            <Link
              href="/clinicas"
              onClick={() => setSidebarOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-doc-amber">
                <Icon name="clinicas" size={13} color="white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{activeClinic.name}</p>
                <p className="text-blue-300 text-[10px]">Clínica activa</p>
              </div>
            </Link>
          )}

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-doc-amber flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-sm font-bold text-white">{userInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name}</p>
              <p className="text-blue-300 text-xs capitalize">{user.roles[0].name}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
