// ─── Servicio de hábitos y estilo de vida (HU-14) ──────────────────────────
// `/api/habitos-estilo-de-vida` —el `/api` es parte de la ruta del backend,
// no el prefijo del proxy—: tabaquismo, alcohol, actividad física… cada uno
// con su tipo, una descripción y un nivel de riesgo.
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
  pacienteId: number
  tipoHabito: TipoDeHabitoDto
}

export interface HabitoPayload {
  pacienteId: number
  tipoHabitoId: number
  nivel: NivelDeHabito
  descripcion: string
}

const RUTA = '/api/habitos-estilo-de-vida'

export function listarHabitos(pacienteId: number): Promise<HabitoDto[]> {
  return apiFetch<HabitoDto[]>(`${RUTA}/paciente/${pacienteId}`)
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
