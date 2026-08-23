// Guardas del adaptador DTO → fila de tabla.
//
// Aquí ocurrió el fallo que tumbaba la pantalla de pacientes: `dui` llegaba
// null del backend, el tipo declaraba `string`, TypeScript compilaba en verde
// y la búsqueda reventaba con "Cannot read properties of null". Estas pruebas
// existen para que ese null no vuelva a escaparse.

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { pacienteDtoAPatient } from './pacienteAdapter'
import type { PacienteDto } from '@/services/pacientes'

/** PacienteDto mínimo válido; cada prueba sobreescribe lo que le interesa. */
function dto(persona: Partial<PacienteDto['persona']> = {}, resto: Partial<PacienteDto> = {}): PacienteDto {
  return {
    personaId: 7,
    expediente: 'EXP-0001',
    tipoSangre: 'O+',
    creadoEn: '2026-01-10T10:00:00Z',
    persona: {
      personaId: 7,
      dui: '01234567-8',
      nombres: 'Carlos Miguel',
      apellidos: 'Chávez Aguilar',
      fechaNacimiento: '1996-06-15',
      sexo: 'M',
      telefono: '7000-0000',
      direccion: 'San Salvador',
      ...persona,
    },
    ...resto,
  }
}

describe('pacienteDtoAPatient · nulos del backend', () => {
  it('convierte a texto todos los campos que el backend puede mandar null', () => {
    const paciente = pacienteDtoAPatient(
      dto({ dui: null, telefono: null, direccion: null }, { tipoSangre: null }),
    )

    // La regresión concreta: `Patient` promete `string` en estos campos y la
    // tabla los usa sin comprobar. Un solo null aquí vuelve a romper la
    // pantalla al buscar (`paciente.id_num.toLowerCase()`).
    expect(paciente.id_num).toBe('—')
    expect(paciente.phone).toBe('—')
    expect(paciente.address).toBe('—')
    expect(paciente.blood).toBe('—')

    // Comprobación amplia: ningún campo de texto de `Patient` puede quedar
    // null/undefined, aunque mañana se agregue otro campo al adaptador.
    for (const [clave, valor] of Object.entries(paciente)) {
      expect(valor, `el campo "${clave}" no debe ser null ni undefined`).not.toBeNull()
      expect(valor, `el campo "${clave}" no debe ser null ni undefined`).not.toBeUndefined()
    }
    expect(typeof paciente.id_num).toBe('string')
    expect(typeof paciente.phone).toBe('string')
    expect(typeof paciente.address).toBe('string')
    expect(typeof paciente.blood).toBe('string')
  })

  it('no rompe cuando fechaNacimiento es null y no inventa una edad', () => {
    const paciente = pacienteDtoAPatient(dto({ fechaNacimiento: null }))

    expect(paciente.age).toBe(0)
    expect(paciente.born).toBe('—')
  })

  it('no rompe con una fechaNacimiento con formato inválido', () => {
    const paciente = pacienteDtoAPatient(dto({ fechaNacimiento: 'no-es-una-fecha' }))

    expect(paciente.age).toBe(0)
    expect(Number.isNaN(paciente.age)).toBe(false)
  })

  it('arma el nombre completo y no deja espacios sobrantes', () => {
    const paciente = pacienteDtoAPatient(dto({ nombres: 'Ana', apellidos: '' }))

    expect(paciente.name).toBe('Ana')
  })

  it('usa personaId como id de la fila (no existe pacienteId)', () => {
    const paciente = pacienteDtoAPatient(dto({}, { personaId: 42 }))

    expect(paciente.id).toBe('42')
  })
})

describe('pacienteDtoAPatient · cálculo de edad', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Fecha ISO (YYYY-MM-DD) desplazada `dias` respecto de hoy, hace `anios` años. */
  function nacimiento(anios: number, dias = 0): string {
    const hoy = new Date()
    const f = new Date(hoy.getFullYear() - anios, hoy.getMonth(), hoy.getDate() + dias)
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
  }

  it('da 30 el mismo día del cumpleaños número 30', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))

    expect(pacienteDtoAPatient(dto({ fechaNacimiento: nacimiento(30) })).age).toBe(30)
  })

  it('da 29 si el cumpleaños ya pasó hace meses pero aún no cumple el siguiente', () => {
    // Nació en enero, hoy es junio: ya cumplió este año.
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))

    expect(pacienteDtoAPatient(dto({ fechaNacimiento: '1996-01-10' })).age).toBe(30)
  })

  it('da 29 cuando el cumpleaños de este año todavía no llega (mes posterior)', () => {
    // Nació en diciembre, hoy es junio: aún no cumple.
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))

    expect(pacienteDtoAPatient(dto({ fechaNacimiento: '1996-12-10' })).age).toBe(29)
  })

  /**
   * DEFECTO CONOCIDO (no corregido a propósito, ver informe).
   *
   * `new Date('1996-06-16')` se interpreta como medianoche **UTC**, pero
   * `calcularEdad` lo compara con `getMonth()/getDate()`, que son **locales**.
   * En El Salvador (UTC-6) esa fecha se convierte en el 15 de junio local: un
   * día antes. Resultado: el paciente aparece con un año de más durante el día
   * previo a su cumpleaños.
   *
   * `it.fails` deja la prueba documentada y la suite en verde; en cuanto
   * alguien arregle `calcularEdad`, esta prueba se pondrá roja y habrá que
   * cambiarla a `it` — o sea, el defecto no se puede olvidar.
   */
  it.fails('DEFECTO: da 29 el día antes del cumpleaños número 30', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))

    expect(pacienteDtoAPatient(dto({ fechaNacimiento: nacimiento(30, 1) })).age).toBe(29)
  })
})

describe('pacienteDtoAPatient · sexo y fecha mostrada', () => {
  it('traduce M y F a las etiquetas de la interfaz', () => {
    expect(pacienteDtoAPatient(dto({ sexo: 'F' })).sex).toBe('Femenino')
    expect(pacienteDtoAPatient(dto({ sexo: 'M' })).sex).toBe('Masculino')
  })

  /**
   * DEFECTO CONOCIDO: `sexo === 'F' ? 'Femenino' : 'Masculino'` mete en la
   * misma rama a 'M' y a null. El tipo admite null (viene de `PersonaDto`), y
   * una persona registrada primero como médico no lo tiene. El expediente
   * termina afirmando "Masculino" sobre un dato que nadie capturó.
   */
  it.fails('DEFECTO: no debería inventar "Masculino" cuando sexo es null', () => {
    expect(pacienteDtoAPatient(dto({ sexo: null })).sex).not.toBe('Masculino')
  })

  /**
   * DEFECTO CONOCIDO: mismo desfase UTC/local que en la edad. La fecha de
   * nacimiento se muestra un día antes de la real en toda zona horaria
   * negativa, El Salvador incluida. Es visible directamente en el expediente.
   */
  it.fails('DEFECTO: muestra la fecha de nacimiento tal cual, sin correr un día', () => {
    expect(pacienteDtoAPatient(dto({ fechaNacimiento: '1996-06-15' })).born).toBe(
      '15 de junio de 1996',
    )
  })
})
