// ─── Servicio de pacientes ─────────────────────────────────────────────────
// Alta y búsqueda de pacientes sobre `persona`: `POST /pacientes` reutiliza
// una persona ya existente (encontrada antes por DUI) o crea una nueva junto
// con el paciente, según el caso.

import { ApiError, apiFetch } from '@/lib/api'
import type { PersonaDto } from './personas'

/**
 * Datos para crear una `persona` nueva como parte del alta de un paciente.
 * `fechaNacimiento` y `sexo` son obligatorios aquí (el backend responde 422
 * si faltan); `telefono` y `direccion` no.
 */
export interface DatosNuevaPersona {
  dui: string
  nombres: string
  apellidos: string
  fechaNacimiento: string
  sexo: 'M' | 'F'
  telefono?: string
  direccion?: string
}

export type CrearPacientePayload =
  | { personaId: number; expediente: string; tipoSangre: string }
  | { persona: DatosNuevaPersona; expediente: string; tipoSangre: string }

/**
 * Espejo de la respuesta de `POST /pacientes` y de cada fila de `GET /pacientes`.
 * La clave es `personaId` (compartida con `persona`); no existe `pacienteId`.
 */
export interface PacienteDto {
  personaId: number
  expediente: string
  tipoSangre: string
  creadoEn: string
  persona: Omit<PersonaDto, 'esMedico' | 'esEnfermera' | 'esPaciente'>
}

/**
 * Da de alta un paciente. Si `payload` trae `personaId`, reutiliza esa
 * persona (la que ya se encontró por DUI); si trae `persona`, crea una
 * persona nueva junto con el paciente.
 *
 * Traduce el 409 ("esa persona ya es paciente") a un mensaje concreto; el
 * 422 por falta de fechaNacimiento/sexo ya llega legible desde el backend.
 */
export async function crearPaciente(payload: CrearPacientePayload): Promise<PacienteDto> {
  try {
    return await apiFetch<PacienteDto>('/pacientes', { method: 'POST', body: payload })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new ApiError(409, 'Esta persona ya está registrada como paciente.')
    }
    throw error
  }
}

/**
 * Lista pacientes. `buscar` es un único texto libre que el backend compara
 * contra apellidos, nombres o DUI; sin parámetro devuelve todos.
 */
export async function listarPacientes(buscar?: string): Promise<PacienteDto[]> {
  const query = buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''
  return apiFetch<PacienteDto[]>(`/pacientes${query}`)
}
