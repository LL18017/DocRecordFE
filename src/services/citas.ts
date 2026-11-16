// ─── Servicio de citas (HU-30, HU-31, HU-32) ───────────────────────────────
// `/citas`: agendar, reprogramar y cancelar. Lo usa el personal de la sede
// —médico y enfermera— desde la Agenda; el backend aún no le da ningún
// permiso al rol PACIENTE.
//
// El paciente viaja como su `persona_id` (el mismo id del expediente) y el
// médico como su `user_id`, que es como lo devuelve `GET /citas/medicos`.
//
// Cancelar NO borra: `PATCH /citas/{id}/cancelacion` deja la cita CANCELADA
// con su motivo y libera la franja. Por eso aquí no hay `eliminar`.
//
// HU-31: el médico abre la agenda en «Mis citas» (el backend resuelve quién
// es a partir del token), marca «No asistió» una cita agendada cuya hora ya
// pasó, e inicia la consulta desde la cita: la consulta lleva el `citaId` y es
// el backend quien deja la cita ATENDIDA.
import { apiFetch, ApiError, esNegativaGenericaDePermisos } from '@/lib/api'

export type EstadoDeCita = 'AGENDADA' | 'CANCELADA' | 'ATENDIDA' | 'NO_ASISTIO'

/** Espejo de `CitaResponseDto`. */
export interface CitaDto {
  citaId: number
  /** `AAAA-MM-DDTHH:mm:ss`, hora local de la clínica, sin zona. */
  fechaHora: string
  tipoCitaId: number | null
  tipoCita: string | null
  pacienteId: number
  paciente: string
  expediente: string
  medicoId: number
  medico: string
  /** `null` solo en citas anteriores a que la cita guardara su sede. */
  clinicaId: number | null
  clinica: string | null
  estado: EstadoDeCita
  motivoCancelacion: string | null
  /** Motivo de la cita (HU-31 c3). Opcional: las citas antiguas no lo traen. */
  motivo?: string | null
}

export interface TipoDeCitaDto {
  tipoCitaId: number
  nombre: string
  descripcion: string | null
}

export interface MedicoDeAgendaDto {
  medicoId: number
  nombre: string
}

export interface AgendarCitaPayload {
  pacienteId: number
  /** `AAAA-MM-DDTHH:mm`, en la grilla de 30 minutos. */
  fechaHora: string
  tipoCitaId: number
  medicoId: number
  clinicaId: number
  /** Motivo de la cita, opcional (máx. 500). Vacío no se manda. */
  motivo?: string
}

/** Una cita no se cancela ni se reprograma con menos de esto (HU-32 c2). */
export const ANTICIPACION_MINIMA_HORAS = 4

export const ETIQUETA_DE_ESTADO: Record<EstadoDeCita, string> = {
  AGENDADA: 'Agendada',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
  NO_ASISTIO: 'No asistió',
}

/**
 * La agenda de la sede entre dos días (`AAAA-MM-DD`), ambos incluidos. Con
 * `mias` el backend la reduce a las citas del médico en sesión (HU-31 c1).
 */
export function listarAgenda(
  clinicaId: number,
  desde: string,
  hasta: string = desde,
  opciones: { medicoId?: number; mias?: boolean } = {},
): Promise<CitaDto[]> {
  const params = new URLSearchParams({ clinicaId: String(clinicaId), desde, hasta })
  if (opciones.medicoId) params.set('medicoId', String(opciones.medicoId))
  if (opciones.mias) params.set(PARAMETRO_MIS_CITAS, 'true')
  return apiFetch<CitaDto[]>(`/citas?${params}`)
}

/** Nombre del parámetro de `GET /citas` que pide solo las del médico en sesión. */
export const PARAMETRO_MIS_CITAS = 'mias'

/**
 * Las horas libres de un médico en la sede un día (`AAAA-MM-DD`): dentro de su
 * horario (HU-29), sin las ocupadas ni las que ya pasaron. Las calcula el
 * backend, que es quien conoce el horario.
 */
/** Una cita por su id (`GET /citas/{id}`). */
export function obtenerCita(citaId: number): Promise<CitaDto> {
  return apiFetch<CitaDto>(`/citas/${citaId}`)
}

