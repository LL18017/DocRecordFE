// ─── Mi perfil · el paciente (DEF-07: HU-33 c4, HU-14 c4) ──────────────────
// Lo que el PACIENTE ve y ajusta de sí mismo, aparte de su expediente:
//
//   · GET  /api/mi-perfil          → sus datos básicos y si recibe recordatorios.
//   · PUT  /api/mi-perfil          → cambia SOLO `recibeRecordatorios` (HU-33 c4).
//   · GET  /api/mi-perfil/habitos  → sus hábitos vigentes, en solo lectura (HU-14 c4).
//
// Como `/mi/expediente`, ninguna llamada lleva un id: el backend toma al
// paciente del token. El `/api` es parte de la ruta del backend. Solo el rol
// PACIENTE: a cualquier otro el backend le responde 403.
//
// Apagar los recordatorios solo corta el aviso automático ~24 h antes de la
// cita; las confirmaciones de cita agendada, cancelada o reprogramada siguen
// llegando, porque son avisos de algo que ya pasó, no recordatorios.
import { ApiError, apiFetch, esNegativaGenericaDePermisos } from '@/lib/api'
import type { HabitoDto } from '@/services/habitos'

/** Espejo de la respuesta de `GET /api/mi-perfil`. */
export interface MiPerfilDto {
  pacienteId: number
  expediente: string
  nombres: string
  apellidos: string
  correo: string | null
  telefono: string | null
  /** true: le llega el recordatorio de cita por correo un día antes. */
  recibeRecordatorios: boolean
}

const RUTA = '/api/mi-perfil'

export async function obtenerMiPerfil(): Promise<MiPerfilDto> {
  try {
    return await apiFetch<MiPerfilDto>(RUTA)
  } catch (error) {
    throw traducirError(error, 'No se pudo abrir tu perfil.')
  }
}

/** Devuelve el perfil ya actualizado, tal como quedó en el servidor. */
export async function actualizarRecordatorios(recibeRecordatorios: boolean): Promise<MiPerfilDto> {
  try {
    return await apiFetch<MiPerfilDto>(RUTA, { method: 'PUT', body: { recibeRecordatorios } })
  } catch (error) {
    throw traducirError(error, 'No se pudo guardar tu preferencia de recordatorios.')
  }
}

/** Solo los vigentes: los anulados no se le muestran al paciente. */
export async function listarMisHabitos(): Promise<HabitoDto[]> {
  try {
    return await apiFetch<HabitoDto[]>(`${RUTA}/habitos`)
  } catch (error) {
    throw traducirError(error, 'No se pudieron cargar tus hábitos.')
  }
}

/**
 * Como en el portal: el 403 con motivo propio (la cuenta no está vinculada a un
 * expediente) pasa con el texto del backend; solo la negativa genérica por rol
 * se explica.
 */
function traducirError(error: unknown, porDefecto: string): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error(porDefecto)
  }
  if (esNegativaGenericaDePermisos(error)) {
    return new ApiError(403, 'Mi perfil es solo para cuentas de paciente.')
  }
  return error
}
