// ─── Servicio de usuarios ──────────────────────────────────────────────────
// Administración de cuentas del personal: listado, alta y asignación de roles.
//
// TODO el controller `/user` del backend está anotado `@PreAuthorize("hasRole
// ('ADMIN')")` A NIVEL DE CLASE, así que cada función de este módulo responde
// 403 a cualquier sesión que no sea administradora. La restricción es
// deliberada: el listado expone el correo de todo el personal, y en un sistema
// de expediente clínico eso es fuga de datos. Quien llame desde una pantalla
// debe comprobar el rol ANTES de pedir, no descubrirlo por el error.
//
// El 403 llega con este cuerpo, comprobado con curl:
//
//   {"roles":"[ROLE_MEDICO]","usuario":"152",
//    "message":"No tienes permisos para realizar esta acción",
//    "error":"Acceso denegado"}
//
// `lib/api.ts` prefiere `message`, así que el motivo llega ya redactado y este
// servicio no lo reescribe. Igual que en `services/pacientes.ts`: solo se
// sustituye un texto del backend cuando el local es MÁS preciso.
//
// El listado se pide SIEMPRE por `/user/all`, y `GET /user` no se envuelve:
// hoy ya no existe. La ruta `/user` sigue mapeada para el POST del alta, así
// que un GET contra ella responde **405**, no 404 —quien vea ese código
// buscando el listado no está ante un endpoint caído, está ante un método que
// nunca fue—.
//
// La decisión de no usarlo es anterior a que se borrara, y sigue en pie por un
// motivo que ya no es el de entonces. Antes se evitaba porque devolvía la
// entidad JPA cruda: publicaba el hash argon2 de todo el personal y entraba en
// el ciclo user → roles → users → roles… hasta responder 200 con un JSON
// truncado e inválido. El backend lo eliminó (DocRecordBE 6faffd3) en vez de
// convertirlo a DTO, precisamente porque `/user/all` ya hacía lo mismo bien.
// Hoy el motivo es ese: `/user/all` es el ÚNICO listado que existe, devuelve
// `UserResponseDto` —sin contraseña— y es el que este módulo debe pedir. Si
// alguien echa de menos un `GET /user`, lo que busca ya está aquí.

import { apiFetch } from '@/lib/api'

/**
 * Espejo de `RoleDto` del backend. Los DOS campos son anulables, y ninguno de
 * los dos nulos es teórico:
 *
 * · `id` no sale de la base sino de `RolesEnum.getIdByName(role.getName())`,
 *   que devuelve `null` —lo dice su propio `return null; // o lanzar
 *   excepción`— para cualquier nombre que no sea ADMIN, MEDICO, ENFERMERA o
 *   PACIENTE. La tabla `role` es texto libre sin migración que la siembre, así
 *   que basta una fila 'RECEPCION' para que el id llegue null. La pantalla ya
 *   escribía `rol.id ?? rol.name` como clave de React: la guarda estaba, el
 *   tipo decía que sobraba.
 *
 * · `name` es la columna `role.name VARCHAR(255)` de V1__esquema_inicial.sql,
 *   sin NOT NULL. Con un nombre null el backend no revienta —`getIdByName`
 *   compara desde el enum y `"ROLE_"+null` concatena— así que el null llega
 *   entero al cliente, donde `nombre.toUpperCase()` sí revienta.
 *
 * Es el mismo patrón de `PersonaDto.dui` y `ConsultaDto.motivo`: un tipo que
 * promete lo que el backend no garantiza compila en verde con el fallo dentro.
 */
export interface RolDto {
  id: number | null
  name: string | null
}

/**
 * Espejo de `UserResponseDto` del backend, la fila de `GET /user/all`.
 *
 * `userName` NO es un nombre de cuenta: el backend lo arma concatenando
 * `nombres` y `apellidos` de la persona (ver `UserMapper.toDto`), así que es
 * el nombre completo y es lo que se pinta en pantalla.
 *
 * `roles` puede venir VACÍO: `POST /user` crea la cuenta sin ningún rol, y
 * asignarlo es una segunda llamada. Quien lo pinte tiene que contemplar el
 * caso en vez de leer `roles[0]`.
 *
 * Lo que este DTO NO trae: `enabled`. No hay forma de saber desde el API si la
 * cuenta está confirmada, así que la pantalla no puede prometer una columna de
 * estado; la maqueta la mostraba siempre como «Activo», que era una invención.
 */
