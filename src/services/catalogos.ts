// ─── Catálogos que mantiene el Administrador (DEF-01 · HU-14 y HU-30) ──────
// Dos listas pequeñas de las que dependen otras pantallas:
//
//   · Tipos de cita (`/tipos-cita`, SIN el prefijo `/api`): sin al menos uno,
//     la agenda no deja agendar.
//   · Tipos de hábito (`/api/habitos-estilo-de-vida/tipos`, CON el prefijo):
//     sin al menos uno, el expediente no deja anotar hábitos.
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja): leer, ADMIN,
// MÉDICO y ENFERMERA; crear, editar y borrar, solo ADMIN.
//
// Ninguno de los dos tiene campo `activo`: el backend solo permite BORRAR, y un
// tipo que ya se usa no se puede borrar (citas: la clave foránea es RESTRICT;
// hábitos: 400 «tiene registros asociados»). Por eso aquí no hay «desactivar».
//
// El backend tampoco impide nombres repetidos: la pantalla los compara contra
// el listado antes de enviar (`yaExiste`).
import { ApiError, apiFetch } from '@/lib/api'
import { listarTiposDeCita, type TipoDeCitaDto } from '@/services/citas'
import { listarTiposDeHabito, type TipoDeHabitoDto } from '@/services/habitos'

export { listarTiposDeCita, listarTiposDeHabito }
export type { TipoDeCitaDto, TipoDeHabitoDto }

/** Topes de largo del backend (validaciones del DTO). */
export const MAX_NOMBRE_TIPO_CITA = 100
export const MAX_DESCRIPCION_TIPO_CITA = 255
export const MAX_DESCRIPCION_TIPO_HABITO = 255

export interface GuardarTipoDeCitaPayload {
  nombre: string
  /** Opcional: en el PUT, omitirla la deja en null. */
  descripcion?: string
}

export interface GuardarTipoDeHabitoPayload {
  descripcion: string
}

const RUTA_TIPOS_CITA = '/tipos-cita'
const RUTA_TIPOS_HABITO = '/api/habitos-estilo-de-vida/tipos'

/**
 * El error que se le muestra al administrador. Por regla es el `message` del
 * backend tal cual (lo que `apiFetch` ya pone en `ApiError.message`); solo se
 * reemplazan los casos en que el backend no dice nada útil:
 *
 *   · Un 500 al editar o borrar un tipo de cita: el servicio lanza una
 *     excepción genérica cuando el id no existe y no hay manejador, así que
 *     llega «Error interno» con un id de error.
 *   · Borrar un tipo de cita que ya usan citas: la FK RESTRICT falla al
 *     confirmar la transacción y llega como 409 o 500.
 */
function traducirErrorDeTipoDeCita(error: unknown, accion: 'guardar' | 'eliminar'): unknown {
  if (!(error instanceof ApiError)) return error
  if (accion === 'eliminar' && (error.status === 409 || error.status === 500)) {
    return new ApiError(
      error.status,
      'No se puede eliminar el tipo de cita porque tiene citas asociadas.',
    )
  }
  if (error.status === 500) {
    return new ApiError(
      error.status,
      'No se pudo guardar el tipo de cita. Puede que otro administrador lo haya eliminado; recarga la lista.',
    )
  }
  return error
}

export async function crearTipoDeCita(payload: GuardarTipoDeCitaPayload): Promise<TipoDeCitaDto> {
  try {
    return await apiFetch<TipoDeCitaDto>(RUTA_TIPOS_CITA, { method: 'POST', body: payload })
  } catch (error) {
    throw traducirErrorDeTipoDeCita(error, 'guardar')
  }
}

export async function actualizarTipoDeCita(
  tipoCitaId: number,
  payload: GuardarTipoDeCitaPayload,
): Promise<TipoDeCitaDto> {
  try {
    return await apiFetch<TipoDeCitaDto>(`${RUTA_TIPOS_CITA}/${tipoCitaId}`, {
      method: 'PUT',
      body: payload,
    })
  } catch (error) {
    throw traducirErrorDeTipoDeCita(error, 'guardar')
  }
}

export async function eliminarTipoDeCita(tipoCitaId: number): Promise<void> {
  try {
    await apiFetch<void>(`${RUTA_TIPOS_CITA}/${tipoCitaId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirErrorDeTipoDeCita(error, 'eliminar')
  }
}

// Los tipos de hábito sí responden con mensajes claros (404 con el id, 400
// «tiene registros asociados»), así que se muestran tal cual.

export function crearTipoDeHabito(payload: GuardarTipoDeHabitoPayload): Promise<TipoDeHabitoDto> {
  return apiFetch<TipoDeHabitoDto>(RUTA_TIPOS_HABITO, { method: 'POST', body: payload })
}

export function actualizarTipoDeHabito(
  id: number,
  payload: GuardarTipoDeHabitoPayload,
): Promise<TipoDeHabitoDto> {
  return apiFetch<TipoDeHabitoDto>(`${RUTA_TIPOS_HABITO}/${id}`, { method: 'PUT', body: payload })
}

export async function eliminarTipoDeHabito(id: number): Promise<void> {
  await apiFetch<void>(`${RUTA_TIPOS_HABITO}/${id}`, { method: 'DELETE' })
}

/** Para comparar nombres sin distinguir mayúsculas, tildes ni espacios sobrantes. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * ¿Ya hay en la lista otro elemento con ese nombre? `excluirId` es el que se
 * está editando: guardarlo con su mismo nombre no es un duplicado.
 */
export function yaExiste<T>(
  lista: readonly T[],
  nombre: string,
  leerNombre: (item: T) => string,
  leerId: (item: T) => number,
  excluirId?: number,
): boolean {
  const buscado = normalizarNombre(nombre)
  return lista.some((item) => leerId(item) !== excluirId && normalizarNombre(leerNombre(item)) === buscado)
}

/** Orden alfabético en español: el backend no garantiza ningún orden. */
export function ordenarPorNombre<T>(lista: readonly T[], leerNombre: (item: T) => string): T[] {
  return [...lista].sort((a, b) => leerNombre(a).localeCompare(leerNombre(b), 'es'))
}
