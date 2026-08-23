// ─── Servicio de pacientes ─────────────────────────────────────────────────
// Alta y búsqueda de pacientes sobre `persona`: `POST /pacientes` siempre
// manda un objeto `persona`; si trae `personaId`, completa esa persona ya
// existente con los campos que falten en vez de crear una nueva.

import { ApiError, apiFetch } from '@/lib/api'
import type { PersonaDto } from './personas'

/**
 * Persona para el alta de un paciente.
 *
 * Con `personaId`: completa esa persona ya existente. Solo hace falta
 * incluir los campos que le faltaban (típicamente fechaNacimiento y sexo);
 * un campo ausente no borra lo que la persona ya tenía, y el backend
 * responde 409 si el `dui` no coincide con el que esa persona ya tiene, así
 * que no se debe permitir editarlo en este caso.
 *
 * Sin `personaId`: crea una persona nueva; dui, nombres, apellidos,
 * fechaNacimiento y sexo son obligatorios (el backend responde 422 si
 * fechaNacimiento o sexo faltan, incluso completando una persona existente).
 */
export interface PersonaParaPaciente {
  personaId?: number
  dui?: string
  nombres?: string
  apellidos?: string
  fechaNacimiento?: string
  sexo?: 'M' | 'F'
  telefono?: string
  direccion?: string
}

export interface CrearPacientePayload {
  persona: PersonaParaPaciente
  expediente: string
  tipoSangre: string
}

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
 * Da de alta un paciente, o completa y da de alta a una persona ya
 * encontrada por DUI si `payload.persona.personaId` viene incluido.
 *
 * Traduce el 409 al mensaje concreto que corresponde según el caso: esa
 * persona ya es paciente, o el DUI no coincide con la persona que se está
 * completando. El 422 por falta de fechaNacimiento/sexo ya llega legible
 * desde el backend.
 */
export async function crearPaciente(payload: CrearPacientePayload): Promise<PacienteDto> {
  try {
    return await apiFetch<PacienteDto>('/pacientes', { method: 'POST', body: payload })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new ApiError(
        409,
        payload.persona.personaId
          ? 'Esta persona ya está registrada como paciente, o el DUI no coincide con su registro.'
          : 'Esta persona ya está registrada como paciente.',
      )
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
