// ─── Servicio de clínicas ─────────────────────────────────────────────────
// CRUD de las clínicas bajo `/clinics`. El propietario nunca viaja en el
// cuerpo: el backend lo saca del JWT, así que `POST /clinics` crea siempre
// para el usuario autenticado y `GET /clinics/mias` devuelve solo las suyas.
//
// Todos los endpoints exigen rol ADMIN o MEDICO. Además, al editar o eliminar,
// un MEDICO solo puede tocar las clínicas de las que es dueño; un ADMIN puede
// con cualquiera. Ambas negativas llegan como 403.

import { ApiError, apiFetch } from '@/lib/api'
import type { Clinica } from '@/types'

/**
 * Espejo de `ClinicasResponseDto`.
 *
 * `latitud` y `longitud` se declaran anulables porque las columnas `latitud` y
 * `longitud` de la tabla `clinicas` admiten NULL: hay filas —creadas antes de
 * que el request exigiera coordenadas, o cargadas a mano— que no las tienen.
 * El DTO de Java no lo dice (son `Double`, que también acepta null), así que
 * es aquí donde el tipo tiene que obligar a manejarlo. Declararlas `number` a
 * secas compila igual y revienta en pantalla, que es exactamente el fallo que
 * ya ocurrió con `PersonaDto.dui`.
 */
export interface ClinicaDto {
  clinicaId: number
  name: string
  latitud: number | null
  longitud: number | null
}

/**
 * Espejo de `ClinicasRequestDto`, que se usa tanto para crear como para
 * editar. Ojo con la asimetría respecto a la respuesta: aquí `latitud` y
 * `longitud` son obligatorias (`@NotNull` en el backend, 400 si faltan)
 * aunque la columna las admita nulas. Se puede leer una clínica sin
 * coordenadas, pero no guardar una nueva sin ellas.
 *
 * `name` no puede pasar de 100 caracteres (`@Size(max = 100)`).
 */
export interface GuardarClinicaPayload {
  name: string
  latitud: number
  longitud: number
}

/** Longitud máxima de `name` según `@Size(max = 100)` del backend. */
export const MAX_LARGO_NOMBRE_CLINICA = 100

/** Clínicas del usuario autenticado. Lista vacía si no tiene ninguna. */
export async function listarMisClinicas(): Promise<ClinicaDto[]> {
  return apiFetch<ClinicaDto[]>('/clinics/mias')
}

/** Registra una clínica a nombre del usuario autenticado. */
export async function crearClinica(payload: GuardarClinicaPayload): Promise<ClinicaDto> {
  try {
    return await apiFetch<ClinicaDto>('/clinics', { method: 'POST', body: payload })
  } catch (error) {
    throw traducirError(error, 'crear')
  }
}

/**
 * Actualiza una clínica.
 *
 * A diferencia de `PUT /pacientes/{id}`, este endpoint reemplaza: el backend
 * asigna nombre, latitud y longitud tal cual vienen. Por eso el payload es
 * completo y no parcial; enviar solo el campo que cambió borraría los demás.
 */
export async function actualizarClinica(
  clinicaId: number,
  payload: GuardarClinicaPayload,
): Promise<ClinicaDto> {
  try {
    return await apiFetch<ClinicaDto>(`/clinics/${clinicaId}`, {
      method: 'PUT',
      body: payload,
    })
  } catch (error) {
    throw traducirError(error, 'editar')
  }
}

/** Elimina una clínica. Responde 204 sin cuerpo. */
export async function eliminarClinica(clinicaId: number): Promise<void> {
  try {
    await apiFetch<void>(`/clinics/${clinicaId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error, 'eliminar')
  }
}

/**
 * Adapta el DTO al tipo `Clinica` que consumen las pantallas y el
 * `activeClinic` del contexto. Las coordenadas viajan tal cual, nulos
 * incluidos: sustituirlas aquí por un 0 o por un punto por defecto pondría a
 * la clínica en medio del Atlántico sin que nadie se enterara.
 *
 * Vive en el servicio y no en `lib/` —donde está `pacienteAdapter`— porque
 * las dos pantallas de clínicas lo necesitan y no debe haber dos copias de la
 * regla de nulos.
 */
export function clinicaDtoAClinica(dto: ClinicaDto): Clinica {
  return {
    id: dto.clinicaId,
    name: dto.name,
    lat: dto.latitud,
    lng: dto.longitud,
  }
}

/**
 * Formatea las coordenadas para mostrarlas, o `null` si la clínica no tiene
 * ubicación registrada. Se devuelve `null` en vez de un texto ya redactado
 * para que cada pantalla escriba el aviso con sus palabras, pero que la
 * decisión de «esto no se puede mostrar» se tome en un solo sitio.
 *
 * Una sola coordenada no ubica nada, así que basta con que falte una para
 * considerar que no hay ubicación.
 */
export function formatearCoordenadas(
  lat: number | null,
  lng: number | null,
): string | null {
  if (lat === null || lng === null) return null
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

/**
 * Traduce los códigos del backend a algo accionable.
 *
 * Hace falta porque el manejador global de errores responde
 * `{ "error": "Error", "message": "..." }` y `extraerMensajeDeError` de
 * `lib/api.ts` prefiere `error` sobre `message`: sin esto, borrar la clínica
 * de otro médico mostraría literalmente «Error». Las validaciones (400)
 * llegan aún peor, como un mapa `{ campo: mensaje }` que no tiene ni `error`
 * ni `message`.
 */
function traducirError(error: unknown, accion: 'crear' | 'editar' | 'eliminar'): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }

  switch (error.status) {
    case 400:
      return new ApiError(
        400,
        `El nombre es obligatorio (máximo ${MAX_LARGO_NOMBRE_CLINICA} caracteres) y la ubicación necesita latitud y longitud.`,
      )
    case 403:
      return new ApiError(
        403,
        `No tienes permiso para ${accion} esta clínica: solo su propietario o un administrador puede hacerlo.`,
      )
    case 404:
      return new ApiError(404, 'Esta clínica ya no existe; puede que alguien la haya eliminado.')
    case 409:
      return new ApiError(
        409,
        'No se puede eliminar la clínica porque tiene información asociada.',
      )
    default:
      return error
  }
}
