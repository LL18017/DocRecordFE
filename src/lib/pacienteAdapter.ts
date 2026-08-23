// ─── Adaptador Patient ⇄ PacienteDto ───────────────────────────────────────
// La tabla de pacientes y su expediente todavía se muestran con el tipo
// `Patient` de la maqueta (así lo esperan DataTable, columnas, etc.); esto
// adapta la respuesta real del API a ese shape. Vive fuera de services/
// porque no es una llamada HTTP, es una traducción para la UI existente.

import type { Patient } from '@/types'
import type { PacienteDto } from '@/services/pacientes'

function calcularEdad(fechaISO: string): number {
  const nacimiento = new Date(fechaISO)
  if (Number.isNaN(nacimiento.getTime())) return 0
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noHaCumplidoAun =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noHaCumplidoAun) edad--
  return edad
}

function formatearFecha(fechaISO: string): string {
  const fecha = new Date(fechaISO)
  if (Number.isNaN(fecha.getTime())) return fechaISO
  return fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * `email` no existe en `persona`, así que queda vacío. `fechaNacimiento` y
 * `sexo` siempre vienen presentes en un `PacienteDto`: el backend exige
 * ambos para crear el paciente (ver PatientForm).
 */
export function pacienteDtoAPatient(p: PacienteDto): Patient {
  return {
    id: String(p.personaId),
    name: `${p.persona.nombres} ${p.persona.apellidos}`.trim(),
    phone: p.persona.telefono || '—',
    age: p.persona.fechaNacimiento ? calcularEdad(p.persona.fechaNacimiento) : 0,
    sex: p.persona.sexo === 'F' ? 'Femenino' : 'Masculino',
    consultations: 0,
    status: 'Activo',
    blood: p.tipoSangre || '—',
    email: '',
    address: p.persona.direccion || '—',
    born: p.persona.fechaNacimiento ? formatearFecha(p.persona.fechaNacimiento) : '—',
    // dui puede ser null: los menores de edad no tienen DUI.
    id_num: p.persona.dui || '—',
  }
}
