// ─── Servicio de consultas médicas ─────────────────────────────────────────
// CRUD de las consultas bajo `/consultas`. El médico que atiende NUNCA viaja
// en el cuerpo: el backend lo saca del JWT, igual que hace `/clinics` con el
// propietario.
//
// ESTADO: al escribir este módulo los endpoints todavía no existían en el
// backend (`GET /consultas` respondía 404 «La URL solicitada no existe»). Los
// tipos son el espejo del contrato acordado con quien lo está construyendo;
// si al conectar aparece una diferencia, se corrige AQUÍ y no en las
// pantallas, que es justo lo que este módulo existe para permitir.

import { ApiError, apiFetch } from '@/lib/api'
import { parsearFechaCivil } from '@/lib/pacienteAdapter'
import type { Role } from '@/types'

/** Estado de la consulta. El backend lo maneja; la interfaz solo lo pinta. */
export type EstadoConsulta = 'PENDIENTE' | 'FINALIZADA'

/** Paciente tal como viene anidado en `ConsultaDto`. */
export interface ConsultaPacienteDto {
  personaId: number
  expediente: string
  nombres: string
  apellidos: string
}

/** Médico que atendió, anidado en `ConsultaDto`. */
export interface ConsultaMedicoDto {
  personaId: number
  nombres: string
  apellidos: string
  /**
   * Anulable: `persona.especialidad` no es obligatoria para todo el personal
   * (un administrador que atiende, o un médico registrado antes de que el
   * catálogo de especialidades existiera). Declararla `string` a secas
   * compila igual y revienta en `.toUpperCase()` o al pintarla.
   */
  especialidad: string | null
}

/** Clínica donde se atendió, anidada en `ConsultaDto`. */
export interface ConsultaClinicaDto {
  clinicaId: number
  name: string
}

/**
 * Espejo de `ConsultaDto`.
 *
 * `clinica` es `null` cuando la consulta se registró sin sede (el contrato lo
 * dice de forma explícita: PUEDE SER NULL). No es un caso raro: `clinicaId`
 * es opcional al crear, así que basta con que el médico no tuviera una sede
 * activa. Lo mismo con `diagnostico`, que está vacío mientras la consulta
 * sigue PENDIENTE. Ambos se declaran anulables desde el principio porque el
 * fallo contrario ya ocurrió en este proyecto —un tipo que decía `string`
 * donde el backend mandaba `null`, compilando en verde hasta reventar en
 * pantalla («Cannot read properties of null»).
 */
export interface ConsultaDto {
  consultaId: number
  /** Instante ISO (fecha *y hora* de la atención), no una fecha civil. */
  fecha: string
  /**
   * PUEDE SER NULL, aunque el formulario de esta aplicación siempre lo pida.
   *
   * No es una suposición defensiva: la columna es `motivo TEXT` sin NOT NULL
   * (V6__consultas_y_prescripciones.sql:41) y `ConsultaRequestDto.motivo` no
   * lleva `@NotBlank`, así que cualquier cliente —o una carga a mano en la
   * base— puede dejar una consulta sin motivo y `GET /consultas` la devuelve
   * con `"motivo": null`. Declararlo `string` compilaba en verde y reventaba
   * al buscar en la lista (`c.motivo.toLowerCase()`), exactamente el mismo
   * fallo que ya costó `PersonaDto.dui` y `PacienteDto.tipoSangre`.
   *
   * Quien lo pinte usa `textoOpcional`; quien lo busque debe tratarlo como
   * «no coincide», nunca dejar que reviente.
   */
  motivo: string | null
  diagnostico: string | null
  estado: EstadoConsulta
  paciente: ConsultaPacienteDto
  medico: ConsultaMedicoDto
  clinica: ConsultaClinicaDto | null
}

/**
 * Cuerpo de `POST /consultas`.
 *
 * Solo `pacienteId` y `motivo` son obligatorios. `clinicaId` se omite cuando
 * no hay sede activa; `diagnostico` cuando quien registra no es médico (ver
 * `puedeRegistrarDiagnostico`); `fecha` cuando se atiende ahora mismo, que es
 * lo normal: dejar que la ponga el servidor evita que el reloj mal puesto de
 * una computadora de clínica fabrique consultas en el futuro.
 */
export interface CrearConsultaPayload {
  pacienteId: number
  clinicaId?: number
  motivo: string
  diagnostico?: string
  fecha?: string
}

