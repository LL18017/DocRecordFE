'use client'

import React, { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Shell } from '@/components/layout/Shell'
import { useAppContext } from '@/context/AppContext'
import { puedeVerRuta, RUTA_POR_DEFECTO } from '@/lib/rutas'

/**
 * Guarda de acceso del portal: sin sesión va a /login, y sin el rol que la
 * pantalla pide vuelve al panel.
 *
 * ── Por qué existe la segunda parte ───────────────────────────────────────
 * Antes esto solo comprobaba que hubiera sesión. El menú ya escondía las
 * pantallas que no tocan, pero esconder no es proteger: una enfermera que
 * escribiera `/consultas` en la barra de direcciones veía la pantalla entera y
 * se llevaba un 403 del servidor al cargar los datos —un error crudo en vez de
 * una puerta cerrada—.
 *
 * ── Esto NO es seguridad ──────────────────────────────────────────────────
 * Cualquiera puede saltarse una guarda de cliente. La protección real son los
 * `@PreAuthorize` del backend, que responden 403 aunque la pantalla se pinte.
 * Las dos capas existen a propósito y se comprueban por separado (HU-03:
 * criterio 2 es esta guarda, criterio 3 es el servidor). Si alguna vez hay que
 * elegir una, la que importa es la del servidor.
 *
 * ── Se vuelve al panel, no se muestra un aviso ────────────────────────────
 * Otras pantallas de este proyecto explican la falta de permiso en vez de
 * esconderla —ver `SinAcceso` en Usuarios y Roles—, y suele ser lo correcto.
 * Aquí no: quien llega a `/consultas` siendo enfermera no eligió esa pantalla
 * desde ningún sitio, porque su menú nunca la ofreció. Llegó por un enlace
 * viejo, por el historial del navegador o por una URL escrita a mano. Un aviso
 * de "no tiene acceso" le pediría entender un error que no cometió; volver al
 * panel le devuelve a un sitio útil.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, cargandoSesion } = useAppContext()
  const router = useRouter()
  const pathname = usePathname()

  // El rol NO se evalúa mientras la sesión carga. En el primer render
  // `cargandoSesion` es true y `user` es null (ver AppContext: el estado
  // hidratado distingue "todavía no sé" de "comprobado: no hay sesión"), así
  // que mirar los roles ahí redirigiría por un instante a quien sí tiene
  // permiso.
  const permitido = !cargandoSesion && user ? puedeVerRuta(pathname, user.roles) : true

  useEffect(() => {
    if (cargandoSesion) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (!permitido) router.replace(RUTA_POR_DEFECTO)
  }, [cargandoSesion, user, permitido, router])

  // `!permitido` entra aquí igual que la falta de sesión: el redirect de
  // `useEffect` ocurre DESPUÉS de pintar, así que sin esta guarda la pantalla
  // prohibida se vería un instante —y habría lanzado sus peticiones, que es
  // justo lo que el criterio pide evitar—.
  if (cargandoSesion || !user || !permitido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-doc-surface">
        <p className="text-slate-500 text-sm">Cargando…</p>
      </div>
    )
  }

  return <Shell>{children}</Shell>
}
