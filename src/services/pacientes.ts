// ─── Servicio de pacientes ─────────────────────────────────────────────────
// Alta y búsqueda de pacientes sobre `persona`: `POST /pacientes` siempre
// manda un objeto `persona`; si trae `personaId`, completa esa persona ya
// existente con los campos que falten en vez de crear una nueva.
//
// Este servicio NO traduce los errores del backend. `lib/api.ts` prefiere el
// campo `message` sobre `error`, así que el motivo concreto de cada 409 llega
// ya redactado; las sustituciones que había aquí lo tapaban. La regla para
// añadir una nueva: solo si el texto local es MÁS preciso que el del backend,
// y nunca si puede resultar falso en un caso que este módulo no controla.

import { apiFetch } from '@/lib/api'
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
  tipoSangre: string
  // Sin `expediente`: lo genera el backend con un correlativo. Pedirle a quien
  // registra que invente un número único garantiza colisiones, porque no puede
  // saber cuál es el siguiente libre.
}

/**
 * Espejo de la respuesta de `POST /pacientes` y de cada fila de `GET /pacientes`.
 * La clave es `personaId` (compartida con `persona`); no existe `pacienteId`.
 */
export interface PacienteDto {
  personaId: number
  expediente: string
  /** La columna admite NULL en el backend; el DTO no lo exige. */
  tipoSangre: string | null
  creadoEn: string
  persona: Omit<PersonaDto, 'esMedico' | 'esEnfermera' | 'esPaciente'>
}

/** Todo opcional: se envía únicamente lo que cambió. */
export interface ActualizarPacientePayload {
  persona?: Partial<Omit<PersonaParaPaciente, 'personaId'>>
  tipoSangre?: string
}

/**
 * Da de alta un paciente, o completa y da de alta a una persona ya
 * encontrada por DUI si `payload.persona.personaId` viene incluido.
 *
 * El 409 se deja pasar a propósito, y por dos razones distintas según el caso.
 *
 * Completando una persona existente el backend ya distingue los dos
 * conflictos posibles, y lo dice mejor de lo que se decía aquí:
 *
 *   {"error":"Error","message":"Esta persona ya esta registrada como paciente"}
 *   {"error":"Error","message":"El DUI recibido no coincide con el de la persona existente"}
 *
 * Se sustituían por una sola frase —«Esta persona ya está registrada como
 * paciente, o el DUI no coincide con su registro»— cuyo «o» juntaba dos
 * causas que exigen acciones opuestas: en un caso hay que buscar al paciente
 * ya dado de alta, en el otro hay que corregir el DUI tecleado. Quien la
 * leía perdía justo el dato que el backend sí le estaba dando.
 *
 * Creando una persona nueva el 409 llega genérico —«La operación no puede
 * realizarse porque los datos entran en conflicto con información
 * existente»—, pero el texto local que lo reemplazaba, «Esta persona ya está
 * registrada como paciente», es directamente falso en un caso comprobado:
 * una persona puede existir por su DUI sin ser paciente (solo médico o
 * enfermera, o un paciente dado de baja), y el conflicto entonces es el DUI
 * ya registrado, no una alta duplicada. Vago pero cierto es mejor que preciso
 * y mentiroso.
 *
 * El 422 por falta de fechaNacimiento/sexo ya llega legible desde el backend.
 */
export async function crearPaciente(payload: CrearPacientePayload): Promise<PacienteDto> {
  return apiFetch<PacienteDto>('/pacientes', { method: 'POST', body: payload })
}

/**
 * Lista pacientes. `buscar` es un único texto libre que el backend compara
 * contra apellidos, nombres o DUI; sin parámetro devuelve todos.
 */
export async function listarPacientes(buscar?: string): Promise<PacienteDto[]> {
  const query = buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''
  return apiFetch<PacienteDto[]>(`/pacientes${query}`)
}

/** Obtiene un paciente por el id de su persona. Lanza `ApiError` 404 si no existe. */
export async function obtenerPaciente(personaId: number): Promise<PacienteDto> {
  return apiFetch<PacienteDto>(`/pacientes/${personaId}`)
}

/**
 * Actualiza un paciente.
 *
 * El backend completa sin destruir: un campo ausente significa «no lo estoy
 * tocando», no «bórralo». Por eso se puede enviar solo lo que cambió.
 *
 * El expediente no se envía nunca: lo emite el sistema y no es editable.
 *
 * Aquí tampoco se traduce el 409. El único conflicto que hoy devuelve
 * `PUT /pacientes/{id}` llega como «El DUI no coincide con el de la persona
 * registrada»: palabra por palabra lo que se estaba escribiendo encima, así
 * que la sustitución no aportaba nada. Lo que sí hacía era aplicar esa frase
 * a CUALQUIER 409, de modo que el día que el backend devuelva otro conflicto
 * el usuario leería un motivo que no es el suyo. Un mensaje falso es peor que
 * uno vago.
 */
export async function actualizarPaciente(
  personaId: number,
  payload: ActualizarPacientePayload,
): Promise<PacienteDto> {
  return apiFetch<PacienteDto>(`/pacientes/${personaId}`, {
    method: 'PUT',
    body: payload,
  })
}

/**
 * Da de baja a un paciente.
 *
 * Solo deja de ser paciente: la persona se conserva, porque esa misma
 * identidad puede ser además médico o enfermera del sistema.
 */
export async function eliminarPaciente(personaId: number): Promise<void> {
  await apiFetch<void>(`/pacientes/${personaId}`, { method: 'DELETE' })
}
