// Guardas del servicio de pacientes: traducción del 409 y forma del payload.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  actualizarPaciente,
  crearPaciente,
  listarPacientes,
  type CrearPacientePayload,
} from './pacientes'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

function respuesta(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? '' : JSON.stringify(cuerpo), { status })
}

/** Espera el rechazo y devuelve el `ApiError`. Falla si la promesa se resuelve. */
async function errorDe(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa
  } catch (e) {
    return e as ApiError
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
}

/** Cuerpo JSON que se envió en la llamada `n` (0-based). */
function cuerpoEnviado(n = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[n][1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

const personaNueva: CrearPacientePayload = {
  persona: {
    dui: '01234567-8',
    nombres: 'Carlos Miguel',
    apellidos: 'Chávez Aguilar',
    fechaNacimiento: '1996-06-15',
    sexo: 'M',
  },
  tipoSangre: 'O+',
}

const personaExistente: CrearPacientePayload = {
  persona: { personaId: 12, fechaNacimiento: '1996-06-15', sexo: 'M' },
  tipoSangre: 'A-',
}

describe('crearPaciente · traducción del 409', () => {
  it('da un mensaje legible, no el genérico del cliente HTTP', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, { error: 'duplicate key value' }))

    const error = await errorDe(crearPaciente(personaNueva))

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    // «duplicate key value violates unique constraint» no le dice nada a quien
    // está registrando en recepción.
    expect(error.message).not.toMatch(/duplicate|constraint/i)
    expect(error.message).toBe('Esta persona ya está registrada como paciente.')
  })

  it('el mensaje del 409 es DISTINTO al reutilizar una persona existente', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, { error: 'conflict' }))
    const alReutilizar = await errorDe(crearPaciente(personaExistente))

    fetchMock.mockResolvedValueOnce(respuesta(409, { error: 'conflict' }))
    const alCrear = await errorDe(crearPaciente(personaNueva))

    // Son dos situaciones distintas y el usuario debe poder actuar distinto:
    // al completar una persona ya encontrada, el 409 puede significar además
    // que el DUI no coincide con el que esa persona ya tenía registrado.
    expect(alReutilizar.message).not.toBe(alCrear.message)
    expect(alReutilizar.message).toMatch(/DUI no coincide/i)
    expect(alCrear.message).not.toMatch(/DUI no coincide/i)
  })

  it('no toca los errores que no son 409', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(422, { error: 'sexo es obligatorio' }))

    const error = await errorDe(crearPaciente(personaNueva))

    // El 422 del backend ya viene legible; reescribirlo escondería qué falta.
    expect(error.status).toBe(422)
    expect(error.message).toBe('sexo es obligatorio')
  })
})

describe('crearPaciente · forma del payload', () => {
  it('NUNCA envía `expediente`: el correlativo lo genera el servidor', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(201, { personaId: 1, expediente: 'EXP-0007' }))

    await crearPaciente(personaNueva)

    const cuerpo = cuerpoEnviado()
    // Si alguien reintroduce un campo de expediente en el formulario, quien lo
    // registre tendrá que inventar un número único sin saber cuál está libre:
    // colisión garantizada contra la restricción de unicidad de la base.
    expect(cuerpo).not.toHaveProperty('expediente')
    expect(JSON.stringify(cuerpo)).not.toMatch(/expediente/i)
    expect(Object.keys(cuerpo).sort()).toEqual(['persona', 'tipoSangre'])
  })

  it('va por POST a /pacientes con el cuerpo íntegro', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(201, { personaId: 1 }))

    await crearPaciente(personaNueva)

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:8080/pacientes')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(cuerpoEnviado()).toEqual(personaNueva)
  })
})

describe('actualizarPaciente', () => {
  it('tampoco envía `expediente` (no es editable)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { personaId: 12 }))

    await actualizarPaciente(12, { persona: { telefono: '7000-0000' }, tipoSangre: 'B+' })

    expect(JSON.stringify(cuerpoEnviado())).not.toMatch(/expediente/i)
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:8080/pacientes/12')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })

  it('traduce el 409 al conflicto de DUI', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, { error: 'conflict' }))

    const error = await errorDe(actualizarPaciente(12, { tipoSangre: 'B+' }))

    expect(error.message).toBe('El DUI no coincide con el de la persona registrada.')
  })
})

describe('listarPacientes · búsqueda', () => {
  it('codifica el texto de búsqueda en la query', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, []))

    await listarPacientes('Chávez Aguilar & hijos')

    // Sin `encodeURIComponent`, un `&` o un `#` en el apellido partiría la URL
    // y el backend recibiría un criterio truncado.
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://localhost:8080/pacientes?buscar=Ch%C3%A1vez%20Aguilar%20%26%20hijos',
    )
  })

  it('no manda el parámetro cuando no hay búsqueda', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, []))

    await listarPacientes()

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:8080/pacientes')
  })

  it('tampoco lo manda con una búsqueda vacía', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, []))

    await listarPacientes('')

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:8080/pacientes')
  })
})
