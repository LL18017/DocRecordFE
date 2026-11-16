// ─── Validaciones de datos personales ──────────────────────────────────────
// Observaciones de la tutora: el teléfono es salvadoreño de 8 dígitos y nadie
// nace después de hoy. Son las mismas reglas que aplica el backend
// (PersonaRequestDto); se comprueban aquí para avisar junto al campo, antes de
// enviar.

/** El teléfono es opcional: vacío no es un error. 8 dígitos, con o sin guion. */
export function motivoTelefonoInvalido(telefono: string): string | null {
  const limpio = telefono.trim()
  if (limpio === '') return null
  return /^\d{4}-?\d{4}$/.test(limpio)
    ? null
    : 'El teléfono debe tener 8 dígitos (2222-2222 o 22222222).'
}

/**
 * Hoy como `YYYY-MM-DD` en la zona de El Salvador, no en la del navegador: la
 * fecha máxima de nacimiento no debe adelantarse ni atrasarse un día según
 * dónde esté configurado el equipo. El locale `en-CA` formatea ISO.
 */
export function hoyEnElSalvador(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/**
 * La fecha de nacimiento más antigua que se acepta, la misma que el backend
 * (PersonaRequestDto.PRIMERA_FECHA_DE_NACIMIENTO). Nadie que se atienda hoy
 * nació antes de 1900: una fecha así es un año mal escrito (0990 por 1990).
 */
export const FECHA_MINIMA_DE_NACIMIENTO = '1900-01-01'

/** Lo que se acepta, dicho de antemano junto al campo (CampoFechaDeNacimiento). */
export const AYUDA_NACIMIENTO = 'Desde el 1 de enero de 1900 hasta hoy.'

/** `fecha` es `YYYY-MM-DD`. Vacía no es un error aquí: de eso se ocupa `required`. */
export function motivoNacimientoInvalido(fecha: string, hoy: string = hoyEnElSalvador()): string | null {
  if (!fecha) return null
  // Comparar texto ISO es comparar fechas: el formato es de ancho fijo.
  if (fecha > hoy) return 'La fecha de nacimiento no puede ser posterior a hoy.'
  if (fecha < FECHA_MINIMA_DE_NACIMIENTO) return 'La fecha de nacimiento no puede ser anterior a 1900.'
  return null
}
