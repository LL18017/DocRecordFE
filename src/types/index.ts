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

export type Role = 'medico' | 'enfermera' | 'Administrador'

export interface User {
  id?: number
  name: string
  email?: string
  role: Role
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
  address?: string
  phone?: string
  patients?: number
}

export interface Patient {
  id: string
  name: string
  phone: string
  age: number
  sex: string
  consultations: number
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