/**
 * Cuerpo de `PUT /consultas/{id}`.
 *
 * El backend completa sin destruir: un campo ausente significa «no lo estoy
 * tocando», no «bórralo». Por eso se manda únicamente lo que cambió y por eso
 * el paciente no aparece: una consulta no cambia de paciente, se anula y se
 * registra otra.
 */
export interface ActualizarConsultaPayload {
  clinicaId?: number
  motivo?: string
  diagnostico?: string
  fecha?: string
}

/**
 * Quién puede escribir un diagnóstico.
 *
 * Regla de negocio: el diagnóstico es EXCLUSIVO DEL MÉDICO. Una enfermera
 * puede ver la consulta pero no diagnosticarla, y el backend lo impone; la
 * interfaz no debe ofrecer un campo que el servidor va a rechazar (mostrarlo,
 * dejar escribir un párrafo y responder 403 al guardar es peor que no
 * mostrarlo).
 *
 * Se comprueba por exclusión —«no es enfermera»— y no con `=== 'medico'` a
 * propósito. `mapearRol` en services/auth.ts devuelve 'Administrador' en
 * cuanto la cuenta tiene ROLE_ADMIN, aunque además tenga ROLE_MEDICO: la
 * cuenta de prueba del proyecto (naun@docrecord.sv) es exactamente ese caso.
 * Con `=== 'medico'` un médico administrador perdería el campo sin motivo,
 * mientras que la regla que el negocio enunció —y la única que el backend
 * dice imponer— es que la enfermera no diagnostica.
 */
export function puedeRegistrarDiagnostico(rol: Role): boolean {
  return rol !== 'enfermera'
}

/**
 * Lista consultas, más reciente primero (el orden lo garantiza el backend).
 *
 * Sin `pacienteId` pide la lista completa que el backend deja ver a la cuenta
 * autenticada; con él, la de un paciente. El contrato solo documenta la forma
 * filtrada, así que si `GET /consultas` sin parámetros resultara no estar
 * permitido, el error llega a la pantalla tal cual y se ve en el aviso con
 * «Reintentar», sin inventar aquí una lista vacía que fingiría que el
 * paciente no tiene consultas.
 */
export async function listarConsultas(pacienteId?: number): Promise<ConsultaDto[]> {
  const query = pacienteId === undefined ? '' : `?pacienteId=${encodeURIComponent(pacienteId)}`
  return apiFetch<ConsultaDto[]>(`/consultas${query}`)
}

/** Obtiene una consulta. Lanza `ApiError` 404 si no existe. */
export async function obtenerConsulta(consultaId: number): Promise<ConsultaDto> {
  try {
    return await apiFetch<ConsultaDto>(`/consultas/${consultaId}`)
  } catch (error) {
    throw traducirError(error, 'abrir')
  }
}

/** Registra una consulta a nombre del médico autenticado. Responde 201. */
export async function crearConsulta(payload: CrearConsultaPayload): Promise<ConsultaDto> {
  try {
    return await apiFetch<ConsultaDto>('/consultas', { method: 'POST', body: payload })
  } catch (error) {
    throw traducirError(error, 'registrar')
  }
}

/** Actualiza una consulta con lo que haya cambiado. */
export async function actualizarConsulta(
  consultaId: number,
  payload: ActualizarConsultaPayload,
): Promise<ConsultaDto> {
  try {
    return await apiFetch<ConsultaDto>(`/consultas/${consultaId}`, {
      method: 'PUT',
      body: payload,
    })
  } catch (error) {
    throw traducirError(error, 'editar')
  }
}

