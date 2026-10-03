export type Page =
  | 'landing'
  | 'login'
  | 'register'
  | 'select-clinica'
  | 'dashboard'
  | 'pacientes'
  | 'expediente'
  | 'consultas'
  | 'enfermeria'
  | 'prescripciones'
  | 'clinicas'
  | 'agenda'
  | 'usuarios'
  | 'mi-panel'

/**
 * Los roles de sesión.
 *
 * `paciente` es el cuarto del catálogo del backend (RolesEnum: ADMIN, MEDICO,
 * ENFERMERA, PACIENTE) y estaba faltando aquí. La ausencia no se notaba como
 * un error de compilación sino como algo peor: `mapearRoles` no lo reconocía,
 * caía al rol por defecto —'medico'— y una cuenta de paciente entraba al
 * portal con el menú de un médico. El backend le negaba cada pantalla con 403,
 * porque no tiene fila en `medicos`, pero para entonces ya se le había
 * ofrecido.
 *
 * Que exista aquí NO significa que haya portal del paciente: ese es HU-34, sin
 * comprometer a un sprint. Hoy el rol se autentica y llega a `/mi-panel`, que
 * es lo único que el backend le permite —ningún `@PreAuthorize` del servidor
 * incluye PACIENTE—. Ver `app/(portal)/mi-panel/page.tsx`.
 */
export type Role = 'medico' | 'enfermera' | 'Administrador' | 'paciente'

/**
 * Usuario en sesión con TODOS sus roles, no uno solo.
 *
 * Una cuenta puede tener varios roles del backend a la vez (ADMIN + MEDICO es
 * el caso normal: ADMIN se otorga sobre una cuenta ya existente). No hay
 * jerarquía real entre ellos —son capacidades distintas, no niveles de lo
 * mismo—, así que colapsar a un solo `role` le esconde pantallas a quien sí
 * puede usarlas. Ver `services/auth.ts` (`mapearRoles`).
 */
export interface User {
  id?: number
  name: string
  email?: string
  roles: Role[]
  specialty?: string
  status?: string
}

/**
 * Clínica tal como la usan las pantallas. Refleja `ClinicasResponseDto` del
 * backend, que solo devuelve id, nombre y coordenadas.
 *
 * `lat` y `lng` son anulables porque esas columnas admiten NULL en la base:
 * hay clínicas registradas sin ubicación. Quien las pinte debe decidir qué
 * mostrar en ese caso; el tipo obliga a hacerlo en vez de dejar que reviente
 * un `.toFixed()` sobre null en tiempo de ejecución.
 *
 * `address`, `phone` y `patients` venían de los datos de maqueta y el backend
 * no los devuelve. Quedan opcionales, no eliminados, para no romper lo que
 * todavía los escribe; en cuanto el API los ofrezca (o se retire el
 * formulario que los inventa) deben desaparecer de aquí.
 */
export interface Clinica {
  id: number
  name: string
  lat: number | null
  lng: number | null
  /**
   * Dónde queda, de verdad (HU-26).
   *
   * `null` en las clínicas registradas antes de la migración V16: no se puede
   * inventar la dirección de una sede que ya existe, así que se muestra el hueco
   * y se completa a mano.
   *
   * ── Por qué opcionales aquí y obligatorios en `ClinicaDto` ─────────────
   * Son dos contratos distintos. `ClinicaDto` espeja lo que devuelve la API, y
   * el backend manda siempre las seis claves —con `null` cuando no las tiene—,
   * así que ahí exigirlas es lo correcto: si alguna faltara, la respuesta no
   * sería la que el backend promete.
   *
   * `Clinica` es el modelo que usan las pantallas, y lo construyen también la
   * maqueta y el contexto de sesión, que no tienen dirección ninguna. Exigirlas
   * ahí obligaría a inventar datos para que compilara, que es exactamente lo
   * contrario de lo que se busca. Ausente y `null` se pintan igual: un guion.
   */
  departamento?: string | null
  municipio?: string | null
  direccion?: string | null
  telefono?: string | null
  horario?: string | null
  estado?: 'ACTIVA' | 'INACTIVA'
  /** @deprecated Restos de la maqueta; usar `direccion` y `telefono`. */
  address?: string
  /** @deprecated */
  phone?: string
  patients?: number
}

export interface Patient {
  id: string
  name: string
  phone: string
  age: number
  sex: string
  /**
   * Cuántas consultas tiene el paciente, o `null` cuando no se pudo
   * averiguar.
   *
   * Es anulable a propósito. `GET /pacientes` NO trae este conteo, así que el
   * adaptador lo dejaba en 0 fijo y la lista mostraba un cero para todos: un
   * paciente con dos consultas seguía apareciendo con cero. Ese cero no es un
   * dato ausente, es una afirmación clínica —«nunca ha venido»— y encima
   * falsa. El tipo obliga a distinguir «tiene cero consultas» de «no se sabe
   * cuántas tiene», que es justo lo que se estaba confundiendo; el conteo real
   * sale de `GET /consultas` (ver `lib/resumenPanel.ts`).
   */
  consultations: number | null
  status: string
  blood: string
  email: string
  address: string
  born: string
  id_num: string
}

export interface Consultation {
  date: string
  reason: string
  diagnosis: string
  status: string
  meds: string[]
  doctor: string
}

export interface Vital {
  date: string
  nurse: string
  weight: string
  height: string
  temp: string
  bp: string
  pulse: string
  resp: string
  sat: string
}

export interface Appointment {
  id: number
  patient: string
  date: string
  time: string
  type: string
  doctor: string
  status: string
}

export interface PrescriptionMed {
  name: string
  dose: string
  freq: string
  duration: string
}

export interface Prescription {
  patient: string
  date: string
  meds: PrescriptionMed[]
  doctor: string
}

export interface Alergia {
  nombre: string
  tipo: string
  reaccion: string
  severidad: string
}

export interface Enfermedad {
  nombre: string
  desde: string
  tratamiento: string
}

export interface Hereditaria {
  condicion: string
  parentesco: string
  observaciones: string
}

export interface Habito {
  tipo: string
  descripcion: string
  nivel: string
}

export type IconName =
  | 'dashboard'
  | 'patients'
  | 'consultas'
  | 'enfermeria'
  | 'prescripciones'
  | 'clinicas'
  | 'agenda'
  | 'usuarios'
  | 'bell'
  | 'menu'
  | 'close'
  | 'add'
  | 'search'
  | 'chevron_right'
  | 'chevron_down'
  | 'eye'
  | 'edit'
  | 'delete'
  | 'logout'
  | 'back'
  | 'vitals'
  | 'map'
  | 'person'
  | 'shield'
  | 'history'
