// ─── Servicio de hábitos y estilo de vida (HU-14) ──────────────────────────
// `/api/habitos-estilo-de-vida` —el `/api` es parte de la ruta del backend,
// no el prefijo del proxy—: tabaquismo, alcohol, actividad física… cada uno
// con su tipo, una descripción, una frecuencia, observaciones y un nivel de
// riesgo. Cada alta y cada edición quedan con su fecha y su autor, y al editar
// el backend conserva la versión anterior (`/{id}/historial`).
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja):
//   · Registrar y editar → MÉDICO y ENFERMERA.
//   · Anular (DEF-03)    → MÉDICO, ENFERMERA y ADMIN, y de ellos solo quien
//                           escribió la versión vigente o un ADMIN. Un hábito
//                           no se borra (el DELETE ya no existe): queda
//                           marcado como anulado, con el motivo, quién y cuándo.
//   · Leer               → ADMIN, MÉDICO y ENFERMERA.
//   · Nadie del personal escribe en su propio expediente: 403 con el motivo.
//
// Los tipos de hábito son un catálogo que mantiene el administrador; si está
// vacío no hay con qué registrar, y la sección lo dice en vez de ofrecer un
// formulario que no se puede llenar.
import { apiFetch, ApiError, esNegativaGenericaDePermisos } from '@/lib/api'

export type NivelDeHabito = 'BAJO' | 'MODERADO' | 'ALTO'

export type EstadoDeHabito = 'ACTIVO' | 'ANULADO'

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
  /** DEF-03: un hábito ANULADO sigue en el expediente, pero no se edita ni se vuelve a anular. */
  estado: EstadoDeHabito
  /** Motivo de la anulación; null mientras esté vigente. */
  motivoAnulacion: string | null
  /** Quién lo anuló; null mientras esté vigente. */
  anuladoPor: string | null
  /** Cuándo se anuló; null mientras esté vigente. */
  anuladoEn: string | null
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

/**
 * DEF-03: anula un hábito con su motivo (10 a 500 caracteres; el backend lo
 * vuelve a validar). El hábito no desaparece del expediente: vuelve marcado
 * como anulado. Los 400, 403 y 409 llegan con el mensaje del backend.
 */
export async function anularHabito(id: number, motivo: string): Promise<HabitoDto> {
  try {
    return await apiFetch<HabitoDto>(`${RUTA}/${id}/anulacion`, {
      method: 'PATCH',
      body: { motivo: motivo.trim() },
    })
  } catch (error) {
    throw traducirError(error)
  }
}

/** DEF-03: si el hábito está anulado. */
export function estaAnulado(h: Pick<HabitoDto, 'estado'>): boolean {
  return h.estado === 'ANULADO'
}

export function etiquetaDeNivel(nivel: NivelDeHabito): string {
  return NIVELES.find((n) => n.valor === nivel)?.etiqueta ?? nivel
}

/**
 * Riesgo alto primero y, dentro de cada nivel, por tipo. Los anulados van al
 * final: siguen en el expediente, pero ya no describen al paciente.
 */
export function ordenarPorRiesgo(habitos: HabitoDto[]): HabitoDto[] {
  const rango = (n: NivelDeHabito) => NIVELES.findIndex((x) => x.valor === n)
  return [...habitos].sort(
    (a, b) =>
      Number(estaAnulado(a)) - Number(estaAnulado(b)) ||
      rango(a.nivel) - rango(b.nivel) ||
      a.tipoHabito.descripcion.localeCompare(b.tipoHabito.descripcion, 'es', { sensitivity: 'base' }),
  )
}

function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  // Solo la negativa genérica por rol: un 403 con motivo propio —como el de
  // no poder escribir en el expediente propio— pasa con el texto del backend.
  if (esNegativaGenericaDePermisos(error)) {
    return new ApiError(
      403,
      'Registran y editan hábitos el médico y la enfermera; los anula quien los registró o un administrador.',
    )
  }
  return error
}
