// ─── Servicio de alergias del expediente (HU-11) ───────────────────────────
// `/alergias`: la sustancia, el tipo de reacción que provoca, su severidad y
// desde cuándo se sabe. Es la base de HU-24 (alerta al prescribir).
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja):
//   · Registrar y eliminar → MÉDICO y ENFERMERA. El administrador recibe 403.
//   · Leer                 → ADMIN, MÉDICO y ENFERMERA.
//
// Eliminar es baja lógica: el backend conserva la fila con quién la eliminó y
// cuándo, y el listado deja de incluirla. Por eso aquí no hay "editar": una
// alergia mal registrada se elimina y se vuelve a registrar, y el rastro dice
// quién cambió qué.
//
// La severidad es lista cerrada y viaja como el valor del enum del backend
// (`SEVERA`…). La etiqueta para mostrar sale de la tabla de este archivo, no
// de lo que mande el servidor: así un valor desconocido se ve como tal.
import { apiFetch, ApiError } from '@/lib/api'

export type SeveridadDeAlergia = 'LEVE' | 'MODERADA' | 'SEVERA'

/** De mayor a menor: es el orden en que se lee el riesgo y en que se ofrecen. */
export const SEVERIDADES: { valor: SeveridadDeAlergia; etiqueta: string }[] = [
  { valor: 'SEVERA', etiqueta: 'Severa' },
  { valor: 'MODERADA', etiqueta: 'Moderada' },
  { valor: 'LEVE', etiqueta: 'Leve' },
]

/** Espejo de `AlergiaResponse`. */
export interface AlergiaDto {
  alergiaId: number
  pacienteId: number
  sustancia: string
  /** El tipo de reacción que provoca: «Urticaria», «Anafilaxia»… */
  reaccion: string
  severidad: SeveridadDeAlergia
  /** `AAAA-MM-DD`: el día en que se detectó, no el del registro. */
  fechaDeteccion: string
  /**
   * Nombre de quien la registró, puesto por el backend desde el token. `null`
   * solo en alergias heredadas de antes de HU-11, que nunca guardaron autor.
   */
  registradaPor: string | null
  registradaEn: string
  /** Solo llenos al pedir por id una alergia ya eliminada; el listado no las trae. */
  eliminadaPor: string | null
  eliminadaEn: string | null
}

export interface CrearAlergiaPayload {
  pacienteId: number
  sustancia: string
  reaccion: string
  severidad: SeveridadDeAlergia
  fechaDeteccion: string
}

/** Solo las vigentes, las severas primero: el orden lo da el backend. */
export function listarAlergias(pacienteId: number): Promise<AlergiaDto[]> {
  return apiFetch<AlergiaDto[]>(`/alergias?pacienteId=${pacienteId}`)
}

export async function crearAlergia(payload: CrearAlergiaPayload): Promise<AlergiaDto> {
  try {
    return await apiFetch<AlergiaDto>('/alergias', { method: 'POST', body: payload })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function eliminarAlergia(alergiaId: number): Promise<void> {
  try {
    await apiFetch<void>(`/alergias/${alergiaId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error)
  }
}

export function etiquetaDeSeveridad(severidad: SeveridadDeAlergia): string {
  return SEVERIDADES.find((s) => s.valor === severidad)?.etiqueta ?? severidad
}

/** Las que la ficha destaca arriba con color de advertencia (criterio 2). */
export function alergiasSeveras(alergias: AlergiaDto[]): AlergiaDto[] {
  return alergias.filter((a) => a.severidad === 'SEVERA')
}

/**
 * Severas primero y, dentro de cada severidad, por sustancia: el mismo orden
 * que da el backend. Hace falta aquí para colocar una alergia recién agregada
 * sin volver a pedir la lista entera.
 */
export function ordenarPorSeveridad(alergias: AlergiaDto[]): AlergiaDto[] {
  const rango = (s: SeveridadDeAlergia) => SEVERIDADES.findIndex((x) => x.valor === s)
  return [...alergias].sort(
    (a, b) =>
      rango(a.severidad) - rango(b.severidad) ||
      a.sustancia.localeCompare(b.sustancia, 'es', { sensitivity: 'base' }),
  )
}

function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  switch (error.status) {
    case 403:
      return new ApiError(403, 'Solo un médico o una enfermera pueden registrar o eliminar alergias.')
    case 404:
      return new ApiError(404, 'No se encontró la alergia o el paciente; puede que ya se haya eliminado.')
    default:
      // 409 incluido: el backend dice qué alergia ya está registrada, con su
      // severidad y su fecha, y ese mensaje es justo el que hay que mostrar.
      // 400 también: la validación de Spring nombra el campo que falla.
      return error
  }
}
