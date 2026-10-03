'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { useAppContext, useUsuarioAutenticado } from '@/context/AppContext'
import { etiquetaDeRoles } from '@/lib/roles'
import { RUTAS_DEL_PORTAL } from '@/lib/rutas'

// La tabla de rutas y roles vive en `lib/rutas.ts`, compartida con la guarda
// del portal: dos copias mantenidas a mano acaban divergiendo, y entonces el
// menú esconde una pantalla que la URL directa sí abre.


interface SidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const pathname = usePathname()
  const { activeClinic } = useAppContext()
  const user = useUsuarioAutenticado()

  // `.some(...)`, no `.includes(user.role)`: el usuario puede tener varios
  // roles a la vez y una entrada se ofrece si CUALQUIERA de ellos la permite.
  const visibleItems = RUTAS_DEL_PORTAL.filter((i) => i.roles.some((rol) => user.roles.includes(rol)))

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
              {/* Se listan TODOS los roles, no uno solo: no hay jerarquía real
                  entre ADMIN y MEDICO (ver `lib/roles.ts`). */}
              <p className="text-blue-300 text-xs">{etiquetaDeRoles(user.roles)}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
