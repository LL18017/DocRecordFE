// ─── Cliente HTTP ─────────────────────────────────────────────────────────────
// Punto único de contacto con la API de DocRecordBE. Toda llamada al backend
// debe pasar por aquí: centraliza la URL base, el envío del token y la
// traducción de errores, para que las páginas no repitan esa lógica.

/** URL base de la API. Se configura en `.env.local` (ver `.env.example`). */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/** Error de API con el código HTTP, para que quien llama pueda distinguir 401 de 500. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * El token vive en memoria y se refleja en sessionStorage. En memoria porque
 * es lo que leen las peticiones; en sessionStorage para sobrevivir a un
 * refresco de página sin quedar expuesto tras cerrar el navegador.
 *
 * Nota de seguridad: sessionStorage es accesible desde JavaScript, así que no
 * protege frente a XSS. La alternativa robusta es una cookie `HttpOnly`, que
 * requiere que el backend la emita; queda pendiente de esa decisión.
 */
const TOKEN_KEY = 'docrecord.token'
const REFRESH_KEY = 'docrecord.refreshToken'

let tokenEnMemoria: string | null = null

export function getToken(): string | null {
  if (tokenEnMemoria) return tokenEnMemoria
  if (typeof window === 'undefined') return null
  tokenEnMemoria = window.sessionStorage.getItem(TOKEN_KEY)
  return tokenEnMemoria
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(REFRESH_KEY)
}

export function setTokens(token: string, refreshToken: string): void {
  tokenEnMemoria = token
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(TOKEN_KEY, token)
  window.sessionStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens(): void {
  tokenEnMemoria = null
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(REFRESH_KEY)
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Endpoints públicos (`/auth/login`, `/auth/register`) no envían token. */
  auth?: boolean
}

/**
 * Realiza una petición a la API y devuelve el cuerpo ya deserializado.
 * Lanza `ApiError` en cualquier respuesta que no sea 2xx.
 */
export async function apiFetch<T>(
  path: string,
  { body, auth = true, headers, ...init }: ApiOptions = {},
): Promise<T> {
  const cabeceras = new Headers(headers)
  cabeceras.set('Accept', 'application/json')
  if (body !== undefined) cabeceras.set('Content-Type', 'application/json')

  if (auth) {
    const token = getToken()
    if (token) cabeceras.set('Authorization', `Bearer ${token}`)
  }

  let respuesta: Response
  try {
    respuesta = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: cabeceras,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // `fetch` solo rechaza por fallo de red o CORS, nunca por código de estado.
    throw new ApiError(0, 'No se pudo contactar al servidor. ¿Está corriendo el backend?')
  }

  if (!respuesta.ok) {
    throw new ApiError(respuesta.status, await extraerMensajeDeError(respuesta))
  }

  // 204 y 205 no traen cuerpo; deserializarlas reventaría.
  if (respuesta.status === 204 || respuesta.status === 205) return undefined as T

  const texto = await respuesta.text()
  if (!texto) return undefined as T

  try {
    return JSON.parse(texto) as T
  } catch {
    // Algunos endpoints (p. ej. /auth/confirm) responden texto plano.
    return texto as T
  }
}

/**
 * El backend responde errores con `ErrorResponseDTO { error, code }`, pero un
 * fallo de validación de Spring o un 500 inesperado traen otra forma. Se
 * intentan ambas y, si no, se cae a un mensaje según el código HTTP.
 */
async function extraerMensajeDeError(respuesta: Response): Promise<string> {
  try {
    const texto = await respuesta.text()
    if (texto) {
      const cuerpo = JSON.parse(texto) as {
        error?: string
        message?: string
        detail?: string
      }
      const mensaje = cuerpo.error ?? cuerpo.message ?? cuerpo.detail
      if (mensaje) return mensaje
    }
  } catch {
    // Cuerpo vacío o no JSON: se usa el mensaje por defecto.
  }

  switch (respuesta.status) {
    case 400:
      return 'Los datos enviados no son válidos.'
    case 401:
      // `login()` en services/auth.ts reemplaza esto por su propio mensaje
      // ("Correo o contraseña incorrectas"); este es el genérico para el
      // resto de endpoints, donde un 401 significa sesión inválida o vencida.
      return 'Tu sesión no es válida o expiró. Inicia sesión de nuevo.'
    case 403:
      return 'No tiene permisos para realizar esta acción.'
    case 404:
      return 'El recurso solicitado no existe.'
    case 409:
      return 'El registro ya existe.'
    default:
      return `Error del servidor (${respuesta.status}).`
  }
}
