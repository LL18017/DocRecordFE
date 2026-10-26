// Observaciones de la tutora · teléfono de 8 dígitos y nacimiento no futuro.
import { describe, expect, it } from 'vitest'
import { hoyEnElSalvador, motivoNacimientoInvalido, motivoTelefonoInvalido } from './validaciones'

describe('motivoTelefonoInvalido', () => {
  it.each(['2222-2222', '22222222', '', '   '])('acepta «%s»', (valor) => {
    expect(motivoTelefonoInvalido(valor)).toBeNull()
  })

  it.each(['222222222', '2222-22222', '1234567', 'abcd-efgh', '+503 2222 2222'])(
    'rechaza «%s»',
    (valor) => {
      expect(motivoTelefonoInvalido(valor)).toBe(
        'El teléfono debe tener 8 dígitos (2222-2222 o 22222222).',
      )
    },
  )
})

describe('hoyEnElSalvador', () => {
  it('usa la zona de El Salvador (UTC-6) y no la del equipo', () => {
    // 03:00 UTC del 2 de enero todavía es 1 de enero a las 21:00 allá.
    expect(hoyEnElSalvador(new Date('2026-01-02T03:00:00Z'))).toBe('2026-01-01')
    expect(hoyEnElSalvador(new Date('2026-01-02T07:00:00Z'))).toBe('2026-01-02')
  })
})

describe('motivoNacimientoInvalido', () => {
  it('acepta hoy y el pasado, y no se queja de vacío', () => {
    expect(motivoNacimientoInvalido('2026-05-10', '2026-05-10')).toBeNull()
    expect(motivoNacimientoInvalido('1990-01-01', '2026-05-10')).toBeNull()
    expect(motivoNacimientoInvalido('', '2026-05-10')).toBeNull()
  })

  it('rechaza una fecha posterior a hoy', () => {
    expect(motivoNacimientoInvalido('2026-05-11', '2026-05-10')).toBe(
      'La fecha de nacimiento no puede ser posterior a hoy.',
    )
  })
})
