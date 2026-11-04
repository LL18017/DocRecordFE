// ─── Línea de tiempo del expediente (HU-15) ────────────────────────────────
// `GET /pacientes/{id}/linea-de-tiempo`: consultas, tomas de signos vitales y
// recetas del paciente en una sola lista, de la más reciente a la más antigua,
// de todas las sedes de la red.
//
// El detalle de cada evento es la MISMA respuesta que dan `/consultas`,
// `/signos-vitales` y `/prescripciones`, así que se reutilizan sus tipos. Para
// enfermería la consulta llega sin el diagnóstico (`diagnostico: null`): el
// backend lo recorta, y esta capa no tiene que adivinarlo.

import { apiFetch } from '@/lib/api'
import type { ConsultaClinicaDto, ConsultaDto } from './consultas'
import type { PrescripcionDto } from './prescripciones'
import type { SignosVitalesDto } from './signosVitales'

export type TipoDeEvento = 'CONSULTA' | 'SIGNOS_VITALES' | 'RECETA'

export const TIPOS_DE_EVENTO: readonly TipoDeEvento[] = ['CONSULTA', 'SIGNOS_VITALES', 'RECETA']

export const ETIQUETA_DE_TIPO: Record<TipoDeEvento, string> = {
  CONSULTA: 'Consulta',
  SIGNOS_VITALES: 'Signos vitales',
  RECETA: 'Receta',
}

/** Quién registró el evento: el médico de la consulta o la receta, o la enfermera de la toma. */
export interface ProfesionalDelEventoDto {
  personaId: number
  nombres: string
  apellidos: string
  rol: 'MEDICO' | 'ENFERMERA'
}

/** Espejo de `EventoDelExpedienteDto`. Solo viene el detalle de su `tipo`. */
export interface EventoDelExpedienteDto {
  tipo: TipoDeEvento
  id: number
  fecha: string
  /** PENDIENTE, FINALIZADA, ACTIVA, EMITIDA o ANULADA, según el tipo. */
  estado: string
  /** `null` si no se registró la sede: se dice, no se inventa. */
  clinica: ConsultaClinicaDto | null
  profesional: ProfesionalDelEventoDto
  consulta: ConsultaDto | null
  signosVitales: SignosVitalesDto | null
  receta: PrescripcionDto | null
}

/**
 * Filtros de la línea de tiempo (criterio 2). `tipos` vacío o ausente es
 * «todos»; `desde` y `hasta` son fechas civiles `YYYY-MM-DD` de un
 * `<input type="date">`, y `hasta` incluye el día completo.
 */
export interface FiltroDeLineaDeTiempo {
  tipos?: readonly TipoDeEvento[]
  desde?: string
  hasta?: string
}

/** La línea de tiempo completa del paciente. Lanza `ApiError` 404 si no existe. */
export async function obtenerLineaDeTiempo(pacienteId: number): Promise<EventoDelExpedienteDto[]> {
  return apiFetch<EventoDelExpedienteDto[]>(`/pacientes/${pacienteId}/linea-de-tiempo`)
}

/**
 * Aplica el filtro a la lista ya cargada (criterio 2: «se actualiza sin
 * recargar la página»). Misma semántica de fechas que `filtrarConsultas`: se
 * compara la fecha civil del evento, los primeros diez caracteres del instante
 * ISO, para que un evento de las 23:59 de «hasta» no se pierda.
 */
export function filtrarLineaDeTiempo(
  eventos: readonly EventoDelExpedienteDto[],
  filtro: FiltroDeLineaDeTiempo,
): EventoDelExpedienteDto[] {
  const tipos = filtro.tipos && filtro.tipos.length > 0 ? filtro.tipos : null
  return eventos.filter((e) => {
    const dia = e.fecha.slice(0, 10)
    if (tipos && !tipos.includes(e.tipo)) return false
    if (filtro.desde && dia < filtro.desde) return false
    if (filtro.hasta && dia > filtro.hasta) return false
    return true
  })
}

/** Nombre completo de quien registró el evento; el rol va aparte (`rolDelProfesional`). */
export function nombreDelProfesional(evento: EventoDelExpedienteDto): string {
  return `${evento.profesional.nombres} ${evento.profesional.apellidos}`.trim()
}

export function rolDelProfesional(evento: EventoDelExpedienteDto): string {
  return evento.profesional.rol === 'MEDICO' ? 'Médico' : 'Enfermería'
}
