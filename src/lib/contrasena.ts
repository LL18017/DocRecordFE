// ─── Regla de la contraseña nueva ──────────────────────────────────────────
// HU-03, criterio 2: mínimo 8 caracteres, al menos una mayúscula y al menos un
// número. Es la misma regla que aplica el backend (ReglaDeContrasena); se
// comprueba también aquí para no gastar un viaje —y, en /restablecer, un
// enlace de un solo uso— por algo que ya se sabe que va a rechazarse.

export const LARGO_MINIMO_CONTRASENA = 8

/** Texto de ayuda bajo el campo, para decir la regla antes de que se incumpla. */
export const AYUDA_CONTRASENA =
  'Mínimo 8 caracteres, con al menos una mayúscula y un número.'

/**
 * Motivo por el que la contraseña no sirve, o `null` si cumple la regla.
 * Dice qué falta en concreto en vez de repetir la regla completa.
 */
export function motivoContrasenaInvalida(contrasena: string): string | null {
  const faltas: string[] = []
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    faltas.push(`tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`)
  }
  // \p{Lu} y no [A-Z]: una mayúscula acentuada también cuenta, igual que en el backend.
  if (!/\p{Lu}/u.test(contrasena)) faltas.push('incluir una mayúscula')
  if (!/\d/.test(contrasena)) faltas.push('incluir un número')

  if (faltas.length === 0) return null
  return `La contraseña debe ${faltas.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
}
