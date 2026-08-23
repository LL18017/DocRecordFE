'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { User, Clinica } from '@/types'
import { clinicas } from '@/data/mockData'
import * as authService from '@/services/auth'
import type { Role } from '@/types'

const USER_KEY = 'docrecord.user'

// ─── Sesión como estado externo ───────────────────────────────────────────────
// La sesión vive en sessionStorage, que es estado FUERA de React. Leerlo con un
// useEffect que llama a setState provoca renders en cascada y lo prohíbe la
// regla react-hooks/set-state-in-effect. useSyncExternalStore es el mecanismo
// que React expone justo para esto: describe cómo leer la fuente externa y cómo
// enterarse de que cambió, y React se encarga del resto.
//
// Además resuelve el problema de hidratación: en el servidor no existe
// sessionStorage, así que la instantánea de servidor devuelve null y el primer
// render del cliente coincide con el del servidor.

type Oyente = () => void
const oyentes = new Set<Oyente>()

function suscribirseASesion(alCambiar: Oyente): () => void {
  oyentes.add(alCambiar)
  // El evento `storage` solo lo disparan OTRAS pestañas. Escucharlo hace que
  // cerrar sesión en una pestaña cierre la sesión en las demás, que es lo que
  // corresponde a un sistema de expediente clínico.
  window.addEventListener('storage', alCambiar)
  return () => {
    oyentes.delete(alCambiar)
    window.removeEventListener('storage', alCambiar)
  }
}

function notificarCambioDeSesion(): void {
  oyentes.forEach(alCambiar => alCambiar())
}

/** Instantánea en el cliente: la cadena cruda guardada, o null. */
function leerSesionEnCliente(): string | null {
  try {
    return window.sessionStorage.getItem(USER_KEY)
  } catch {
    // Modo privado o almacenamiento bloqueado: se opera sin sesión persistida.
    return null
  }
}

/** Instantánea en el servidor: nunca hay sesión durante el render en servidor. */
function leerSesionEnServidor(): string | null {
  return null
}

function escribirSesion(usuario: User | null): void {
  try {
    if (usuario) window.sessionStorage.setItem(USER_KEY, JSON.stringify(usuario))
    else window.sessionStorage.removeItem(USER_KEY)
  } catch {
    // Si el almacenamiento falla, la sesión sigue viva en memoria hasta recargar.
  }
  notificarCambioDeSesion()
}

// Devuelve false durante el render del servidor y el primero de hidratación, y
// true a partir de ahí. Permite distinguir «todavía no sé si hay sesión» de
// «comprobado: no hay sesión», sin lo cual las guardas de ruta redirigirían a
// /login por un instante a un usuario que sí tiene sesión.
const suscripcionInerte = () => () => {}
const hidratadoEnCliente = () => true
const hidratadoEnServidor = () => false

interface AppContextType {
  /** Usuario autenticado, o `null` si no hay sesión. */
  user: User | null
  setUser: (user: User | null) => void
  /** `true` mientras no se ha podido leer la sesión del navegador. */
  cargandoSesion: boolean
  /** Autentica contra la API y guarda la sesión. Propaga `ApiError` si falla. */
  iniciarSesion: (email: string, password: string, rolPorDefecto?: Role) => Promise<User>
  cerrarSesion: () => void
  activeClinic: Clinica | null
  setActiveClinic: (clinic: Clinica | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeClinic, setActiveClinic] = useState<Clinica | null>(clinicas[0])

  const sesionSerializada = useSyncExternalStore(
    suscribirseASesion,
    leerSesionEnCliente,
    leerSesionEnServidor,
  )

  const hidratado = useSyncExternalStore(
    suscripcionInerte,
    hidratadoEnCliente,
    hidratadoEnServidor,
  )

  const user = useMemo<User | null>(() => {
    if (!sesionSerializada) return null
    try {
      return JSON.parse(sesionSerializada) as User
    } catch {
      // Sesión corrupta: se trata como ausencia de sesión.
      return null
    }
  }, [sesionSerializada])

  const guardarUsuario = useCallback((u: User | null) => {
    escribirSesion(u)
  }, [])

  const iniciarSesion = useCallback(
    async (email: string, password: string, rolPorDefecto: Role = 'medico') => {
      const autenticado = await authService.login(email, password, rolPorDefecto)
      escribirSesion(autenticado)
      return autenticado
    },
    [],
  )

  const cerrarSesion = useCallback(() => {
    authService.logout()
    escribirSesion(null)
    setActiveClinic(null)
  }, [])

  const valor = useMemo<AppContextType>(
    () => ({
      user,
      setUser: guardarUsuario,
      cargandoSesion: !hidratado,
      iniciarSesion,
      cerrarSesion,
      activeClinic,
      setActiveClinic,
    }),
    [user, guardarUsuario, hidratado, iniciarSesion, cerrarSesion, activeClinic],
  )

  return <AppContext.Provider value={valor}>{children}</AppContext.Provider>
}

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}

/**
 * Igual que `useAppContext`, pero para pantallas que solo se renderizan dentro
 * del portal, donde `PortalLayout` ya garantizó que hay sesión. Evita repetir
 * comprobaciones de `null` en cada componente.
 */
export const useUsuarioAutenticado = (): User => {
  const { user } = useAppContext()
  if (!user) {
    throw new Error('useUsuarioAutenticado requiere una sesión activa')
  }
  return user
}
