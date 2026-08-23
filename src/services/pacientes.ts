// ─── Servicio de pacientes ─────────────────────────────────────────────────
// Alta y búsqueda de pacientes sobre `persona`: `POST /pacientes` reutiliza
// una persona ya existente (encontrada antes por DUI) o crea una nueva junto
// con el paciente, según el caso.

import { apiFetch } from '@/lib/api'
import type { PersonaDto } from './personas'

/** Datos para crear una `persona` nueva como parte del alta de un paciente. */
export type DatosNuevaPersona = Omit<
  PersonaDto,
  'personaId' | 'esMedico' | 'esEnfermera' | 'esPaciente'
>

export type CrearPacientePayload =
  | { personaId: number; expediente: string; tipoSangre: string }
  | { persona: DatosNuevaPersona; expediente: string; tipoSangre: string }

/** Espejo de la respuesta de `POST /pacientes` y de cada fila de `GET /pacientes`. */
export interface PacienteDto {
  pacienteId: number
  expediente: string
  tipoSangre: string
  persona: PersonaDto
}

/**
 * Da de alta un paciente. Si `payload` trae `personaId`, reutiliza esa
 * persona (la que ya se encontró por DUI); si trae `persona`, crea una
 * persona nueva junto con el paciente.
 */
export async function crearPaciente(payload: CrearPacientePayload): Promise<PacienteDto> {
  return apiFetch<PacienteDto>('/pacientes', { method: 'POST', body: payload })
}

export interface ListarPacientesOpciones {
  /** Búsqueda parcial por apellidos. */
  apellidos?: string
  /** Búsqueda por DUI exacto. */
  dui?: string
}

/**
 * Lista pacientes, opcionalmente filtrados por apellidos o DUI.
 *
 * Nota de contrato: el backend aún no existe; el nombre exacto de estos
 * parámetros de búsqueda se acordó de palabra y no está confirmado en un
 * DTO. Si el endpoint real espera otros nombres, ajustar aquí únicamente.
 */
export async function listarPacientes(
  opciones: ListarPacientesOpciones = {},
): Promise<PacienteDto[]> {
  const params = new URLSearchParams()
  if (opciones.apellidos) params.set('apellidos', opciones.apellidos)
  if (opciones.dui) params.set('dui', opciones.dui)

  const query = params.toString()
  return apiFetch<PacienteDto[]>(`/pacientes${query ? `?${query}` : ''}`)
}
