// ─── Servicio de fichas de médico ──────────────────────────────────────────
// HU-02. El médico existe primero como ficha —especialidad y número de junta,
// sin cuenta— y después, desde la ficha, el administrador le da acceso: se crea
// la cuenta con el rol Médico y le llega una invitación para elegir su
// contraseña (pantalla /activar). Es el mismo modelo que el paciente: la
// cuenta se activa sobre un registro que ya existe.
//
// Usuarios y Roles ya no crea fichas de médico: dar el rol Médico a una cuenta
// sin ficha responde 409 y manda aquí.

import { ApiError, apiFetch } from '@/lib/api'

export type EstadoDeCuenta = 'SIN_ACTIVAR' | 'ACTIVA' | 'DESACTIVADA'

export interface SedeDeMedicoDto {
  clinicaId: number
  nombre: string
}

/** La cuenta con que el médico entra; `null` en la ficha si aún no tiene acceso. */
export interface CuentaDeMedicoDto {
  userId: number
  email: string
  estado: EstadoDeCuenta
  /** Una baja de la ficha le quita el rol Médico a la cuenta. */
  conRolMedico: boolean
  sedes: SedeDeMedicoDto[]
}

/** Espejo de `MedicoResponseDto`. */
export interface MedicoDto {
  personaId: number
  nombres: string
  apellidos: string
  telefono: string | null
  especialidadId: number
  especialidad: string
  registroJunta: string
  /** false si la ficha se dio de baja: ya no atiende ni firma. */
  activo: boolean
  cuenta: CuentaDeMedicoDto | null
}

export interface GuardarMedicoPayload {
  nombres: string
  apellidos: string
  telefono?: string
  especialidadId: number
  registroJunta: string
}

export interface AccesoPayload {
  /** Obligatorio si el médico todavía no tiene cuenta. */
  email?: string
  /** Obligatoria si la cuenta no tiene ninguna sede. */
  clinicaId?: number
}

/** Espejo de `AccesoResponseDto`. */
export interface AccesoDto {
  medico: MedicoDto
  /** true si se mandó una invitación (cuenta nueva o todavía sin activar). */
  invitacionEnviada: boolean
  /** false si la invitación se guardó pero el correo falló: se puede reenviar. */
  correoEnviado: boolean
}

export async function listarMedicos(): Promise<MedicoDto[]> {
  try {
    return await apiFetch<MedicoDto[]>('/medicos')
  } catch (error) {
    throw traducirError(error)
  }
}

export async function crearMedico(payload: GuardarMedicoPayload): Promise<MedicoDto> {
  try {
    return await apiFetch<MedicoDto>('/medicos', { method: 'POST', body: limpiar(payload) })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function actualizarMedico(personaId: number, payload: GuardarMedicoPayload): Promise<MedicoDto> {
  try {
    return await apiFetch<MedicoDto>(`/medicos/${personaId}`, { method: 'PUT', body: limpiar(payload) })
  } catch (error) {
    throw traducirError(error)
  }
}

/** Baja (`false`) o reactivación de la ficha. La baja le quita el rol Médico a la cuenta. */
export async function cambiarEstadoMedico(personaId: number, activo: boolean): Promise<MedicoDto> {
  try {
    return await apiFetch<MedicoDto>(`/medicos/${personaId}/estado`, { method: 'PATCH', body: { activo } })
  } catch (error) {
    throw traducirError(error)
  }
}

/**
 * Le da acceso al médico. Sin cuenta: la crea con el correo y la sede y manda
 * la invitación. Con cuenta sin activar: manda una invitación nueva. Con
 * cuenta activa: le da el rol Médico y la sede si le faltaban.
 */
export async function darAcceso(personaId: number, payload: AccesoPayload): Promise<AccesoDto> {
  const cuerpo: AccesoPayload = {}
  if (payload.email?.trim()) cuerpo.email = payload.email.trim()
  if (payload.clinicaId !== undefined) cuerpo.clinicaId = payload.clinicaId
  try {
    return await apiFetch<AccesoDto>(`/medicos/${personaId}/acceso`, { method: 'POST', body: cuerpo })
  } catch (error) {
    throw traducirError(error)
  }
}

// ─── Ayudas de presentación ────────────────────────────────────────────────

export function nombreDeMedicoEnFicha(medico: MedicoDto): string {
  return `${medico.nombres} ${medico.apellidos}`.trim()
}

/** Cómo está el acceso del médico, en una etiqueta. */
export function estadoDeAcceso(medico: MedicoDto): { texto: string; color: string } {
  const cuenta = medico.cuenta
  if (!cuenta) return { texto: 'Sin acceso', color: 'gray' }
  if (!cuenta.conRolMedico) return { texto: 'Sin rol Médico', color: 'yellow' }
  if (cuenta.estado === 'SIN_ACTIVAR') return { texto: 'Invitación enviada', color: 'blue' }
  if (cuenta.estado === 'DESACTIVADA') return { texto: 'Cuenta desactivada', color: 'red' }
  return { texto: 'Con acceso', color: 'green' }
}

function limpiar(payload: GuardarMedicoPayload): GuardarMedicoPayload {
  const telefono = payload.telefono?.trim()
  return {
    nombres: payload.nombres.trim(),
    apellidos: payload.apellidos.trim(),
    ...(telefono ? { telefono } : {}),
    especialidadId: payload.especialidadId,
    registroJunta: payload.registroJunta.trim(),
  }
}

/** El 400, el 403 y el 409 pasan con el motivo del servidor; el 404 se explica. */
function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  if (error.status === 404 && /ficha/i.test(error.message)) {
    return new ApiError(404, 'Esta ficha de médico ya no existe.')
  }
  return error
}
