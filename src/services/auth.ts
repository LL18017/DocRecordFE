// ─── Servicio de autenticación ────────────────────────────────────────────────
// Traduce entre los DTO del backend (`ues.edu.sv.education.model.dto.auth`) y
// los tipos que usa la interfaz.

import { ApiError, apiFetch, clearTokens, setTokens } from '@/lib/api'
import type { Role, User } from '@/types'

/** Espejo de `LoginResponseDto` del backend. */
interface LoginResponseDto {
  /** Pese al nombre, el backend envía aquí el **correo** (`auth.getName()`). */
  userName: string
  token: string
  refreshToken: string
  roles: { id: number | null; name: string }[]
}

/** Espejo de `UserResponseDto` del backend. */
interface UserResponseDto {
  userId: number
  email: string
  nombres: string
  apellidos: string
  /** El backend asigna el rol (MEDICO) por su cuenta; el cliente no lo envía. */
  roles: string[]
  especialidad: { especialidadId: number; nombre: string; activa: boolean }
}

export interface RegistroPayload {
  nombres: string
  apellidos: string
  email: string
  password: string
  especialidadId: number
}

/**
 * Convierte los roles del backend al tipo `Role` de la interfaz.
 *
 * Limitación conocida: `LoginResponseDto` no incluye `userType`, que es el
 * campo que realmente distingue DOCTOR de ENFERMERA. Con la tabla `role`
 * conteniendo solo ADMIN, todo usuario no administrador cae al rol indicado
 * por `porDefecto`. Se resolverá cuando el backend agregue `userType` a la
 * respuesta de login.
 */
export function mapearRol(
  roles: { name: string }[],
  porDefecto: Role = 'medico',
): Role {
  const nombres = roles.map(r => r.name.replace(/^ROLE_/, '').toUpperCase())
  if (nombres.includes('ADMIN')) return 'Administrador'
  if (nombres.includes('ENFERMERA')) return 'enfermera'
  if (nombres.includes('MEDICO') || nombres.includes('DOCTOR')) return 'medico'
  return porDefecto
}

/**
 * Autentica contra `POST /auth/login`, guarda los tokens y devuelve el usuario.
 * Lanza `ApiError` (401) si las credenciales no son válidas.
 */
export async function login(
  email: string,
  password: string,
  rolPorDefecto: Role = 'medico',
): Promise<User> {
  let datos: LoginResponseDto
  try {
    datos = await apiFetch<LoginResponseDto>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    })
  } catch (error) {
    // El backend responde 404 «Registro no encontrado» cuando el correo no
    // existe y 401 cuando la contraseña no coincide. Mostrar esos textos tal
    // cual en la pantalla de login confunde al usuario, y distinguir «ese
    // correo no existe» de «esa clave es incorrecta» revela qué cuentas están
    // registradas. Se unifican en un solo mensaje.
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      throw new ApiError(error.status, 'Correo o contraseña incorrectos.')
    }
    throw error
  }

  setTokens(datos.token, datos.refreshToken)

  return {
    name: datos.userName,
    email: datos.userName,
    role: mapearRol(datos.roles, rolPorDefecto),
  }
}

/**
 * Registra un usuario vía `POST /auth/register`.
 *
 * El usuario queda **deshabilitado** hasta que abra el enlace de confirmación
 * que el backend envía por correo; intentar iniciar sesión antes falla.
 */
export async function registrar(payload: RegistroPayload): Promise<UserResponseDto> {
  return apiFetch<UserResponseDto>('/auth/register', {
    method: 'POST',
    auth: false,
    body: payload,
  })
}

/** Cierra la sesión en el cliente. El backend no expone revocación de tokens. */
export function logout(): void {
  clearTokens()
}
