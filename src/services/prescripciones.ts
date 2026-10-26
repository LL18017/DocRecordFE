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
import { etiquetaDeSeveridad, type SeveridadDeAlergia } from './alergias'

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
  /**
   * El medicamento del catálogo (HU-23). `null` —o ausente— en las recetas
   * emitidas antes del catálogo, que se escribieron como texto libre.
   */
  medicamentoId?: number | null
  /**
   * El nombre TAL COMO QUEDÓ en la receta. No se vuelve a buscar en el
   * catálogo para pintarlo: si el catálogo se corrige o el medicamento se
   * desactiva, la receta ya entregada tiene que seguir diciendo lo mismo.
   */
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
  /**
   * HU-24: por qué se recetó pese a una alergia registrada del paciente.
   * `null` —o ausente— si la receta no tuvo coincidencias, que es lo normal.
   */
  justificacionAlergia?: string | null
}

/**
 * Una línea tal como se envía al crear. Solo `medicamentoId` es obligatorio.
 *
 * Es el id de un medicamento ACTIVO del catálogo, no un nombre: desde HU-23 el
 * backend rechaza con 400 lo que no esté en el catálogo, y el nombre que queda
 * en la receta lo pone él.
 */
export interface MedicamentoPayload {
  medicamentoId: number
  dosis?: string
  frecuencia?: string
  duracion?: string
}

/**
 * Una línea del formulario antes de limpiarla: puede no tener medicamento
 * elegido todavía (`null`), que es lo que `normalizarMedicamentos` descarta.
 */
export type BorradorDeMedicamento = Omit<MedicamentoPayload, 'medicamentoId'> & {
  medicamentoId: number | null
}

/** Cuerpo de `POST /prescripciones`. */
export interface CrearPrescripcionPayload {
  consultaId: number
  medicamentos: readonly BorradorDeMedicamento[]
  /**
   * HU-24: obligatoria si algún medicamento coincide con una alergia vigente
   * del paciente. Si va en blanco se omite, igual que los demás opcionales.
   */
  justificacionAlergia?: string
  /** HU-24: la segunda confirmación explícita que pide una alergia SEVERA. */
  confirmaAlergiaSevera?: boolean
}

/**
 * Espejo de `AlertaDeAlergiaDto` (HU-24): una alergia vigente del paciente
 * que coincide con un medicamento, con lo que el médico necesita leer antes
 * de decidir.
 */
export interface AlertaDeAlergiaDto {
  alergiaId: number
  sustancia: string
  severidad: SeveridadDeAlergia
  reaccion: string
  medicamentoId: number
  /** El medicamento tal como se lee en la receta. */
  medicamento: string
}

/**
 * Cuando el aviso no se pudo pedir. No se calla: sin él, un fallo de red se
 * vería igual que «sin alergias», y el médico seguiría convencido de que se
 * comprobó. El backend vuelve a comprobar al emitir, así que aun así no se
 * receta a ciegas.
 */
export const MENSAJE_ALERTAS_NO_COMPROBADAS =
  'No se pudo comprobar si el paciente tiene alergias a este medicamento. Revisa su expediente antes de emitir; el sistema volverá a comprobarlo al emitir.'

/** Sin justificación no se emite una receta con alerta de alergia (criterio 2). */
export const MENSAJE_FALTA_JUSTIFICACION =
  'El paciente es alérgico a un componente de esta receta. Escribe la justificación para recetarlo de todos modos.'

/** Una alergia severa pide una segunda confirmación explícita (criterio 3). */
export const MENSAJE_FALTA_CONFIRMACION =
  'La alergia es severa. Marca la casilla para confirmar de forma explícita que quieres recetarlo.'

/** Tope de la justificación, el mismo que valida el backend. */
export const MAXIMO_JUSTIFICACION_ALERGIA = 500

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
 * Lo que se dice cuando una línea tiene escrito algo que no se eligió del
 * catálogo (HU-23 criterio 3). Nombra el texto para que el médico sepa cuál
 * de las líneas es, y dice qué hacer si el medicamento de verdad falta.
 */
export function mensajeFueraDelCatalogo(texto: string): string {
  return `«${texto.trim()}» no está en el catálogo de medicamentos. Elígelo de la lista; si no aparece, pídele a un administrador que lo registre.`
}

