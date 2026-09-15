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
 * Sobre paginado con el que el backend envuelve TODA lista de `/prescripciones`
 * (y otros listados): `contenido` trae solo los elementos de esta página,
 * mientras que `totalElementos`/`totalPaginas` describen el conjunto completo.
 * `paginaActual` es base 0.
 */
export interface PaginaDto<T> {
  contenido: T[]
  paginaActual: number
  tamanoPagina: number
  totalElementos: number
  totalPaginas: number
}

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

/**
 * Paciente tal como viene anidado en `PrescripcionDto`.
 *
 * Mismo shape EXACTO que `ConsultaPacienteDto` (services/consultas.ts):
 * ambos anidan la misma proyección de `persona` que ya trae `expediente`, y
 * duplicar el tipo en vez de reexportarlo evita que este módulo dependa de
 * consultas por un detalle de forma, no de comportamiento.
 */
export interface PrescripcionPacienteDto {
  personaId: number
  expediente: string
  nombres: string
  apellidos: string
}

/**
 * Espejo de `PrescripcionDto`.
 *
 * `paciente` es un campo ADITIVO: antes de él, esta pantalla no podía decir
 * de quién era cada receta sin conocer ya el `pacienteId` que la filtraba
 * (ver `listarHistoricoDePrescripciones`, que ahora no lo exige).
 */
export interface PrescripcionDto {
  prescripcionId: number
  /** Marca de tiempo de emisión; se pinta con `formatearFechaEmision`. */
  fecha: string
  consultaId: number
  paciente: PrescripcionPacienteDto
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

/**
 * Recetas emitidas en una consulta.
 *
 * El backend responde con el sobre paginado de siempre (`PaginaDto`), pero
 * esta función solo devuelve `.contenido`: el tamaño de página por defecto
 * (20) cubre de sobra las recetas de una sola consulta, así que paginar aquí
 * no aporta nada y solo complicaría a quien la llama.
 */
export async function listarPrescripcionesDeConsulta(
  consultaId: number,
): Promise<PrescripcionDto[]> {
  const pagina = await apiFetch<PaginaDto<PrescripcionDto>>(
    `/prescripciones?consultaId=${encodeURIComponent(consultaId)}`,
  )
  return pagina.contenido
}

/**
 * Todas las recetas de un paciente, de todas sus consultas.
 *
 * Mismo sobre paginado que arriba; se desenvuelve aquí por la misma razón.
 */
export async function listarPrescripcionesDePaciente(
  pacienteId: number,
): Promise<PrescripcionDto[]> {
  const pagina = await apiFetch<PaginaDto<PrescripcionDto>>(
    `/prescripciones?pacienteId=${encodeURIComponent(pacienteId)}`,
  )
  return pagina.contenido
}

/**
 * Filtros del histórico general de recetas. Todos opcionales y COMBINABLES:
 * el backend los aplica todos a la vez, no uno solo. `desde` y `hasta` son
 * fechas civiles `YYYY-MM-DD`, tal cual las entrega un `<input type="date">`,
 * sin transformar. `pagina` es base 0 (por defecto 0); `tamano` topa en 100
 * del lado del backend (por defecto 20 si se omite).
 */
export interface FiltroHistoricoDeRecetas {
  pacienteId?: number
  medicoId?: number
  desde?: string
  hasta?: string
  pagina?: number
  tamano?: number
}

/**
 * Histórico de recetas: `GET /prescripciones` con los filtros presentes,
 * combinables y todos opcionales. Sin ninguno, pide la primera página del
 * histórico completo; el orden (más reciente primero) lo garantiza el
 * backend, así que aquí no se reordena nada.
 *
 * Devuelve el sobre paginado TAL CUAL —sin desenvolver—: a diferencia de
 * `listarPrescripcionesDeConsulta`/`listarPrescripcionesDePaciente`, esta es
 * la pantalla que necesita saber cuántas recetas hay en total y pedir más
 * páginas, así que es la única función de este módulo que expone `PaginaDto`
 * a quien la llama.
 */
export async function listarHistoricoDePrescripciones(
  filtro: FiltroHistoricoDeRecetas = {},
): Promise<PaginaDto<PrescripcionDto>> {
  const params = new URLSearchParams()
  if (filtro.pacienteId !== undefined) params.set('pacienteId', String(filtro.pacienteId))
  if (filtro.medicoId !== undefined) params.set('medicoId', String(filtro.medicoId))
  if (filtro.desde !== undefined) params.set('desde', filtro.desde)
  if (filtro.hasta !== undefined) params.set('hasta', filtro.hasta)
  if (filtro.pagina !== undefined) params.set('pagina', String(filtro.pagina))
  if (filtro.tamano !== undefined) params.set('tamano', String(filtro.tamano))

  const query = params.toString()
  return apiFetch<PaginaDto<PrescripcionDto>>(`/prescripciones${query ? `?${query}` : ''}`)
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

/** Nombre completo del paciente al que pertenece la receta. */
export function nombreDePacienteDeReceta(prescripcion: PrescripcionDto): string {
  return `${prescripcion.paciente.nombres} ${prescripcion.paciente.apellidos}`.trim()
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
 * Texto de una celda opcional de la receta (`dosis`, `frecuencia`,
 * `duracion`, que llegan `null` cuando el médico no las especificó).
 *
 * La implementación se mudó a services/consultas.ts cuando `motivo` resultó
 * ser igual de anulable: dos copias de la misma regla acaban decidiendo
 * distinto. Se reexporta desde aquí para que las pantallas de recetas —donde
 * la ayuda nació— la sigan importando de su módulo natural, y para no dejar
 * un `import` de consultas en medio de una receta.
 */
export { textoOpcional } from './consultas'

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
