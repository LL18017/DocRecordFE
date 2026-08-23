// ─── Servicio de prescripciones ────────────────────────────────────────────
// Recetas bajo `/prescripciones`. Una receta cuelga SIEMPRE de una consulta
// (`consultaId`): no existe la receta suelta, y por eso no hay endpoint para
// emitir una sin consulta previa. El médico que la firma lo pone el backend
// desde el JWT.
//
// ESTADO: igual que `services/consultas.ts`, escrito contra el contrato
// acordado mientras el backend se construía (`GET /prescripciones` respondía
// 404 «La URL solicitada no existe»).

import { ApiError, apiFetch } from '@/lib/api'
import { formatearFechaHora } from './consultas'

/**
 * Una línea de la receta tal como la devuelve el backend.
 *
 * `dosis`, `frecuencia` y `duracion` son anulables porque el contrato las
 * marca opcionales al crear: lo que no se envía vuelve como `null`, no como
 * cadena vacía. Es el mismo tipo de nulo que ya rompió una pantalla en este
 * proyecto, así que la tabla de medicamentos tiene que decidir qué pinta
 * cuando faltan (ver `textoOpcional`).
 */
export interface MedicamentoPrescritoDto {
  id: number
  medicamento: string
  dosis: string | null
  frecuencia: string | null
  duracion: string | null
}

/** Médico que firma la receta, anidado en `PrescripcionDto`. */
export interface PrescripcionMedicoDto {
  personaId: number
  nombres: string
  apellidos: string
}

/** Espejo de `PrescripcionDto`. */
export interface PrescripcionDto {
  prescripcionId: number
  /** Marca de tiempo de emisión; se pinta con `formatearFechaEmision`. */
  fecha: string
  consultaId: number
  medico: PrescripcionMedicoDto
  medicamentos: MedicamentoPrescritoDto[]
}

/** Una línea tal como se envía al crear. Solo `medicamento` es obligatorio. */
export interface MedicamentoPayload {
  medicamento: string
  dosis?: string
  frecuencia?: string
  duracion?: string
}

/** Cuerpo de `POST /prescripciones`. */
export interface CrearPrescripcionPayload {
  consultaId: number
  medicamentos: MedicamentoPayload[]
}

/**
 * Lo que se le dice a quien intenta emitir una receta sin medicamentos.
 *
 * Se exporta para que el formulario muestre exactamente este texto y la
 * prueba lo compare contra una sola fuente, en vez de contra dos frases
 * parecidas que se desincronizan.
 */
export const MENSAJE_RECETA_VACIA =
  'Una receta necesita al menos un medicamento. Agrega uno antes de emitirla.'

/**
 * Deja la lista lista para enviar: descarta líneas sin nombre de medicamento
 * y omite —no manda vacíos— los campos opcionales que quedaron en blanco.
 *
 * Enviar `dosis: ''` no es lo mismo que no enviarla: la primera guarda una
 * cadena vacía que luego se pinta como un hueco raro en la receta impresa,
 * mientras que omitirla deja el `null` que la interfaz ya sabe mostrar como
 * «—». Se exporta porque el formulario la usa para saber, antes de enviar,
 * cuántas líneas útiles hay de verdad.
 */
export function normalizarMedicamentos(
  medicamentos: readonly MedicamentoPayload[],
): MedicamentoPayload[] {
  const opcional = (valor: string | undefined) => {
    const limpio = valor?.trim()
    return limpio ? limpio : undefined
  }

  return medicamentos
    .filter((m) => m.medicamento.trim() !== '')
    .map((m) => {
      const linea: MedicamentoPayload = { medicamento: m.medicamento.trim() }
      const dosis = opcional(m.dosis)
      const frecuencia = opcional(m.frecuencia)
      const duracion = opcional(m.duracion)
      if (dosis) linea.dosis = dosis
      if (frecuencia) linea.frecuencia = frecuencia
      if (duracion) linea.duracion = duracion
      return linea
    })
}