export interface UsuarioDto {
  userId: number
  email: string
  userName: string
  roles: RolDto[]
}

/**
 * Tamaño de página que se le pide al backend.
 *
 * `GET /user/all` acepta `inicio` y `fin`, y los nombres engañan: el servicio
 * hace `PageRequest.of(inicio, fin)`, o sea que **`inicio` es el índice de
 * página (base 0) y `fin` el TAMAÑO de la página**, no un rango de filas.
 * Comprobado con curl: `?inicio=2&fin=4` devuelve las filas 8 a 11, no la 2 a
 * la 4. Sin parámetros el backend aplica `inicio=0, fin=20`, así que una
 * llamada pelada se queda con los primeros 20 usuarios y calla el resto.
 *
 * Valores fuera de rango (`fin=0`, negativos, no numéricos) hacen que el
 * backend responda 500, no 400; por eso aquí nunca se calculan a partir de
 * datos de la interfaz.
 */
const TAMANO_DE_PAGINA = 200

/**
 * Tope de páginas a recorrer. Es un seguro contra un bucle infinito si el
 * backend dejara de acortar la última página, no un límite de negocio: con el
 * tamaño de arriba cubre 5000 cuentas, muy por encima del personal de una red
 * de clínicas.
 */
const MAXIMO_DE_PAGINAS = 25

/**
 * Lista todas las cuentas del sistema. Exige rol ADMIN; lanza `ApiError` 403
 * en cualquier otra sesión.
 *
 * Recorre las páginas hasta que una vuelve incompleta, en vez de pedir una
 * sola. Una sola llamada obliga a inventar un tope —y el usuario número 21, o
 * 201, simplemente no aparecería en pantalla, sin ningún aviso: exactamente el
 * defecto por el que esta pantalla no servía cuando buscaba dentro de datos de
 * maqueta.
 *
 * Se descartan los `userId` repetidos porque el backend pagina sin `ORDER BY`
 * (`userRepository.findAll(pageable)` sin orden): PostgreSQL no garantiza el
 * mismo orden entre dos consultas, así que una fila puede caer en dos páginas
 * si alguien da de alta una cuenta mientras se recorre. Sin esta guarda,
 * React avisaría de claves duplicadas y la tabla mostraría al mismo usuario
 * dos veces.
 */
export async function listarUsuarios(): Promise<UsuarioDto[]> {
  const porId = new Map<number, UsuarioDto>()

  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
    const lote = await apiFetch<UsuarioDto[]>(
      `/user/all?inicio=${pagina}&fin=${TAMANO_DE_PAGINA}`,
    )
    for (const usuario of lote) porId.set(usuario.userId, usuario)
    if (lote.length < TAMANO_DE_PAGINA) break
  }

  return [...porId.values()]
}

/**
 * Cuerpo de `POST /user`, espejo de `UserRequestDto`.
 *
 * `userName` es el nombre completo en un solo campo: el backend lo parte por
 * el primer espacio para llenar `nombres` y `apellidos` de la persona. Un
 * valor sin espacios deja el mismo texto en los dos campos.
 *
 * No lleva rol: `POST /user` crea la cuenta sin ninguno y hay que asignarlo
 * después con `asignarRol`.
 */
export interface CrearUsuarioPayload {
  email: string
  userName: string
  password: string
}

/**
 * Cuerpo de la respuesta de `POST /user`, espejo de `AltaUsuarioResponseDto`.
 *
 * Extiende `UsuarioDto` (mismo `userId`/`email`/`userName`/`roles`, este
 * último siempre vacío en el alta) con `correoDeVerificacionEnviado`, que NO
 * siempre es `true`. Gmail satura seguido —no es un caso de laboratorio—, y
 * cuando falla el envío la cuenta igual queda creada en la base: existe, pero
 * `enabled = false` y sin fila en `verification_token`, así que no hay enlace
 * de confirmación que abrir y quedaría huérfana para siempre si nadie
 * interviene. La salida es `asignarContrasena`, que además de fijar la clave
 * HABILITA la cuenta (ver su comentario más abajo); quien pinte esta
 * respuesta con `correoDeVerificacionEnviado: false` debe ofrecer ese camino
 * de inmediato, no solo informar el fallo.
 */
