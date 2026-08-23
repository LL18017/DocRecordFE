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
import { alExpirarSesion } from '@/lib/api'
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

const CANAL_SESION = 'docrecord.sesion'

type Oyente = () => void
const oyentes = new Set<Oyente>()

// Aviso entre pestañas.
//
// sessionStorage NO se comparte entre pestañas: cada una tiene su propia copia
// (al abrir una pestaña desde otra, el navegador la duplica). Y el evento
// `storage` no se dispara para sessionStorage, solo para localStorage. Es decir:
// escuchar `storage` aquí sería código muerto.
//
// Se conserva sessionStorage a propósito, porque su vida útil es la correcta
// para una computadora compartida de clínica: al cerrar el navegador la sesión
// desaparece, cosa que localStorage no garantiza. Para avisar a las demás
// pestañas se usa un canal explícito.
let canal: BroadcastChannel | null = null

function obtenerCanal(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null // navegador sin soporte
  if (!canal) {
    canal = new BroadcastChannel(CANAL_SESION)
    canal.onmessage = () => {
      // Otra pestaña cerró sesión: esta limpia su propia copia y se entera.
      try {
        window.sessionStorage.removeItem(USER_KEY)
      } catch {
        // Sin almacenamiento: basta con notificar a los suscriptores.
      }
      oyentes.forEach(alCambiar => alCambiar())
    }
  }
  return canal
}

function suscribirseASesion(alCambiar: Oyente): () => void {
  oyentes.add(alCambiar)
  obtenerCanal()
  return () => {
    oyentes.delete(alCambiar)
  }
}

function notificarCambioDeSesion(): void {
  oyentes.forEach(alCambiar => alCambiar())
}

/** Pide a las demás pestañas que cierren sesión también. */
function difundirCierreDeSesion(): void {
  obtenerCanal()?.postMessage({ tipo: 'cierre' })
}

// lib/api.ts está más abajo en la jerarquía y no puede importar de aquí (ya
// es al revés: este módulo depende de services/auth.ts, que depende de
// lib/api.ts). Por eso api.ts expone un registro en vez de llamar a
// AppContext directo: cuando el refresh automático del access token también
// falla, avisa aquí para limpiar la sesión igual que cerrarSesion(), salvo
// activeClinic, que es estado de React inalcanzable desde fuera de la app.
alExpirarSesion(() => {
  escribirSesion(null)
  difundirCierreDeSesion()
})

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
    // Las demás pestañas tienen su propia copia de la sesión y no se enteran
    // solas. En una computadora compartida de clínica, dejar una pestaña con la
    // sesión viva tras cerrarla en otra es un riesgo real.
    difundirCierreDeSesion()
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