/**
 * Emite una receta. Responde 201.
 *
 * Regla de negocio: UNA RECETA SIN MEDICAMENTOS NO ES UNA RECETA. El
 * formulario ya lo impide, pero la comprobación vive también aquí porque es
 * del dominio, no de un formulario concreto: cualquier otra pantalla que
 * emita recetas mañana la hereda, y así no se manda al backend una petición
 * que se sabe inválida solo para que la rechace.
 */
export async function crearPrescripcion(
  payload: CrearPrescripcionPayload,
): Promise<PrescripcionDto> {
  const medicamentos = normalizarMedicamentos(payload.medicamentos)
  if (medicamentos.length === 0) throw new Error(MENSAJE_RECETA_VACIA)

  try {
    return await apiFetch<PrescripcionDto>('/prescripciones', {
      method: 'POST',
      body: { consultaId: payload.consultaId, medicamentos },
    })
  } catch (error) {
    throw traducirError(error, 'emitir')
  }
}

/** Recetas emitidas en una consulta. */
export async function listarPrescripcionesDeConsulta(
  consultaId: number,
): Promise<PrescripcionDto[]> {
  return apiFetch<PrescripcionDto[]>(
    `/prescripciones?consultaId=${encodeURIComponent(consultaId)}`,
  )
}

/** Todas las recetas de un paciente, de todas sus consultas. */
export async function listarPrescripcionesDePaciente(
  pacienteId: number,
): Promise<PrescripcionDto[]> {
  return apiFetch<PrescripcionDto[]>(
    `/prescripciones?pacienteId=${encodeURIComponent(pacienteId)}`,
  )
}

/** Obtiene una receta. Lanza `ApiError` 404 si no existe. */
export async function obtenerPrescripcion(prescripcionId: number): Promise<PrescripcionDto> {
  try {
    return await apiFetch<PrescripcionDto>(`/prescripciones/${prescripcionId}`)
  } catch (error) {
    throw traducirError(error, 'abrir')
  }
}

/** Anula una receta. Responde 204 sin cuerpo. */
export async function eliminarPrescripcion(prescripcionId: number): Promise<void> {
  try {
    await apiFetch<void>(`/prescripciones/${prescripcionId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error, 'anular')
  }
}

// ─── Ayudas de presentación ────────────────────────────────────────────────

/** Nombre completo del médico que firma. */
export function nombreDeMedicoQueReceta(prescripcion: PrescripcionDto): string {
  return `${prescripcion.medico.nombres} ${prescripcion.medico.apellidos}`.trim()
}

/**
 * Fecha de emisión ya formateada. Reusa el formateador de consultas, que a su
 * vez reusa `parsearFechaCivil`: si el backend acabara mandando esta fecha
 * sin hora, se sigue mostrando el día correcto en El Salvador en vez del
 * anterior.
 */
export function formatearFechaEmision(prescripcion: PrescripcionDto): string {
  return formatearFechaHora(prescripcion.fecha)
}

/**
 * Texto de una celda opcional de la receta. `dosis`, `frecuencia` y
 * `duracion` llegan `null` cuando el médico no las especificó; el guion es el
 * mismo que ya usa el expediente para los datos que faltan, y es lo que evita
 * pintar «null» en una receta que alguien va a llevar a la farmacia.
 */
export function textoOpcional(valor: string | null): string {
  return valor?.trim() ? valor : '—'
}

/**
 * Traduce solo lo que el backend no explica por sí solo; mismo criterio que
 * en services/clinicas.ts y services/consultas.ts. El 400 y el 403 pasan
 * enteros: el primero llega con el campo que falla gracias a `lib/api.ts`, y
 * el segundo con la regla concreta que se incumplió.
 */
function traducirError(error: unknown, accion: 'emitir' | 'abrir' | 'anular'): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }

  if (error.status === 404) {
    // Al emitir, el 404 no habla de la receta —que aún no existe— sino de la
    // consulta a la que se quiso colgar. Decir «esta receta ya no existe»
    // ahí sería directamente falso.
    return accion === 'emitir'
      ? new ApiError(
          404,
          'La consulta a la que se quiso agregar la receta ya no existe, así que no se emitió.',
        )
      : new ApiError(404, 'Esta receta ya no existe; puede que alguien la haya anulado.')
  }

  return error
}
