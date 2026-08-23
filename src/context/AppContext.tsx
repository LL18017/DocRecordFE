'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { User, Clinica } from '@/types'
import { clinicas } from '@/data/mockData'
import * as authService from '@/services/auth'
import type { Role } from '@/types'

const USER_KEY = 'docrecord.user'

interface AppContextType {
  /** Usuario autenticado, o `null` si no hay sesión. */
  user: User | null
  setUser: (user: User | null) => void
  /** `true` mientras se restaura la sesión desde sessionStorage. */
  cargandoSesion: boolean
  /** Autentica contra la API y guarda la sesión. Propaga `ApiError` si falla. */
  iniciarSesion: (email: string, password: string, rolPorDefecto?: Role) => Promise<User>
  cerrarSesion: () => void
  activeClinic: Clinica | null
  setActiveClinic: (clinic: Clinica | null) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [activeClinic, setActiveClinic] = useState<Clinica | null>(clinicas[0])
  const [cargandoSesion, setCargandoSesion] = useState(true)

  // La sesión se restaura en un efecto y no en el estado inicial: en Next.js el
  // primer render ocurre en el servidor, donde sessionStorage no existe, y leerlo
  // ahí provocaría un error de hidratación.
  useEffect(() => {
    try {
      const guardado = window.sessionStorage.getItem(USER_KEY)
      if (guardado) setUser(JSON.parse(guardado) as User)
    } catch {
      // Sesión corrupta o almacenamiento bloqueado: se arranca sin usuario.
    }
    setCargandoSesion(false)
  }, [])

  const guardarUsuario = useCallback((u: User | null) => {
    setUser(u)
    try {
      if (u) window.sessionStorage.setItem(USER_KEY, JSON.stringify(u))
      else window.sessionStorage.removeItem(USER_KEY)
    } catch {
      // El almacenamiento puede fallar en modo privado; la sesión en memoria sigue válida.
    }
  }, [])

  const iniciarSesion = useCallback(
    async (email: string, password: string, rolPorDefecto: Role = 'medico') => {
      const autenticado = await authService.login(email, password, rolPorDefecto)
      guardarUsuario(autenticado)
      return autenticado
    },
    [guardarUsuario],
  )

  const cerrarSesion = useCallback(() => {
    authService.logout()
    guardarUsuario(null)
    setActiveClinic(null)
  }, [guardarUsuario])

  return (
    <AppContext.Provider
      value={{
        user,
        setUser: guardarUsuario,
        cargandoSesion,
        iniciarSesion,
        cerrarSesion,
        activeClinic,
        setActiveClinic,
      }}
    >
      {children}
    </AppContext.Provider>
  )
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