export function listarFranjasLibres(clinicaId: number, medicoId: number, fecha: string): Promise<string[]> {
  return apiFetch<string[]>(`/citas/franjas?clinicaId=${clinicaId}&medicoId=${medicoId}&fecha=${fecha}`)
}

export function listarMedicosDeClinica(clinicaId: number): Promise<MedicoDeAgendaDto[]> {
  return apiFetch<MedicoDeAgendaDto[]>(`/citas/medicos?clinicaId=${clinicaId}`)
}

export function listarTiposDeCita(): Promise<TipoDeCitaDto[]> {
  return apiFetch<TipoDeCitaDto[]>('/tipos-cita')
}

export async function agendarCita(payload: AgendarCitaPayload): Promise<CitaDto> {
  try {
    return await apiFetch<CitaDto>('/citas', { method: 'POST', body: payload })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function reprogramarCita(citaId: number, fechaHora: string, medicoId?: number): Promise<CitaDto> {
  try {
    return await apiFetch<CitaDto>(`/citas/${citaId}`, {
      method: 'PUT',
      body: medicoId ? { fechaHora, medicoId } : { fechaHora },
    })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function marcarAtendida(citaId: number): Promise<CitaDto> {
  try {
    return await apiFetch<CitaDto>(`/citas/${citaId}`, { method: 'PUT', body: { estado: 'ATENDIDA' } })
  } catch (error) {
    throw traducirError(error)
  }
}

/**
 * HU-31 c4: el paciente no llegó. Solo vale para una cita AGENDADA cuya hora
 * ya pasó; si no, el backend responde con su motivo y ese es el que se muestra.
 */
export async function marcarNoAsistio(citaId: number): Promise<CitaDto> {
  try {
    return await apiFetch<CitaDto>(`/citas/${citaId}/no-asistio`, { method: 'PATCH' })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function cancelarCita(citaId: number, motivo: string): Promise<CitaDto> {
  try {
    return await apiFetch<CitaDto>(`/citas/${citaId}/cancelacion`, { method: 'PATCH', body: { motivo } })
  } catch (error) {
    throw traducirError(error)
  }
}

/**
 * Las franjas de 30 minutos de un día, de `desde` a `hasta` horas. La grilla
 * es la misma que exige el backend; el horario de cada sede es texto libre,
 * así que la jornada se fija aquí.
 */
export function franjasDelDia(desde = 7, hasta = 17): string[] {
  const franjas: string[] = []
  for (let h = desde; h < hasta; h++) {
    for (const m of [0, 30]) franjas.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return franjas
}

/** `HH:mm` de una `fechaHora` del backend. */
export function horaDe(fechaHora: string): string {
  return fechaHora.slice(11, 16)
}

/**
 * Si todavía se puede cancelar o reprogramar (HU-32 c2). El backend tiene la
 * última palabra; esto solo evita ofrecer un botón que va a rechazar.
 */
export function admiteCambios(cita: CitaDto, ahora: Date = new Date()): boolean {
  if (cita.estado !== 'AGENDADA') return false
  const limite = ahora.getTime() + ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000
  return new Date(cita.fechaHora).getTime() >= limite
}

/** Si la hora de la cita ya pasó: entonces cabe marcarla «No asistió» (HU-31 c4). */
export function yaPaso(cita: CitaDto, ahora: Date = new Date()): boolean {
  return new Date(cita.fechaHora).getTime() <= ahora.getTime()
}

/** Franjas ocupadas de un médico en un día: las canceladas no ocupan. */
export function franjasOcupadas(citas: CitaDto[], medicoId: number, excepto?: number): Set<string> {
  return new Set(
    citas
      .filter((c) => c.medicoId === medicoId && c.estado !== 'CANCELADA' && c.estado !== 'NO_ASISTIO' && c.citaId !== excepto)
      .map((c) => horaDe(c.fechaHora)),
  )
}

function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  // Solo el 403 GENÉRICO de Spring se cambia por el local. El que trae una
  // regla propia («Solo el médico de la cita, enfermería de su sede…», HU-31)
  // se muestra tal cual: dice exactamente por qué no.
  if (esNegativaGenericaDePermisos(error)) {
    return new ApiError(403, 'Su rol no puede gestionar citas.')
  }
  // 400 y 409 traen el mensaje del backend —franja ocupada, fecha pasada,
  // menos de 4 horas— y ese es justo el que hay que mostrar.
  return error
}
