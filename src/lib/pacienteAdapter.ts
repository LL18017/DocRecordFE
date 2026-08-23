// ─── Adaptador Patient ⇄ PacienteDto ───────────────────────────────────────
// La tabla de pacientes y su expediente todavía se muestran con el tipo
// `Patient` de la maqueta (así lo esperan DataTable, columnas, etc.); esto
// adapta la respuesta real del API a ese shape. Vive fuera de services/
// porque no es una llamada HTTP, es una traducción para la UI existente.

import type { Patient } from '@/types'
import type { PacienteDto } from '@/services/pacientes'

/**
 * Convierte una **fecha civil** (`YYYY-MM-DD`, que es lo que manda el backend
 * en `fechaNacimiento`) a un `Date` situado en horario **local**.
 *
 * POR QUÉ NO `new Date(fechaISO)` — es un error fácil de volver a cometer:
 * el estándar obliga a interpretar la forma corta `YYYY-MM-DD` como medianoche
 * **UTC**, mientras que todo lo que se lee después (`getFullYear`, `getMonth`,
 * `getDate`, `toLocaleDateString`) es **local**. En cualquier zona con desfase
 * negativo —El Salvador es UTC-6— esa medianoche cae el día anterior, así que
 * la fecha retrocedía un día: el backend enviaba `1996-06-15` y el expediente
 * mostraba «14 de junio de 1996», y el paciente aparecía con un año de más
 * durante todo el día previo a su cumpleaños.
 *
 * Un año-mes-día no es un instante: no debe pasar por ninguna conversión de
 * zona horaria. Por eso se parten los componentes a mano y se usa el
 * constructor de tres argumentos, que sí construye la fecha en horario local,
 * el mismo en el que la leen los getters y el formateo.
 *
 * Devuelve `null` cuando la cadena no representa una fecha usable, para que
 * quien llama decida qué mostrar en lugar de propagar un `NaN`.
 *
 * Se exporta porque la regla vale para cualquier fecha del sistema, no solo
 * para la de nacimiento: `services/consultas.ts` la usa al pintar la marca de
 * tiempo de consultas y recetas. Reimplementarla allí habría duplicado —y
 * tarde o temprano desincronizado— la única defensa que este proyecto tiene
 * contra el día que retrocede.
 */
export function parsearFechaCivil(fechaISO: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO.trim())

  if (partes) {
    const anio = Number(partes[1])
    const mes = Number(partes[2])
    const dia = Number(partes[3])
    const fecha = new Date(anio, mes - 1, dia)
    // El constructor no valida: '2026-02-30' se convierte en el 2 de marzo.
    // Si los componentes no sobreviven el viaje de ida y vuelta, la fecha no
    // existe y vale más no mostrar nada que mostrar otro día.
    const esReal =
      fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia
    return esReal ? fecha : null
  }

  // Cualquier otro formato (un instante completo con hora y zona, o basura).
  // Ahí `new Date` sí es la interpretación correcta: un instante sí lleva zona.
  const fecha = new Date(fechaISO)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

function calcularEdad(fechaISO: string): number {
  const nacimiento = parsearFechaCivil(fechaISO)
  if (!nacimiento) return 0
  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noHaCumplidoAun =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noHaCumplidoAun) edad--
  return edad
}

function formatearFecha(fechaISO: string): string {
  const fecha = parsearFechaCivil(fechaISO)
  if (!fecha) return fechaISO
  return fecha.toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Traduce `sexo` a la etiqueta que muestra el expediente.
 *
 * `sexo` es anulable a propósito (viene de `PersonaDto`): una persona
 * registrada primero como médico o enfermera todavía no lo tiene capturado.
 * Meter ese null en la rama de 'M' hacía que el expediente afirmara
 * «Masculino» sobre un dato que nadie registró. El guion es el mismo que el
 * adaptador ya usa para telefono, direccion y dui: falta el dato, no se
 * inventa.
 */
function formatearSexo(sexo: 'M' | 'F' | null): string {
  if (sexo === 'F') return 'Femenino'
  if (sexo === 'M') return 'Masculino'
  return '—'
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
    sex: formatearSexo(p.persona.sexo),
    // `null`, no 0: `PacienteResponseDto` no incluye el número de consultas y
    // este adaptador no tiene forma de saberlo. El 0 que había aquí llegaba a
    // la tabla como un dato más y decía de todos los pacientes que nunca
    // habían venido, incluidos los que tenían consultas registradas. Quien
    // pinte la lista debe rellenarlo con el conteo real de `GET /consultas`
    // (`contarConsultasPorPaciente`) o mostrar el hueco.
    consultations: null,
    status: 'Activo',
    blood: p.tipoSangre || '—',
    email: '',
    address: p.persona.direccion || '—',
    born: p.persona.fechaNacimiento ? formatearFecha(p.persona.fechaNacimiento) : '—',
    // dui puede ser null: los menores de edad no tienen DUI.
    id_num: p.persona.dui || '—',
  }
}
