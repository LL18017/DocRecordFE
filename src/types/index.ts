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

export interface Role {
  roleId: number
  name: string
}

export interface UserType {
  userTypeID: number
  name: string
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  usuario: {
    id: number;
    username: string;
    nombre: string;
  };
}

export interface User {
  userID?: number
  name: string
  email: string
  roles: Role[]
  specialty?: string
  password: string
  enabled: true
  userType: UserType
}
export interface UserRegister {
  email: string
  roles: number[]
  userName: string
  password: string
  userType: number
}

export interface Clinica {
  id: number
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  patients: number
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
