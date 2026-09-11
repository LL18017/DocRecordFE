'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shell } from '@/components/layout/Shell'
import { useAppContext } from '@/context/AppContext'

/**
 * Guarda de acceso del portal: sin sesión, redirige a /login.
 *
 * Esto es experiencia de usuario, no seguridad — cualquiera puede saltarse una
 * guarda de cliente. La protección real es `anyRequest().authenticated()` del
 * backend, que rechaza toda petición sin un JWT válido.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, cargandoSesion } = useAppContext()
  const router = useRouter()

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/login')
  }, [cargandoSesion, user, router])

  if (cargandoSesion || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-doc-surface">
        <p className="text-slate-500 text-sm">Cargando…</p>
      </div>
    )
  }

  return <Shell>{children}</Shell>
}
