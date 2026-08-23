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
// Endpoint que este módulo NO envuelve, a propósito: `GET /user`. Devuelve la
// entidad JPA cruda en vez de un DTO, con dos consecuencias comprobadas contra
// la API en marcha: (1) incluye el hash argon2 de la contraseña de cada
// usuario, que ninguna pantalla debe recibir; (2) serializa el ciclo
// user → roles → users → roles… hasta reventar, y responde 200 con un cuerpo
// truncado —JSON inválido— con el error del servidor pegado al final. Es
// inservible además de peligroso; el listado se pide siempre por `/user/all`.

import { apiFetch } from '@/lib/api'

/** Espejo de `RoleDto` del backend. */
export interface RolDto {
  id: number
  name: string
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
 * Crea una cuenta. Exige rol ADMIN.
 *
 * ⚠ La cuenta que crea este endpoint HOY NO SIRVE PARA ENTRAR, y conviene
 * saberlo antes de ofrecer un formulario que la use. Comprobado contra la API
 * y la base en marcha:
 *
 *   · nace con `enabled = false` y sin fila en `verification_token`, así que
 *     no hay enlace de confirmación que abrir: `POST /auth/login` responde
 *     siempre «Usuario no ha confirmado su cuenta aun».
 *   · la contraseña se guarda TAL CUAL, sin cifrar (`UserMapper.toEntity`
 *     copia `request.password()`), a diferencia de `/auth/register`, que la
 *     pasa por argon2.
 *   · la persona se crea solo con nombres y apellidos: sin DUI, sin fecha de
 *     nacimiento y sin sexo.
 *
 * Respuestas comprobadas: 200 (no 201) con el `UsuarioDto` y `roles: []`; 409
 * «El correo electrónico ya está registrado» si el correo existe; y 400 con
 * un cuerpo de validación que nombra campos que el cliente nunca envió
 * (`{"nombres":…,"apellidos":…}`), porque el controller no valida el DTO
 * —`@RequestBody` sin `@Valid`— y el fallo salta al guardar la persona.
 */
export async function crearUsuario(payload: CrearUsuarioPayload): Promise<UsuarioDto> {
  return apiFetch<UsuarioDto>('/user', { method: 'POST', body: payload })
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
