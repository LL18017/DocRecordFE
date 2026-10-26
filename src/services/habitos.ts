// ─── Servicio de hábitos y estilo de vida (HU-14) ──────────────────────────
// `/api/habitos-estilo-de-vida` —el `/api` es parte de la ruta del backend,
// no el prefijo del proxy—: tabaquismo, alcohol, actividad física… cada uno
// con su tipo, una descripción, una frecuencia, observaciones y un nivel de
// riesgo. Cada alta y cada edición quedan con su fecha y su autor, y al editar
// el backend conserva la versión anterior (`/{id}/historial`).
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja):
//   · Registrar y editar → MÉDICO y ENFERMERA.
//   · Eliminar           → solo MÉDICO.
//   · Leer               → ADMIN, MÉDICO y ENFERMERA.
//
// Los tipos de hábito son un catálogo que mantiene el administrador; si está
// vacío no hay con qué registrar, y la sección lo dice en vez de ofrecer un
// formulario que no se puede llenar.
import { apiFetch, ApiError } from '@/lib/api'

export type NivelDeHabito = 'BAJO' | 'MODERADO' | 'ALTO'

/** De mayor a menor riesgo: el orden en que se leen y se ofrecen. */
export const NIVELES: { valor: NivelDeHabito; etiqueta: string }[] = [
  { valor: 'ALTO', etiqueta: 'Riesgo alto' },
  { valor: 'MODERADO', etiqueta: 'Riesgo moderado' },
  { valor: 'BAJO', etiqueta: 'Riesgo bajo' },
]

export interface TipoDeHabitoDto {
  id: number
  descripcion: string
}

/** Espejo de `HabitosEstiloDeVidaResponse`. */
export interface HabitoDto {
  id: number
  descripcion: string
  nivel: NivelDeHabito
  /** Cada cuánto ocurre («a diario», «3 veces por semana»). Obligatoria. */
  frecuencia: string
  observaciones: string | null
  /** Instante de la última escritura (alta o edición). */
  actualizadoEn: string
  /** Quién escribió esa última versión; null en los hábitos anteriores a que se guardara. */
  actualizadoPor: string | null
  pacienteId: number
  tipoHabito: TipoDeHabitoDto
}

/**
 * Una versión ANTERIOR de un hábito (`HabitoHistorialResponse`): los valores
 * que tenía entonces, cuándo y quién los escribió, y cuándo y quién los
 * reemplazó. El backend las devuelve de la más reciente a la más antigua.
 */
export interface HabitoHistorialDto {
  historialId: number
  habitoId: number
  tipoHabito: TipoDeHabitoDto
  descripcion: string
  nivel: NivelDeHabito
  frecuencia: string
  observaciones: string | null
  actualizadoEn: string
  actualizadoPor: string | null
  reemplazadoEn: string
  reemplazadoPor: string | null
}

export interface HabitoPayload {
  pacienteId: number
  tipoHabitoId: number
  nivel: NivelDeHabito
  descripcion: string
  frecuencia: string
  observaciones?: string
}

const RUTA = '/api/habitos-estilo-de-vida'

export function listarHabitos(pacienteId: number): Promise<HabitoDto[]> {
  return apiFetch<HabitoDto[]>(`${RUTA}/paciente/${pacienteId}`)
}

/** Versiones anteriores de un hábito, la más reciente primero (criterio 2). */
export function listarHistorialDeHabito(id: number): Promise<HabitoHistorialDto[]> {
  return apiFetch<HabitoHistorialDto[]>(`${RUTA}/${id}/historial`)
}

export function listarTiposDeHabito(): Promise<TipoDeHabitoDto[]> {
  return apiFetch<TipoDeHabitoDto[]>(`${RUTA}/tipos`)
}

export async function registrarHabito(payload: HabitoPayload): Promise<HabitoDto> {
  try {
    return await apiFetch<HabitoDto>(RUTA, { method: 'POST', body: payload })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function actualizarHabito(id: number, payload: HabitoPayload): Promise<HabitoDto> {
  try {
    return await apiFetch<HabitoDto>(`${RUTA}/${id}`, { method: 'PUT', body: payload })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function eliminarHabito(id: number): Promise<void> {
  try {
    await apiFetch<void>(`${RUTA}/${id}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error)
  }
}

export function etiquetaDeNivel(nivel: NivelDeHabito): string {
  return NIVELES.find((n) => n.valor === nivel)?.etiqueta ?? nivel
}

/** Riesgo alto primero y, dentro de cada nivel, por tipo. */
export function ordenarPorRiesgo(habitos: HabitoDto[]): HabitoDto[] {
  const rango = (n: NivelDeHabito) => NIVELES.findIndex((x) => x.valor === n)
  return [...habitos].sort(
    (a, b) =>
      rango(a.nivel) - rango(b.nivel) ||
      a.tipoHabito.descripcion.localeCompare(b.tipoHabito.descripcion, 'es', { sensitivity: 'base' }),
  )
}

function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  if (error.status === 403) {
    return new ApiError(
      403,
      'Registran y editan hábitos el médico y la enfermera; eliminarlos es solo del médico.',
    )
  }
  return error
}