export interface AltaUsuarioDto extends UsuarioDto {
  correoDeVerificacionEnviado: boolean
}

/**
 * Crea una cuenta. Exige rol ADMIN.
 *
 * Ya NO nace deshabilitada sin salida: `UserService.createUser` ahora emite
 * el token de verificación y manda el correo de confirmación igual que
 * `/auth/register` —el javadoc que describía la decisión de producto
 * pendiente ya no dice eso—. `correoDeVerificacionEnviado` en la respuesta es
 * lo que distingue el camino feliz («revise su correo») del que no lo es
 * (ver `AltaUsuarioDto`).
 *
 * La contraseña no se guarda en claro: `UserService.createUser` la pasa por
 * el mismo `PasswordEncoder` (argon2) que `/auth/register` antes de
 * guardarla.
 *
 * La persona se crea solo con nombres y apellidos —sin DUI, sin fecha de
 * nacimiento y sin sexo—, porque `UserRequestDto` no pide más.
 *
 * Respuestas: **201** (no 200) con `AltaUsuarioDto` y `roles: []` —el alta
 * nunca asigna rol, hace falta una llamada aparte a `asignarRol`—; 409 «El
 * correo electrónico ya está registrado» si el correo existe; y 400 de
 * validación que nombra el campo que el cliente mandó mal (`email`,
 * `userName` o `password`).
 */
export async function crearUsuario(payload: CrearUsuarioPayload): Promise<AltaUsuarioDto> {
  return apiFetch<AltaUsuarioDto>('/user', { method: 'POST', body: payload })
}

/**
 * Añade un rol a una cuenta y devuelve la cuenta ya con sus roles. Exige rol
 * ADMIN.
 *
 * Añade, no reemplaza: una cuenta puede acumular varios roles (en la base de
 * desarrollo hay usuarios ADMIN y MEDICO a la vez). No existe el inverso —el
 * backend no expone quitar un rol—, así que una asignación equivocada solo se
 * corrige en la base.
 *
 * `roleId` sale de la tabla `role`: 1 ADMIN, 2 MEDICO, 3 ENFERMERA,
 * 4 PACIENTE. Respuestas comprobadas: 409 «El usuario ya cuenta con este rol»
 * si ya lo tiene, y 404 «No se encontro el usuario/rol con id: …» si alguno no
 * existe.
 */
export async function asignarRol(userId: number, roleId: number): Promise<UsuarioDto> {
  return apiFetch<UsuarioDto>(`/user/${userId}/role/${roleId}`, { method: 'POST' })
}

/**
 * Lista el catálogo completo de roles. Se llama sin restricción propia en el
 * controller, pero en la práctica solo la pide esta pantalla, que ya exige
 * ADMIN antes de montarse.
 *
 * Devuelve los CUATRO roles de la tabla `role` (ADMIN, MEDICO, ENFERMERA,
 * PACIENTE); a quien arme un selector de personal le toca descartar PACIENTE,
 * no a este servicio.
 */
export async function listarRoles(): Promise<RolDto[]> {
  return apiFetch<RolDto[]>('/roles/all')
}

/**
 * Asigna (o reestablece) la contraseña de una cuenta. Exige rol ADMIN.
 *
 * ⚠ No es solo un cambio de clave: `UserService` (a) HABILITA la cuenta —la
 * saca de `enabled = false` si estaba así, que es justo el estado en que
 * queda un alta cuyo correo de confirmación no se pudo enviar— y (b) borra
 * cualquier token de confirmación pendiente. Quien llame desde una pantalla
 * tiene que poder explicarle ese efecto a quien la usa ANTES de confirmar, no
 * dejar que lo descubra después.
 *
 * 403 si quien llama es ADMIN pero la cuenta objetivo TAMBIÉN es ADMIN y no
 * es la misma que llama —mensaje exacto del backend: «Un administrador no
 * puede asignar la contrasena de otro administrador», que `lib/api.ts` ya
 * extrae de `message` sin que este servicio lo reescriba—; un administrador
 * SÍ puede asignarse contraseña a sí mismo. 404 si `userId` no existe.
 */
export async function asignarContrasena(userId: number, password: string): Promise<UsuarioDto> {
  return apiFetch<UsuarioDto>(`/user/${userId}/password`, {
    method: 'POST',
    body: { password },
  })
}