/**
 * Deja la lista lista para enviar: descarta líneas sin medicamento elegido
 * y omite —no manda vacíos— los campos opcionales que quedaron en blanco.
 *
 * Enviar `dosis: ''` no es lo mismo que no enviarla: la primera guarda una
 * cadena vacía que luego se pinta como un hueco raro en la receta impresa,
 * mientras que omitirla deja el `null` que la interfaz ya sabe mostrar como
 * «—». Se exporta porque el formulario la usa para saber, antes de enviar,
 * cuántas líneas útiles hay de verdad.
 */
export function normalizarMedicamentos(
  medicamentos: readonly BorradorDeMedicamento[],
): MedicamentoPayload[] {
  const opcional = (valor: string | undefined) => {
    const limpio = valor?.trim()
    return limpio ? limpio : undefined
  }

  return medicamentos
    .filter((m): m is BorradorDeMedicamento & { medicamentoId: number } => m.medicamentoId !== null)
    .map((m) => {
      const linea: MedicamentoPayload = { medicamentoId: m.medicamentoId }
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
    const justificacion = payload.justificacionAlergia?.trim()
    return await apiFetch<PrescripcionDto>('/prescripciones', {
      method: 'POST',
      body: {
        consultaId: payload.consultaId,
        medicamentos,
        // Solo viajan cuando hay algo que decir: una receta sin alerta no
        // lleva ni justificación ni confirmación.
        ...(justificacion ? { justificacionAlergia: justificacion } : {}),
        ...(payload.confirmaAlergiaSevera ? { confirmaAlergiaSevera: true } : {}),
      },
    })
  } catch (error) {
    throw traducirError(error, 'emitir')
  }
}

/**
 * HU-24: las alergias vigentes del paciente que coinciden con un medicamento.
 * `pacienteId` es el `personaId` del paciente. Lista vacía si no hay ninguna
 * (criterio 4): no es un error y el flujo sigue normal.
 *
 * La coincidencia es por texto —la sustancia contenida en el principio activo
 * o en el nombre genérico—, no por familia farmacológica: una alergia a
 * «Penicilina» no avisa de «Amoxicilina». Lo decide el backend; aquí no se
 * vuelve a filtrar nada.
 */
export async function buscarAlertasDeAlergia(
  pacienteId: number,
  medicamentoId: number,
): Promise<AlertaDeAlergiaDto[]> {
  const params = new URLSearchParams({
    pacienteId: String(pacienteId),
    medicamentoId: String(medicamentoId),
  })
  try {
    return await apiFetch<AlertaDeAlergiaDto[]>(`/prescripciones/alertas-de-alergia?${params}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(404, 'El paciente o el medicamento ya no existen; no se pudo comprobar las alergias.')
    }
    throw error instanceof Error ? error : new Error(MENSAJE_ALERTAS_NO_COMPROBADAS)
  }
}

/**
 * HU-24 criterio 5: el médico vio la alerta y NO recetó. Deja constancia en la
 * bitácora (`POST /prescripciones/alertas-de-alergia/decision`); si recetó
 * pese a la alerta, ese registro lo escribe el backend al emitir la receta.
 *
 * Es un aviso de mejor esfuerzo: si falla, la pantalla no debe trabar al
 * médico que ya decidió no recetar, así que no lanza. Devuelve si quedó
 * registrado, para quien quiera reintentar o avisar.
 */
export async function registrarDesistimientoDeAlerta(
  pacienteId: number,
  medicamentoId: number,
): Promise<boolean> {
  try {
    await apiFetch<void>('/prescripciones/alertas-de-alergia/decision', {
      method: 'POST',
      body: { pacienteId, medicamentoId, decision: 'DESISTIO' },
    })
    return true
  } catch {
    return false
  }
}

/** Texto de una alerta para mostrarla o registrarla: «Penicilina (Severa) · Urticaria». */
export function resumenDeAlerta(alerta: AlertaDeAlergiaDto): string {
  return `${alerta.sustancia} (${etiquetaDeSeveridad(alerta.severidad)}) · ${alerta.reaccion}`
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

/**
 * HU-25: encola el envío de la receta de una consulta, en PDF, al correo del
 * paciente. Responde 204 y el correo sale en los siguientes segundos. Llamarlo
 * otra vez la reenvía. 422 si la consulta no tiene receta.
 */
export async function enviarRecetaPorCorreo(consultaId: number): Promise<void> {
  await apiFetch<void>(`/prescripciones/enviar-receta/${consultaId}`, { method: 'POST' })
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
