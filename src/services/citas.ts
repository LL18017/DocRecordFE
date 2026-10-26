// ─── Servicio de citas (HU-30, HU-32) ──────────────────────────────────────
// `/citas`: agendar, reprogramar y cancelar. Lo usa el personal de la sede
// —médico y enfermera— desde la Agenda; el backend aún no le da ningún
// permiso al rol PACIENTE.
//
// El paciente viaja como su `persona_id` (el mismo id del expediente) y el
// médico como su `user_id`, que es como lo devuelve `GET /citas/medicos`.
//
// Cancelar NO borra: `PATCH /citas/{id}/cancelacion` deja la cita CANCELADA
// con su motivo y libera la franja. Por eso aquí no hay `eliminar`.
import { apiFetch, ApiError } from '@/lib/api'

export type EstadoDeCita = 'AGENDADA' | 'CANCELADA' | 'ATENDIDA'

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
}

/** Una cita no se cancela ni se reprograma con menos de esto (HU-32 c2). */
export const ANTICIPACION_MINIMA_HORAS = 4

export const ETIQUETA_DE_ESTADO: Record<EstadoDeCita, string> = {
  AGENDADA: 'Agendada',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
}

/** La agenda de la sede entre dos días (`AAAA-MM-DD`), ambos incluidos. */
export function listarAgenda(
  clinicaId: number,
  desde: string,
  hasta: string = desde,
  medicoId?: number,
): Promise<CitaDto[]> {
  const params = new URLSearchParams({ clinicaId: String(clinicaId), desde, hasta })
  if (medicoId) params.set('medicoId', String(medicoId))
  return apiFetch<CitaDto[]>(`/citas?${params}`)
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

/** Franjas ocupadas de un médico en un día: las canceladas no ocupan. */
export function franjasOcupadas(citas: CitaDto[], medicoId: number, excepto?: number): Set<string> {
  return new Set(
    citas
      .filter((c) => c.medicoId === medicoId && c.estado !== 'CANCELADA' && c.citaId !== excepto)
      .map((c) => horaDe(c.fechaHora)),
  )
}

function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  if (error.status === 403) {
    return new ApiError(403, 'Su rol no puede gestionar citas.')
  }
  // 400 y 409 traen el mensaje del backend —franja ocupada, fecha pasada,
  // menos de 4 horas— y ese es justo el que hay que mostrar.
  return error
}
