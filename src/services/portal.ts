// ─── Servicio del portal del paciente ──────────────────────────────────────
// HU-34. Dos mitades que se tocan en la misma cuenta:
//
// · Lo que pide el PACIENTE (`/mi/...`): su expediente en solo lectura y en
//   PDF. Ninguna de esas llamadas lleva un id: el backend arma siempre el
//   expediente de la sesión, así que desde aquí no hay forma de pedir el de
//   otro aunque alguien lo intente (criterio 2).
//
// · Lo que hace el PERSONAL desde el expediente (`/pacientes/{id}/acceso-portal`):
//   abrirle la cuenta al paciente, con el mismo modelo que la ficha de médico
//   (services/medicos.ts): la cuenta nace sin activar y al paciente le llega
//   una invitación para elegir su contraseña en /activar.

import { ApiError, apiFetch } from '@/lib/api'
import type { AlergiaDto } from '@/services/alergias'
import type { CitaDto } from '@/services/citas'
import type { ConsultaDto } from '@/services/consultas'
import type { PrescripcionDto } from '@/services/prescripciones'
import type { SignosVitalesDto } from '@/services/signosVitales'

// ─── El expediente del paciente ────────────────────────────────────────────

/** Un término técnico con su explicación en lenguaje llano (HU-34 c3). */
export interface TerminoDelGlosarioDto {
  /**
   * Clave estable con que la pantalla pide la explicación: un campo
   * (`presionArterial`) o un valor cerrado (`severidad.SEVERA`,
   * `consulta.ANULADA`), con el nombre exacto del valor que manda el backend.
   */
  clave: string
  termino: string
  explicacion: string
}

/** Espejo de `MiExpedienteDto.DatosDelPacienteDto`. */
export interface DatosDelPacienteDto {
  personaId: number
  expediente: string
  nombres: string
  apellidos: string
  dui: string | null
  /** Fecha civil `AAAA-MM-DD`. */
  fechaNacimiento: string | null
  sexo: 'M' | 'F' | null
  tipoSangre: string | null
  telefono: string | null
  direccion: string | null
  email: string | null
}

/**
 * Espejo de `MiExpedienteDto`. Cada sección reutiliza el DTO que ya lee el
 * personal clínico: el paciente ve lo mismo, con el diagnóstico incluido (a
 * él no se le recorta, ver ConsultaService.delPropioPaciente).
 */
export interface MiExpedienteDto {
  paciente: DatosDelPacienteDto
  /** Vigentes, las severas primero. */
  alergias: AlergiaDto[]
  /** `null` si nunca se le tomaron. */
  ultimosSignosVitales: SignosVitalesDto | null
  /** La más reciente primero; las anuladas vienen marcadas por su estado. */
  consultas: ConsultaDto[]
  /** La más reciente primero; las anuladas vienen marcadas por su estado. */
  recetas: PrescripcionDto[]
  /** Solo las agendadas a futuro, la más próxima primero. */
  proximasCitas: CitaDto[]
  glosario: TerminoDelGlosarioDto[]
  consultadoEn: string
}

/** El expediente de la sesión. Abrirlo queda en la bitácora de accesos (c6). */
export async function obtenerMiExpediente(): Promise<MiExpedienteDto> {
  try {
    return await apiFetch<MiExpedienteDto>('/mi/expediente')
  } catch (error) {
    throw traducirErrorDelPortal(error)
  }
}

/**
 * HU-34 c5: baja el expediente en PDF. Va por `fetch` con el token y no con un
 * `<a href>` por lo mismo que la receta (ver `imprimirPrescripcion`): el
 * endpoint exige la sesión y un enlace directo iría sin cabecera. La descarga
 * también queda en la bitácora, como PDF.
 */
export async function descargarMiExpedientePdf(expediente: string): Promise<void> {
  let pdf: Blob
  try {
    pdf = await apiFetch<Blob>('/mi/expediente/pdf', { formato: 'blob' })
  } catch (error) {
    throw traducirErrorDelPortal(error)
  }

  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `expediente-${expediente}.pdf`
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Con un respiro para que el navegador termine de guardar el archivo.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * El 403 del portal no es «no tienes permiso» a secas: casi siempre es una
 * cuenta con el rol pero sin expediente vinculado, y el backend lo dice. Se
 * deja pasar su mensaje; solo se explica el 403 que llegue sin uno.
 */
function traducirErrorDelPortal(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo abrir tu expediente.')
  }
  if (error.status === 403 && !/expediente/i.test(error.message)) {
    return new ApiError(403, 'Tu cuenta no tiene acceso al portal del paciente.')
  }
  return error
}

// ─── El acceso al portal, desde el expediente ──────────────────────────────

export type EstadoDeCuentaDelPortal = 'SIN_ACTIVAR' | 'ACTIVA' | 'DESACTIVADA'

/** La cuenta con que el paciente entra a su portal. */
export interface CuentaDelPortalDto {
  userId: number
  email: string
  estado: EstadoDeCuentaDelPortal
  /** El rol que abre el portal. Una cuenta del personal puede no tenerlo todavía. */
  conRolPaciente: boolean
}

/** Espejo de `AccesoAlPortalDto`. */
export interface AccesoAlPortalDto {
  pacienteId: number
  /** El correo de contacto de la ficha, para proponerlo como usuario. */
  correoDeContacto: string | null
  /** `null` si el paciente todavía no tiene cuenta. */
  cuenta: CuentaDelPortalDto | null
  /** true si en esta llamada se mandó una invitación. */
  invitacionEnviada: boolean
  /** false si la invitación se guardó pero el correo no salió: se puede reenviar. */
  correoEnviado: boolean
}

export async function obtenerAccesoAlPortal(pacienteId: number): Promise<AccesoAlPortalDto> {
  return apiFetch<AccesoAlPortalDto>(`/pacientes/${pacienteId}/acceso-portal`)
}

/**
 * Le da al paciente acceso a su portal. Sin cuenta: la crea con el correo
 * (o, si no se manda, con el de contacto de la ficha) y le manda la
 * invitación. Sin activar: invitación nueva. Activa: le agrega el rol
 * Paciente si le faltaba.
 */
export async function darAccesoAlPortal(pacienteId: number, email?: string): Promise<AccesoAlPortalDto> {
  const cuerpo = email?.trim() ? { email: email.trim() } : {}
  return apiFetch<AccesoAlPortalDto>(`/pacientes/${pacienteId}/acceso-portal`, { method: 'POST', body: cuerpo })
}

/** Cómo está el acceso del paciente, en una etiqueta. */
export function estadoDelAccesoAlPortal(acceso: AccesoAlPortalDto): { texto: string; color: string } {
  const cuenta = acceso.cuenta
  if (!cuenta) return { texto: 'Sin acceso al portal', color: 'gray' }
  if (cuenta.estado === 'DESACTIVADA') return { texto: 'Cuenta desactivada', color: 'red' }
  if (cuenta.estado === 'SIN_ACTIVAR') return { texto: 'Invitación enviada', color: 'blue' }
  if (!cuenta.conRolPaciente) return { texto: 'Sin acceso al portal', color: 'gray' }
  return { texto: 'Con acceso al portal', color: 'green' }
}
