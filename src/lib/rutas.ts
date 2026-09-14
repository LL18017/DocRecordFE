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
]

/** A dónde se manda a quien entra a una pantalla que su rol no puede ver. */
export const RUTA_POR_DEFECTO = '/dashboard'

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
