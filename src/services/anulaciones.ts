// ─── Servicio de anulaciones ───────────────────────────────────────────────
// Anular una consulta (HU-21) o una receta (HU-22 c3) tiene dos salidas:
//
//   · Dentro de la ventana de anulación directa (10 minutos de fábrica desde
//     que se registró), el servidor la anula al momento y responde 200 con el
//     documento ya ANULADO.
//   · Pasada la ventana, responde 202 con una SOLICITUD que tienen que aprobar
//     otros administradores; el documento sigue vigente mientras tanto.
//
// La anulación se pide en el documento (`POST /consultas/{id}/anular`,
// `POST /prescripciones/{id}/anular`); aquí está lo demás: listar, aprobar y
// rechazar solicitudes, y leer o cambiar los parámetros, bajo `/anulaciones`.

import { ApiError, apiFetch } from '@/lib/api'

/** Mismos límites que el servidor para el motivo de anular o de rechazar. */
export const MINIMO_MOTIVO = 10
export const MAXIMO_MOTIVO = 500

export type TipoDocumentoAnulable = 'CONSULTA' | 'RECETA'
export type EstadoSolicitudDeAnulacion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA'

/** Espejo de `SolicitudDeAnulacionDto`. */
export interface SolicitudDeAnulacionDto {
  solicitudId: number
  tipo: TipoDocumentoAnulable
  /** La consulta anulada, o de la que salió la receta. */
  consultaId: number
  /** Solo en las de tipo RECETA. */
  prescripcionId: number | null
  paciente: { personaId: number; expediente: string; nombres: string; apellidos: string }
  motivo: string
  solicitadaPor: string
  solicitadaEn: string
  /** Fijadas al pedirla: cambiar los parámetros no las mueve. */
  aprobacionesRequeridas: number
  aprobaciones: { administrador: string; aprobadaEn: string }[]
  estado: EstadoSolicitudDeAnulacion
  resueltaEn: string | null
  resueltaPor: string | null
  motivoRechazo: string | null
  /** Quien pregunta es administrador, no la pidió y no la aprobó ya. */
  puedeResolver: boolean
}

/** Espejo de `ParametroDeAnulacionDto`. */
export interface ParametroDeAnulacionDto {
  tipo: TipoDocumentoAnulable
  /** 0 = toda anulación pasa por aprobación. */
  minutosAnulacionDirecta: number
  aprobacionesRequeridas: number
  /** null = sin tope. */
  diasMaximos: number | null
  actualizadoEn: string | null
  actualizadoPor: string | null
}

export interface CambioDeParametros {
  minutosAnulacionDirecta: number
  aprobacionesRequeridas: number
  diasMaximos: number | null
}

/**
 * Si lo que devolvió una anulación es una solicitud y no el documento. El
 * servidor distingue con el código (200 o 202); aquí basta con la forma,
 * porque solo la solicitud trae `solicitudId`.
 */
export function esSolicitudDeAnulacion(valor: unknown): valor is SolicitudDeAnulacionDto {
  return typeof valor === 'object' && valor !== null && 'solicitudId' in valor
}

/** Las solicitudes, de la más reciente a la más antigua. */
export async function listarSolicitudes(
  filtros: { estado?: EstadoSolicitudDeAnulacion; consultaId?: number } = {},
): Promise<SolicitudDeAnulacionDto[]> {
  const params = new URLSearchParams()
  if (filtros.estado) params.set('estado', filtros.estado)
  if (filtros.consultaId !== undefined) params.set('consultaId', String(filtros.consultaId))
  const consulta = params.toString()
  try {
    return await apiFetch<SolicitudDeAnulacionDto[]>(`/anulaciones${consulta ? `?${consulta}` : ''}`)
  } catch (error) {
    throw traducirError(error)
  }
}

export async function aprobarSolicitud(solicitudId: number): Promise<SolicitudDeAnulacionDto> {
  try {
    return await apiFetch<SolicitudDeAnulacionDto>(`/anulaciones/${solicitudId}/aprobar`, {
      method: 'POST',
    })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function rechazarSolicitud(
  solicitudId: number,
  motivo: string,
): Promise<SolicitudDeAnulacionDto> {
  try {
    return await apiFetch<SolicitudDeAnulacionDto>(`/anulaciones/${solicitudId}/rechazar`, {
      method: 'POST',
      body: { motivo: motivo.trim() },
    })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function obtenerParametros(): Promise<ParametroDeAnulacionDto[]> {
  try {
    return await apiFetch<ParametroDeAnulacionDto[]>('/anulaciones/parametros')
  } catch (error) {
    throw traducirError(error)
  }
}

export async function actualizarParametros(
  tipo: TipoDocumentoAnulable,
  cambio: CambioDeParametros,
): Promise<ParametroDeAnulacionDto> {
  try {
    return await apiFetch<ParametroDeAnulacionDto>(`/anulaciones/parametros/${tipo}`, {
      method: 'PUT',
      body: cambio,
    })
  } catch (error) {
    throw traducirError(error)
  }
}

// ─── Ayudas de presentación ────────────────────────────────────────────────

export const NOMBRE_DE_TIPO: Record<TipoDocumentoAnulable, string> = {
  CONSULTA: 'Consulta',
  RECETA: 'Receta',
}

/** «1 de 2 aprobaciones». */
export function avanceDeAprobaciones(solicitud: SolicitudDeAnulacionDto): string {
  const n = solicitud.aprobacionesRequeridas
  return `${solicitud.aprobaciones.length} de ${n} ${n === 1 ? 'aprobación' : 'aprobaciones'}`
}

/** Lo que se le dice a quien acaba de pedir la anulación fuera de la ventana. */
export function avisoDeSolicitudEnviada(solicitud: SolicitudDeAnulacionDto): string {
  const documento = solicitud.tipo === 'CONSULTA' ? 'La consulta' : 'La receta'
  const n = solicitud.aprobacionesRequeridas
  return (
    `${documento} ya pasó el tiempo de anulación directa, así que quedó una solicitud que deben ` +
    `aprobar ${n} ${n === 1 ? 'administrador' : 'administradores'}. Mientras tanto sigue vigente.`
  )
}

/**
 * Solo se traduce lo que el servidor no explica por sí solo. El 400, el 403 y
 * el 409 pasan enteros: llegan con la regla concreta (motivo corto, «no puede
 * resolver una anulación que pidió usted», «ya aprobó esta solicitud»).
 */
function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  if (error.status === 404) {
    return new ApiError(404, 'La solicitud de anulación ya no existe.')
  }
  return error
}
