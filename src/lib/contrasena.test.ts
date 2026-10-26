// HU-03, criterio 2 · la contraseña nueva exige 8 caracteres, una mayúscula y un número.
import { describe, expect, it } from 'vitest'
import { motivoContrasenaInvalida } from './contrasena'

describe('motivoContrasenaInvalida', () => {
  it('acepta una contraseña que cumple las tres condiciones', () => {
    expect(motivoContrasenaInvalida('Docrecord2026')).toBeNull()
  })

  it('rechaza menos de 8 caracteres', () => {
    expect(motivoContrasenaInvalida('Ab1cdef')).toBe(
      'La contraseña debe tener al menos 8 caracteres.',
    )
  })

  it('rechaza una contraseña sin mayúscula', () => {
    expect(motivoContrasenaInvalida('sinmayuscula1')).toBe(
      'La contraseña debe incluir una mayúscula.',
    )
  })

  it('rechaza una contraseña sin número', () => {
    expect(motivoContrasenaInvalida('SinNumeroAqui')).toBe(
      'La contraseña debe incluir un número.',
    )
  })

  it('nombra todo lo que falta, no solo lo primero', () => {
    expect(motivoContrasenaInvalida('abc')).toBe(
      'La contraseña debe tener al menos 8 caracteres, incluir una mayúscula y incluir un número.',
    )
  })

  it('cuenta una mayúscula acentuada, igual que el backend', () => {
    expect(motivoContrasenaInvalida('Ñandurí123')).toBeNull()
    expect(motivoContrasenaInvalida('ñandú1234Á')).toBeNull()
  })
})
