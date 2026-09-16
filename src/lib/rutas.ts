// ─── Qué rol puede abrir qué pantalla ──────────────────────────────────────
//
// UNA sola tabla para dos cosas que antes se decidían por separado: qué
// entradas pinta el menú lateral, y a qué rutas deja entrar la guarda del
// portal. Vivía dentro de `Sidebar.tsx` como un `const` local, así que la
// guarda habría tenido que declarar su propia copia — y dos tablas de permisos
// que se copian a mano acaban divergiendo: el menú esconde algo que la URL
// directa sí abre, que es exactamente el defecto que HU-03 vigila.
//
// Esto es experiencia de usuario, NO seguridad. Cualquiera puede saltarse una
// guarda de cliente escribiendo en la barra de direcciones con las
// herramientas de desarrollo abiertas. La protección real son los
// `@PreAuthorize` del backend, que responden 403 aunque la pantalla se pinte.
// Las dos capas se comprueban por separado en HU-03: el criterio 2 es esta
// tabla, el criterio 3 es el servidor.
import type { IconName, Role } from '@/types'

export interface RutaDelPortal {
  href: string
  label: string
  icon: IconName
  /** Basta con que el usuario tenga UNO de estos roles. */
  roles: Role[]
}

/**
 * Las pantallas del portal, en el orden del menú.
 *
 * La regla al asignar roles es que el menú NO ofrezca una pantalla que el
 * servidor va a rechazar: ofrecerla convierte un permiso que falta en un 403 en
 * la cara del usuario, y quien lo recibe no tiene forma de saber que el
 * problema es su rol.
 *
 * Consultas, Prescripciones y Agenda NO llevan 'Administrador' a propósito: un
 * administrador que no ejerce no tiene fila en la tabla `medicos` y el servicio
 * lo rechaza con 403 aunque pase el control de rol del controlador.
 *
 * Signos vitales sí lo llevan, y también 'medico': el backend permite LEER las
 * tomas a los tres roles. Solo REGISTRARLAS es de enfermería, y de eso se
 * encarga la propia pantalla, que no ofrece el botón a quien no puede.
 */
export const RUTAS_DEL_PORTAL: readonly RutaDelPortal[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['medico', 'enfermera', 'Administrador'] },
  { href: '/pacientes', label: 'Pacientes', icon: 'patients', roles: ['medico', 'enfermera', 'Administrador'] },
  { href: '/consultas', label: 'Consultas Médicas', icon: 'consultas', roles: ['medico'] },
  { href: '/enfermeria', label: 'Signos vitales', icon: 'enfermeria', roles: ['medico', 'enfermera', 'Administrador'] },
  { href: '/prescripciones', label: 'Prescripciones', icon: 'prescripciones', roles: ['medico'] },
  { href: '/agenda', label: 'Agenda de Citas', icon: 'agenda', roles: ['medico', 'enfermera'] },
  { href: '/clinicas', label: 'Clínicas', icon: 'clinicas', roles: ['medico', 'enfermera', 'Administrador'] },
  { href: '/usuarios', label: 'Usuarios y Roles', icon: 'usuarios', roles: ['Administrador'] },
  // Lo único que el portal le ofrece hoy a una cuenta de paciente, y va al
  // final porque `rutaPorDefecto` se queda con la PRIMERA entrada que el rol
  // puede ver: así el personal sigue aterrizando en el Dashboard y solo quien
  // no puede verlo cae aquí.
  //
  // No es el portal del paciente. Ese es HU-34 y no está comprometido a ningún
  // sprint; además el backend no tiene un solo `@PreAuthorize` que incluya
  // PACIENTE, así que no hay ni un endpoint que una pantalla suya pudiera
  // llamar sin llevarse un 403. Lo que hay es la cuenta autenticada viéndose a
  // sí misma, que es exactamente el alcance que el documento de entrega
  // declara para este rol.
  { href: '/mi-panel', label: 'Mi información', icon: 'person', roles: ['paciente'] },
]

/**
 * A dónde se manda a quien entra a una pantalla que su rol no puede ver.
 *
 * Era la constante '/dashboard', y con el rol `paciente` eso se volvió un
 * bucle: el paciente no puede ver el Dashboard, así que la guarda lo mandaba
 * ahí, volvía a rechazarlo y lo mandaba ahí otra vez. Un destino fijo solo
 * funciona mientras TODOS los roles compartan una pantalla, y desde que existe
 * un rol sin acceso al portal de trabajo esa suposición dejó de ser cierta.
 *
 * Se resuelve con la misma tabla que decide todo lo demás —la primera entrada
 * que estos roles pueden ver—, de modo que un rol nuevo no vuelve a caer en el
 * bucle con solo registrarle su pantalla arriba.
 */
export function rutaPorDefecto(roles: readonly Role[]): string {
  const visible = RUTAS_DEL_PORTAL.find((ruta) => ruta.roles.some((rol) => roles.includes(rol)))
  // Sin ninguna pantalla visible no hay a dónde mandarlo DENTRO del portal:
  // cualquier destino volvería a rechazarse. Se sale al login, que es la
  // verdad del caso —esa sesión no puede usar el portal— en vez de un bucle.
  return visible ? visible.href : '/login'
}

/**
 * La entrada del menú bajo la que cae una ruta, o `undefined` si ninguna.
 *
 * Casa por PREFIJO y no por igualdad porque el portal tiene rutas dinámicas:
 * `/pacientes/5` es el expediente de un paciente y `/enfermeria/12` el detalle
 * de una toma. Con igualdad estricta esas dos quedarían fuera de la tabla, y
 * según cómo se resolviera el caso «ruta desconocida» se volverían inalcanzables
 * —rompiendo HU-08, que exige que la URL de un expediente sea compartible— o
 * quedarían sin proteger.
 *
 * El `+ '/'` del prefijo no es decorativo: sin él, `/pacientes-archivados`
 * casaría con la entrada `/pacientes` y heredaría sus permisos.
 */
export function rutaDelPortal(pathname: string): RutaDelPortal | undefined {
  return RUTAS_DEL_PORTAL.find(
    (ruta) => pathname === ruta.href || pathname.startsWith(ruta.href + '/'),
  )
}

/**
 * Si estos roles pueden abrir esta ruta.
 *
 * Una ruta que no está en la tabla se PERMITE. Es la decisión menos dañina de
 * las dos: denegar por defecto convertiría cualquier pantalla nueva en un
 * redirect silencioso que su autor tardaría en entender, mientras que permitir
 * de más solo deja ver una pantalla cuyos datos el backend va a negar igual
 * —la seguridad real no está aquí—. Hoy no hay ninguna ruta del portal fuera de
 * la tabla; si se añade una, entra con permiso hasta que alguien la registre.
 */
export function puedeVerRuta(pathname: string, roles: readonly Role[]): boolean {
  const ruta = rutaDelPortal(pathname)
  if (!ruta) return true
  // `.some(...)` y no `.includes(...)`: una cuenta puede tener varios roles a la
  // vez —ADMIN y MEDICO es el caso normal— y basta con que UNO la autorice.
  return ruta.roles.some((rol) => roles.includes(rol))
}
