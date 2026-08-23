'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { User, Clinica } from '@/types'
import * as authService from '@/services/auth'
import { alExpirarSesion } from '@/lib/api'
import type { Role } from '@/types'

const USER_KEY = 'docrecord.user'
const CLINICA_KEY = 'docrecord.clinica'

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
      // Se borra también la clínica activa: es parte de la sesión, y dejarla
      // puesta le mostraría al siguiente usuario en qué sede trabajaba el
      // anterior.
      borrarSesionDelAlmacenamiento()
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
// falla, avisa aquí para limpiar la sesión igual que cerrarSesion(). Ahora
// que la clínica activa también vive en sessionStorage, esta limpieza la
// alcanza: antes se quedaba en memoria de React y la barra superior seguía
// anunciando una sede con la sesión ya vencida.
alExpirarSesion(() => {
  limpiarSesion()
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

/** Borra del navegador todo lo que dura lo que la sesión. No notifica. */
function borrarSesionDelAlmacenamiento(): void {
  try {
    window.sessionStorage.removeItem(USER_KEY)
    window.sessionStorage.removeItem(CLINICA_KEY)
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Cierra la sesión en esta pestaña: usuario y clínica activa, de una vez. */
function limpiarSesion(): void {
  borrarSesionDelAlmacenamiento()
  notificarCambioDeSesion()
}

// ─── Clínica activa: el mismo patrón ─────────────────────────────────────────
// La sede en la que se está operando vive donde la sesión y dura lo mismo. Era
// estado de React en memoria, así que un F5 —o entrar por una URL directa al
// expediente de un paciente— la borraba: la barra superior y el sidebar se
// quedaban sin sede hasta volver a /select-clinica. Estuvo oculto mientras el
// contexto arrancaba con una clínica de maqueta, que hacía parecer que el
// refresco «la restauraba».
//
// Se guarda junto al correo de quien la eligió. En una misma pestaña se puede
// cerrar sesión e iniciar con otra cuenta; sin esa marca, el segundo médico
// heredaría la sede del primero —una clínica que ni siquiera es suya— ya
// pintada como «Activa». Al leer se compara el dueño y, si no coincide, se
// ignora lo guardado: equivale a no haber elegido ninguna, que es la verdad.
//
// La elección NO se difunde a las demás pestañas, a diferencia del cierre de
// sesión. sessionStorage es por pestaña y tener dos abiertas en dos sedes es
// un uso legítimo; cambiarle la sede a una pestaña desde otra le movería el
// contexto clínico por debajo a alguien que está escribiendo una consulta.
//
// Caso que NO se cubre, a propósito: la clínica guardada pudo ser eliminada
// desde otro dispositivo. No se valida contra el API en cada arranque —sería
// una petición extra en cada carga por un dato que solo se pinta en la barra
// superior y el sidebar—; a cambio, /clinicas ya la desactiva en cuanto la
// borra, y cualquier operación contra una sede inexistente recibe 403/404,
// que `services/clinicas.ts` traduce a «Esta clínica ya no existe». Lo que sí
// se comprueba siempre es la FORMA de lo guardado: un JSON corrupto o de un
// formato anterior se descarta en vez de reventar el render con `undefined`.

interface ClinicaGuardada {
  /** Correo del médico que eligió la sede; identifica la cuenta dueña. */
  medico: string
  clinica: Clinica
}

/** Instantánea en el cliente: la cadena cruda guardada, o null. */
function leerClinicaEnCliente(): string | null {
  try {
    return window.sessionStorage.getItem(CLINICA_KEY)
  } catch {
    return null
  }
}

/** Instantánea en el servidor: durante el render en servidor no hay clínica. */
function leerClinicaEnServidor(): string | null {
  return null
}

function escribirClinica(guardada: ClinicaGuardada | null): void {
  try {
    if (guardada) window.sessionStorage.setItem(CLINICA_KEY, JSON.stringify(guardada))
    else window.sessionStorage.removeItem(CLINICA_KEY)
  } catch {
    // Igual que con la sesión: sin almacenamiento se opera sin persistir.
  }
  notificarCambioDeSesion()
}

/**
 * Identidad de la cuenta dentro de la sesión. El backend manda el correo en
 * `userName`, así que `email` es lo estable; `name` queda de respaldo porque
 * el tipo `User` declara `email` opcional.
 */
function identidadDe(usuario: User | null): string | null {
  return usuario?.email ?? usuario?.name ?? null
}

/**
 * Valida y normaliza lo leído del almacenamiento. Devuelve `null` ante
 * cualquier cosa que no sea una clínica reconocible; `lat`/`lng` ausentes o
 * de otro tipo se vuelven `null`, que es el valor que el resto del sistema ya
 * sabe pintar («Sin ubicación registrada»).
 */
function normalizarClinica(valor: unknown): Clinica | null {
  if (typeof valor !== 'object' || valor === null) return null
  const { id, name, lat, lng } = valor as Record<string, unknown>
  if (typeof id !== 'number' || typeof name !== 'string') return null
  return {
    id,
    name,
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
  }
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

  const clinicaSerializada = useSyncExternalStore(
    suscribirseASesion,
    leerClinicaEnCliente,
    leerClinicaEnServidor,
  )

  // Nunca se devuelve una clínica sin sesión ni la de otra cuenta: sin dueño
  // que coincida, lo guardado se trata como si no existiera. Es lo que evita
  // que un cambio de usuario en la misma pestaña marque como «Activa» la sede
  // del anterior.
  const activeClinic = useMemo<Clinica | null>(() => {
    if (!clinicaSerializada) return null
    const identidad = identidadDe(user)
    if (!identidad) return null
    try {
      const guardada = JSON.parse(clinicaSerializada) as Partial<ClinicaGuardada>
      if (guardada?.medico !== identidad) return null
      return normalizarClinica(guardada.clinica)
    } catch {
      // Clínica corrupta: se trata como ausencia de clínica.
      return null
    }
  }, [clinicaSerializada, user])

  const setActiveClinic = useCallback(
    (clinica: Clinica | null) => {
      const identidad = identidadDe(user)
      // Sin sesión no hay a quién atribuir la sede, así que no se guarda: lo
      // contrario dejaría una clínica huérfana que nadie podría leer.
      escribirClinica(clinica && identidad ? { medico: identidad, clinica } : null)
    },
    [user],
  )

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
    // Usuario y clínica activa se van juntos: la sede elegida es parte de la
    // sesión de trabajo, no una preferencia del navegador.
    limpiarSesion()
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
    [
      user,
      guardarUsuario,
      hidratado,
      iniciarSesion,
      cerrarSesion,
      activeClinic,
      setActiveClinic,
    ],
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