/** Elimina una consulta. Responde 204 sin cuerpo. */
export async function eliminarConsulta(consultaId: number): Promise<void> {
  try {
    await apiFetch<void>(`/consultas/${consultaId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error, 'eliminar')
  }
}

// ─── Ayudas de presentación ────────────────────────────────────────────────

/** Nombre completo del paciente de una consulta. */
export function nombreDePaciente(consulta: ConsultaDto): string {
  return `${consulta.paciente.nombres} ${consulta.paciente.apellidos}`.trim()
}

/** Nombre completo del médico que atendió. */
export function nombreDeMedico(consulta: ConsultaDto): string {
  return `${consulta.medico.nombres} ${consulta.medico.apellidos}`.trim()
}

/**
 * Nombre de la sede, o `null` si la consulta no tiene clínica registrada.
 *
 * Devuelve `null` en vez de un texto ya redactado —mismo criterio que
 * `formatearCoordenadas` en services/clinicas.ts— para que cada pantalla
 * escriba el aviso con sus palabras, pero que la decisión de «aquí no hay
 * dato» se tome en un solo sitio y nadie vuelva a escribir
 * `consulta.clinica.name` sin comprobar el nulo.
 */
export function nombreDeClinica(consulta: ConsultaDto): string | null {
  return consulta.clinica?.name ?? null
}

/**
 * Texto de un campo opcional que llega `null` del backend.
 *
 * Vive aquí —y no en services/prescripciones.ts, donde nació para `dosis`,
 * `frecuencia` y `duracion`— porque `motivo` necesita exactamente la misma
 * decisión y prescripciones ya depende de este módulo: al revés se cerraría
 * un ciclo de importaciones. `services/prescripciones.ts` lo reexporta, así
 * que quien ya lo importaba de allí sigue igual.
 *
 * El guion es el mismo que usan el expediente y la columna de diagnóstico
 * para lo que falta, y es lo que evita pintar «null» a un usuario: la cadena
 * «null» en una receta que alguien lleva a la farmacia, o en la lista de
 * consultas de un expediente clínico, se lee como un dato, no como un hueco.
 *
 * Se compara con `trim()` para que una cadena de espacios cuente como
 * ausencia: al backend le da igual guardar `''` y al usuario le da igual leer
 * un hueco o un espacio, pero la columna alineada de la tabla no.
 */
export function textoOpcional(valor: string | null): string {
  return valor?.trim() ? valor : '—'
}

/**
 * Formatea para mostrar la marca de tiempo de una consulta o una receta.
 *
 * `fecha` de consulta es un INSTANTE (lleva hora), y para un instante `new
 * Date` sí es la interpretación correcta: la hora local es lo que se quiere
 * leer. El caso peligroso es el contrario —una fecha civil `YYYY-MM-DD`, que
 * el estándar obliga a interpretar como medianoche UTC y que en El Salvador
 * (UTC-6) retrocede un día al pintarla—, así que se delega en
 * `parsearFechaCivil`, que ya distingue ambos casos y es la solución que este
 * proyecto ya pagó una vez. Si el backend acabara mandando la fecha de la
 * receta sin hora, esto sigue mostrando el día correcto.
 *
 * Devuelve la cadena original cuando no representa una fecha usable: es
 * preferible a un «Invalid Date» en medio de la tabla.
 */
export function formatearFechaHora(fechaISO: string): string {
  const fecha = parsearFechaCivil(fechaISO)
  if (!fecha) return fechaISO

  const esFechaCivil = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO.trim())
  return fecha.toLocaleString('es-SV', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(esFechaCivil ? {} : { hour: '2-digit', minute: '2-digit' }),
  })
}

/**
 * Traduce al usuario los códigos que el backend no explica por sí solo, y
 * SOLO esos. Mismo criterio que `traducirError` en services/clinicas.ts:
 * `lib/api.ts` ya prefiere `message` sobre `error`, así que un fallo de
 * negocio llega con su motivo concreto; sustituirlo por una frase fija le
 * quitaría al usuario el único dato útil. Aquí solo se toca lo que llega como
 * categoría («Recurso no encontrado») o en crudo (la restricción de
 * integridad de un borrado), y únicamente cuando el texto local es MÁS
 * preciso.
 *
 * El 403 se deja pasar entero a propósito: la negativa típica de estos
 * endpoints es la del diagnóstico reservado al médico, y el backend sabe
 * decir cuál de sus reglas se incumplió mejor que una frase genérica escrita
 * aquí, que además tendría que adivinar entre «no eres el dueño de la
 * consulta» y «tu rol no puede diagnosticar».
 */
function traducirError(
  error: unknown,
  accion: 'abrir' | 'registrar' | 'editar' | 'eliminar',
): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }

  switch (error.status) {
    case 404:
      return new ApiError(404, 'Esta consulta ya no existe; puede que alguien la haya eliminado.')
    case 409:
      // Este texto solo es cierto al eliminar: una consulta con recetas
      // emitidas no se puede borrar sin dejarlas huérfanas. Si un 409
      // apareciera al registrar o editar hablaría de un borrado que nadie
      // pidió, así que ahí vale más el mensaje del backend.
      return accion === 'eliminar'
        ? new ApiError(
            409,
            'No se puede eliminar la consulta porque tiene prescripciones u otra información asociada.',
          )
        : error
    default:
      // 400 incluido: la validación de Spring nombra el campo que falla y
      // `lib/api.ts` ya la entrega redactada.
      return error
  }
}
