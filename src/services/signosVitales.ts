// ─── Servicio de signos vitales ────────────────────────────────────────────
// Las constantes que enfermería toma ANTES de la consulta, bajo
// `/signos-vitales`. La enfermera que toma NUNCA viaja en el cuerpo: el
// backend la saca del JWT, igual que `/consultas` con el médico y `/clinics`
// con el propietario.
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja):
//   · Registrar → solo ENFERMERA. Un médico recibe 403.
//   · Leer      → ADMIN, MÉDICO y ENFERMERA. Ésta es la razón del módulo: el
//                 médico necesita las constantes antes de diagnosticar.
//
// Los números llegan como números y sin unidad pegada —`presionSistolica: 120`,
// no `"120/80 mmHg"`—. Componer el par para mostrarlo es trabajo de la
// pantalla; hacerlo aquí impediría graficar la tensión o comparar dos tomas.
import { apiFetch } from '@/lib/api'
import type { PaginaDto } from '@/services/prescripciones'

/** Paciente tal como viene anidado en `SignosVitalesDto`. */
export interface SignosVitalesPacienteDto {
  personaId: number
  expediente: string
  nombres: string
  apellidos: string
}

/** Enfermera responsable de la toma, anidada en `SignosVitalesDto`. */
export interface SignosVitalesEnfermeraDto {
  personaId: number
  nombres: string
  apellidos: string
}

/**
 * Espejo de `SignosVitalesResponseDto`.
 *
 * TODAS las medidas son anulables, y no por descuido del contrato: una toma
 * parcial es lo normal (en un control rápido se toma la presión y el pulso, no
 * se pesa ni se mide). `null` significa «no se tomó», que no es lo mismo que
 * cero: una saturación de 0 sería una urgencia, no un hueco. Por eso ninguna
 * pantalla debe sustituir estos nulos por 0 al pintarlos.
 */
export interface SignosVitalesDto {
  signosVitalesId: number
  tomadoEn: string
  paciente: SignosVitalesPacienteDto
  enfermera: SignosVitalesEnfermeraDto
  consultaId: number | null
  pesoKg: number | null
  estaturaCm: number | null
  temperaturaC: number | null
  presionSistolica: number | null
  presionDiastolica: number | null
  pulsoLpm: number | null
  frecuenciaRespRpm: number | null
  saturacionPct: number | null
  observaciones: string | null
}

/** Cuerpo de `POST /signos-vitales`. Sin `enfermeraId`: sale del token. */
export interface RegistrarSignosVitalesPayload {
  pacienteId: number
  consultaId?: number
  tomadoEn?: string
  pesoKg?: number
  estaturaCm?: number
  temperaturaC?: number
  presionSistolica?: number
  presionDiastolica?: number
  pulsoLpm?: number
  frecuenciaRespRpm?: number
  saturacionPct?: number
  observaciones?: string
}

/**
 * La última toma del paciente: lo que el médico mira antes de diagnosticar.
 *
 * Devuelve `null` cuando el paciente existe pero nadie le ha tomado constantes
 * todavía —el backend responde 204 sin cuerpo y `apiFetch` lo convierte en
 * `undefined`—. Ese caso NO es un error: es el estado normal de un paciente
 * recién registrado, y la ficha ya sabe pintar ese hueco.
 *
 * Un `ApiError` 404 sí es un error de verdad (el paciente no existe) y se deja
 * subir tal cual para que la pantalla lo muestre, en vez de disfrazarlo de
 * «sin tomas».
 */
export async function ultimaToma(pacienteId: number): Promise<SignosVitalesDto | null> {
  const respuesta = await apiFetch<SignosVitalesDto | undefined>(
    `/signos-vitales/ultima?pacienteId=${encodeURIComponent(pacienteId)}`,
  )
  return respuesta ?? null
}

/**
 * Tomas de constantes, de la más reciente a la más antigua.
 *
 * Con `pacienteId` es el histórico de ese paciente. SIN él son todas, que es
 * lo que necesita la pantalla de enfermería: no es el expediente de alguien
 * sino la lista de trabajo del turno.
 *
 * Devuelve solo el contenido de la página; quien necesite el total lo pide con
 * `listarTomasPaginado`.
 */
export async function listarTomas(
  pacienteId?: number,
  tamano = 20,
): Promise<SignosVitalesDto[]> {
  const pagina = await listarTomasPaginado(pacienteId, 0, tamano)
  return pagina.contenido
}

/** Igual que `listarTomas` pero devolviendo el sobre paginado completo. */
export async function listarTomasPaginado(
  pacienteId?: number,
  pagina = 0,
  tamano = 20,
): Promise<PaginaDto<SignosVitalesDto>> {
  const query = new URLSearchParams({ pagina: String(pagina), tamano: String(tamano) })
  if (pacienteId !== undefined) query.set('pacienteId', String(pacienteId))
  return apiFetch<PaginaDto<SignosVitalesDto>>(`/signos-vitales?${query}`)
}

/**
 * Una toma concreta. Lanza `ApiError` 404 si no existe.
 *
 * La usa la pantalla de detalle, que se pide por su propia URL: quien llega
 * por un enlace compartido o recargando la página no trae la fila de la lista
 * en memoria, así que hay que traerla del servidor y no darla por conocida.
 */
export async function obtenerToma(signosVitalesId: number): Promise<SignosVitalesDto> {
  return apiFetch<SignosVitalesDto>(`/signos-vitales/${signosVitalesId}`)
}

/** Registra una toma a nombre de la enfermera autenticada. Responde 201. */
export async function registrarToma(
  payload: RegistrarSignosVitalesPayload,
): Promise<SignosVitalesDto> {
  return apiFetch<SignosVitalesDto>('/signos-vitales', { method: 'POST', body: payload })
}

// ─── Ayudas de presentación ────────────────────────────────────────────────

/**
 * La tensión como se escribe en una historia clínica: «120/80».
 *
 * Devuelve `null` si falta cualquiera de las dos. Media tensión no se escribe
 * «120/—»: no se escribe.
 */
export function tensionArterial(toma: SignosVitalesDto): string | null {
  if (toma.presionSistolica === null || toma.presionDiastolica === null) return null
  return `${toma.presionSistolica}/${toma.presionDiastolica}`
}

/** Nombre completo de la enfermera que tomó las constantes. */
export function nombreDeEnfermera(toma: SignosVitalesDto): string {
  return `${toma.enfermera.nombres} ${toma.enfermera.apellidos}`.trim()
}
