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

/**
 * Espejo de `RegistroMedicoResponseDto` del backend.
 *
 * (No confundir con el `UserResponseDto` del backend, que es otro DTO —el de
 * la gestión de usuarios— con `userName` y `RoleDto[]`. Este endpoint nunca
 * devolvió eso.)
 */
export interface RegistroMedicoResponseDto {
  userId: number
  email: string
  nombres: string
  apellidos: string
  /** El backend asigna el rol (MEDICO) por su cuenta; el cliente no lo envía. */
  roles: string[]
  especialidad: { especialidadId: number; nombre: string; activa: boolean }
  /**
   * `false` cuando la cuenta se creó pero el correo de confirmación NO salió.
   *
   * El envío ya no tumba el alta: si Gmail falla, el backend registra el fallo
   * y responde 201 igual, con este campo en `false`. Es lo único que distingue
   * «revisa tu bandeja» de «no te va a llegar nada», así que la interfaz tiene
   * que leerlo; darlo por sentado deja a alguien esperando un correo que nunca
   * existió, con una cuenta que no puede activar.
   */
  correoDeVerificacionEnviado: boolean
}

export interface RegistroPayload {
  nombres: string
  apellidos: string
  email: string
  password: string
  especialidadId: number
}

/**
 * Convierte los roles del backend a la lista COMPLETA de `Role` de la
 * interfaz — ya no a uno solo.
 *
 * Antes esta función devolvía un único `Role`, con ADMIN ganando por
 * prioridad sobre los demás. Eso colapsaba la sesión de una cuenta
 * ADMIN+MEDICO a solo 'Administrador' y le escondía el menú de médico
 * (Consultas, Prescripciones, Agenda) en cuanto ganaba el rol de
 * administrador. No hay jerarquía real entre ADMIN y MEDICO —son capacidades
 * distintas, no niveles de lo mismo—, así que la sesión debe llevarlos todos
 * y quien pinte el menú decide con `.some(...)`, no con `===`.
 *
 * Limitación conocida: `LoginResponseDto` no incluye `userType`, que es el
 * campo que realmente distingue DOCTOR de ENFERMERA. Con la tabla `role`
 * conteniendo solo ADMIN, todo usuario no administrador cae al rol indicado
 * por `porDefecto`. Se resolverá cuando el backend agregue `userType` a la
 * respuesta de login.
 */
export function mapearRoles(
  roles: { name: string }[],
  porDefecto: Role = 'medico',
): Role[] {
  // El orden importa: primero a mayúsculas y después quitar el prefijo. Al
  // revés, `/^ROLE_/` (sin bandera `i`) no reconocía 'role_admin', quedaba
  // 'ROLE_ADMIN' y no coincidía con ningún rol conocido, así que un
  // administrador caía al rol por defecto en silencio —sin error, solo un
  // menú incompleto— con que el backend cambiara el case de sus authorities.
  const nombres = roles.map(r => r.name.toUpperCase().replace(/^ROLE_/, ''))
  const encontrados = new Set<Role>()
  if (nombres.includes('ADMIN')) encontrados.add('Administrador')
  if (nombres.includes('ENFERMERA')) encontrados.add('enfermera')
  if (nombres.includes('MEDICO') || nombres.includes('DOCTOR')) encontrados.add('medico')
  // Ningún rol reconocido (lista vacía o solo nombres desconocidos): se cae al
  // rol por defecto, igual que antes.
  if (encontrados.size === 0) encontrados.add(porDefecto)
  return Array.from(encontrados)
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
    roles: mapearRoles(datos.roles, rolPorDefecto),
  }
}

/**
 * Registra un usuario vía `POST /auth/register`.
 *
 * El usuario queda **deshabilitado** hasta que abra el enlace de confirmación
 * que el backend envía por correo; intentar iniciar sesión antes falla.
 *
 * Que el alta responda 201 no garantiza que ese correo se haya enviado: eso lo
 * dice `correoDeVerificacionEnviado` en la respuesta.
 */
export async function registrar(
  payload: RegistroPayload,
): Promise<RegistroMedicoResponseDto> {
  return apiFetch<RegistroMedicoResponseDto>('/auth/register', {
    method: 'POST',
    auth: false,
    body: payload,
  })
}

/** Cierra la sesión en el cliente. El backend no expone revocación de tokens. */
export function logout(): void {
  clearTokens()
}
