// ─── Servicio de personas ──────────────────────────────────────────────────
// `persona` es la identidad compartida entre médico, enfermera y paciente:
// se busca por DUI antes de crear, para no duplicar a alguien que ya existe
// en el sistema con otro rol clínico.

import { ApiError, apiFetch } from '@/lib/api'

/**
 * Espejo de la respuesta de `GET /personas?dui=`.
 *
 * Solo `personaId`, `dui`, `nombres` y `apellidos` están garantizados: una
 * persona creada al registrarse como médico, por ejemplo, todavía no tiene
 * fecha de nacimiento, sexo, teléfono ni dirección.
 */
export interface PersonaDto {
  personaId: number
  /** Puede ser null: los menores de edad no tienen DUI. */
  dui: string | null
  nombres: string
  apellidos: string
  fechaNacimiento: string | null
  sexo: 'M' | 'F' | null
  telefono: string | null
  direccion: string | null
  esMedico: boolean
  esEnfermera: boolean
  esPaciente: boolean
}

/**
 * Busca una persona por DUI. Devuelve `null` si no existe (404 del backend),
 * para que quien llama distinga "no existe todavía" de un error real sin
 * atrapar `ApiError` en cada sitio.
 */
export async function buscarPersonaPorDui(dui: string): Promise<PersonaDto | null> {
  try {
    return await apiFetch<PersonaDto>(`/personas?dui=${encodeURIComponent(dui)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Espejo de cada elemento de `GET /especialidades`. */
export interface EspecialidadDto {
  especialidadId: number
  nombre: string
  activa: boolean
}

/**
 * Catálogo completo de especialidades (incluye inactivas); quien llame filtra
 * por `activa` si solo quiere ofrecer las vigentes en un selector.
 */
export async function listarEspecialidades(): Promise<EspecialidadDto[]> {
  return apiFetch<EspecialidadDto[]>('/especialidades')
}
