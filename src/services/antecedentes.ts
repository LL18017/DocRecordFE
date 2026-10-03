// ─── Servicio de antecedentes del expediente ───────────────────────────────
// Dos secciones del expediente que se registran en la consulta y se leen en
// todas las siguientes:
//
//   · HU-12 · Antecedentes patológicos → `/antecedentes-patologicos`
//     Enfermedades previas, cirugías y hospitalizaciones, con su fecha y si
//     siguen activas o ya se resolvieron.
//   · HU-13 · Condiciones hereditarias  → `/condiciones-hereditarias`
//     Enfermedades de la familia, con el parentesco del familiar afectado.
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja):
//   · Registrar y eliminar → solo MÉDICO. Una enfermera recibe 403.
//   · Leer                 → ADMIN, MÉDICO y ENFERMERA.
//
// El tipo, el estado y el parentesco son listas cerradas y viajan como el
// valor del enum del backend (`CIRUGIA`, `MADRE`…). La etiqueta para mostrar
// sale de las tablas de este archivo, no de lo que mande el servidor: así un
// valor desconocido se ve como tal y no como texto suelto.
import { apiFetch, ApiError } from '@/lib/api'

// ── HU-12 · Antecedentes patológicos ─────────────────────────────────────────

export type TipoDeAntecedente = 'ENFERMEDAD' | 'CIRUGIA' | 'HOSPITALIZACION'
export type EstadoDeAntecedente = 'ACTIVO' | 'RESUELTO'

export const TIPOS_DE_ANTECEDENTE: { valor: TipoDeAntecedente; etiqueta: string }[] = [
  { valor: 'ENFERMEDAD', etiqueta: 'Enfermedad' },
  { valor: 'CIRUGIA', etiqueta: 'Cirugía' },
  { valor: 'HOSPITALIZACION', etiqueta: 'Hospitalización' },
]

export const ESTADOS_DE_ANTECEDENTE: { valor: EstadoDeAntecedente; etiqueta: string }[] = [
  { valor: 'ACTIVO', etiqueta: 'Activo' },
  { valor: 'RESUELTO', etiqueta: 'Resuelto' },
]

/** Espejo de `AntecedentePatologicoResponseDto`. */
export interface AntecedenteDto {
  antecedenteId: number
  pacienteId: number
  tipo: TipoDeAntecedente
  descripcion: string
  /** Fecha del antecedente, `AAAA-MM-DD`: el día importa, la hora no. */
  fecha: string
  estado: EstadoDeAntecedente
  /** Nombre del médico que lo registró. Lo pone el backend desde el token. */
  registradoPor: string
  registradoEn: string
}

export interface CrearAntecedentePayload {
  pacienteId: number
  tipo: TipoDeAntecedente
  descripcion: string
  fecha: string
  estado: EstadoDeAntecedente
}

/** Del más reciente al más antiguo: el orden lo da el backend. */
export function listarAntecedentes(pacienteId: number): Promise<AntecedenteDto[]> {
  return apiFetch<AntecedenteDto[]>(`/antecedentes-patologicos?pacienteId=${pacienteId}`)
}

export async function crearAntecedente(payload: CrearAntecedentePayload): Promise<AntecedenteDto> {
  try {
    return await apiFetch<AntecedenteDto>('/antecedentes-patologicos', {
      method: 'POST',
      body: payload,
    })
  } catch (error) {
    throw traducirError(error, 'el antecedente')
  }
}

export async function eliminarAntecedente(antecedenteId: number): Promise<void> {
  try {
    await apiFetch<void>(`/antecedentes-patologicos/${antecedenteId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error, 'el antecedente')
  }
}

export function etiquetaDeTipo(tipo: TipoDeAntecedente): string {
  return TIPOS_DE_ANTECEDENTE.find((t) => t.valor === tipo)?.etiqueta ?? tipo
}

export function etiquetaDeEstado(estado: EstadoDeAntecedente): string {
  return ESTADOS_DE_ANTECEDENTE.find((e) => e.valor === estado)?.etiqueta ?? estado
}

// ── HU-13 · Condiciones hereditarias ────────────────────────────────────────

export type Parentesco = 'PADRE' | 'MADRE' | 'ABUELO' | 'ABUELA' | 'HERMANO' | 'HERMANA' | 'OTRO'

/**
 * La lista controlada del criterio 2 de HU-13, en el orden en que se agrupan
 * las condiciones: primero los padres, luego los abuelos, luego los hermanos.
 */
export const PARENTESCOS: { valor: Parentesco; etiqueta: string }[] = [
  { valor: 'PADRE', etiqueta: 'Padre' },
  { valor: 'MADRE', etiqueta: 'Madre' },
  { valor: 'ABUELO', etiqueta: 'Abuelo' },
  { valor: 'ABUELA', etiqueta: 'Abuela' },
  { valor: 'HERMANO', etiqueta: 'Hermano' },
  { valor: 'HERMANA', etiqueta: 'Hermana' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

/** Espejo de `CondicionHereditariaResponse`. */
export interface CondicionHereditariaDto {
  condicionHereditariaId: number
  pacienteId: number
  nombre: string
  parentesco: Parentesco
  observaciones: string | null
}

export interface CrearCondicionHereditariaPayload {
  pacienteId: number
  nombre: string
  parentesco: Parentesco
  observaciones?: string
}

export function listarCondicionesHereditarias(pacienteId: number): Promise<CondicionHereditariaDto[]> {
  return apiFetch<CondicionHereditariaDto[]>(`/condiciones-hereditarias?pacienteId=${pacienteId}`)
}

export async function crearCondicionHereditaria(
  payload: CrearCondicionHereditariaPayload,
): Promise<CondicionHereditariaDto> {
  try {
    return await apiFetch<CondicionHereditariaDto>('/condiciones-hereditarias', {
      method: 'POST',
      body: payload,
    })
  } catch (error) {
    throw traducirError(error, 'la condición')
  }
}

export async function eliminarCondicionHereditaria(condicionHereditariaId: number): Promise<void> {
  try {
    await apiFetch<void>(`/condiciones-hereditarias/${condicionHereditariaId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error, 'la condición')
  }
}

export function etiquetaDeParentesco(parentesco: Parentesco): string {
  return PARENTESCOS.find((p) => p.valor === parentesco)?.etiqueta ?? parentesco
}

/**
 * Agrupa por parentesco (criterio 3 de HU-13), en el orden de `PARENTESCOS` y
 * sin grupos vacíos.
 */
export function agruparPorParentesco(
  condiciones: CondicionHereditariaDto[],
): { parentesco: Parentesco; condiciones: CondicionHereditariaDto[] }[] {
  return PARENTESCOS.map(({ valor }) => ({
    parentesco: valor,
    condiciones: condiciones.filter((c) => c.parentesco === valor),
  })).filter((grupo) => grupo.condiciones.length > 0)
}

// ── Errores ───────────────────────────────────────────────────────────────

function traducirError(error: unknown, que: string): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  switch (error.status) {
    case 403:
      return new ApiError(403, `Solo un médico puede registrar o eliminar ${que}.`)
    case 404:
      return new ApiError(404, `No se encontró ${que} o el paciente; puede que se haya eliminado.`)
    default:
      // 400 incluido: la validación de Spring nombra el campo que falla y
      // `lib/api.ts` ya la entrega redactada.
      return error
  }
}
