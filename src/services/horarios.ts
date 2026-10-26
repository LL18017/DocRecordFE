// ─── Servicio de médicos y horarios de una sede (HU-29) ────────────────────
// `/clinics/{clinicaId}/medicos`: qué médicos atienden en la sede, con su
// especialidad y sus franjas semanales.
//
// QUIÉN PUEDE QUÉ (lo impone el backend, esto solo lo refleja):
//   · Leer la ficha                 → ADMIN, MÉDICO y ENFERMERA.
//   · Agregar o quitar horarios,
//     quitar a un médico de la sede → solo ADMIN (403 a cualquier otro).
//
// Que dos franjas del mismo médico no se traslapen —en esta sede o en otra—
// lo valida el backend; su 409 nombra el conflicto y es el mensaje que se
// muestra.
import { apiFetch, ApiError } from '@/lib/api'
import type { CitaDto } from '@/services/citas'

export interface HorarioDto {
  horarioId: number
  /** 1 = lunes … 7 = domingo. */
  diaSemana: number
  /** `HH:mm`. */
  horaInicio: string
  horaFin: string
}

export interface MedicoDeClinicaDto {
  medicoId: number
  nombre: string
  especialidad: string | null
  horarios: HorarioDto[]
}

export interface HorarioPayload {
  diaSemana: number
  horaInicio: string
  horaFin: string
}

export const DIAS: { valor: number; etiqueta: string; corta: string }[] = [
  { valor: 1, etiqueta: 'Lunes', corta: 'Lun' },
  { valor: 2, etiqueta: 'Martes', corta: 'Mar' },
  { valor: 3, etiqueta: 'Miércoles', corta: 'Mié' },
  { valor: 4, etiqueta: 'Jueves', corta: 'Jue' },
  { valor: 5, etiqueta: 'Viernes', corta: 'Vie' },
  { valor: 6, etiqueta: 'Sábado', corta: 'Sáb' },
  { valor: 7, etiqueta: 'Domingo', corta: 'Dom' },
]

/** Las horas que se ofrecen al definir un horario: la grilla de 30 minutos. */
export const HORAS: string[] = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
)

const ruta = (clinicaId: number) => `/clinics/${clinicaId}/medicos`

export function listarMedicosConHorario(clinicaId: number): Promise<MedicoDeClinicaDto[]> {
  return apiFetch<MedicoDeClinicaDto[]>(ruta(clinicaId))
}

export async function agregarHorario(
  clinicaId: number,
  medicoId: number,
  payload: HorarioPayload,
): Promise<HorarioDto> {
  try {
    return await apiFetch<HorarioDto>(`${ruta(clinicaId)}/${medicoId}/horarios`, { method: 'POST', body: payload })
  } catch (error) {
    throw traducirError(error)
  }
}

export async function quitarHorario(clinicaId: number, medicoId: number, horarioId: number): Promise<void> {
  try {
    await apiFetch<void>(`${ruta(clinicaId)}/${medicoId}/horarios/${horarioId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error)
  }
}

/** Las citas agendadas a futuro del médico en la sede (criterio 4). */
export function citasFuturasDelMedico(clinicaId: number, medicoId: number): Promise<CitaDto[]> {
  return apiFetch<CitaDto[]>(`${ruta(clinicaId)}/${medicoId}/citas-futuras`)
}

export async function quitarMedicoDeLaClinica(clinicaId: number, medicoId: number): Promise<void> {
  try {
    await apiFetch<void>(`${ruta(clinicaId)}/${medicoId}`, { method: 'DELETE' })
  } catch (error) {
    throw traducirError(error)
  }
}

export function etiquetaDeHorario(h: HorarioDto): string {
  const dia = DIAS.find((d) => d.valor === h.diaSemana)?.corta ?? `Día ${h.diaSemana}`
  return `${dia} ${h.horaInicio}–${h.horaFin}`
}

function traducirError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  if (error.status === 403) {
    return new ApiError(403, 'Solo el administrador puede cambiar los médicos y horarios de una sede.')
  }
  // 409 trae el traslape («ya atiende el lunes de 08:00 a 12:00 en…») o que
  // es su única sede; 400, la hora mal formada. Se muestran tal cual.
  return error
}
