// Guardas del servicio de pacientes: qué mensaje ve el usuario y forma del payload.
//
// Estas pruebas van por el camino completo (fetch → lib/api.ts → servicio), no
// contra un `apiFetch` simulado: lo que se protege es el texto que termina en
// pantalla. Los cuerpos de 409 usados aquí son los que devuelve de verdad el
// backend, copiados de la API en marcha.
//
// La regla que vigilan: `lib/api.ts` ya entrega el motivo concreto del
// backend, así que el servicio solo debe sustituirlo cuando el texto local sea
// MÁS preciso. Las pruebas que importan son las que se ponen en rojo si
// alguien vuelve a taparlo con una frase fija.

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

// Cuerpos reales de `POST /pacientes` y `PUT /pacientes/{id}`. `error` es la
// CATEGORÍA del fallo y `message` el motivo; `lib/api.ts` prefiere el segundo.
const YA_ES_PACIENTE = {
  error: 'Error',
  message: 'Esta persona ya esta registrada como paciente',
}
const DUI_NO_COINCIDE_AL_ALTA = {
  error: 'Error',
  message: 'El DUI recibido no coincide con el de la persona existente',
}
const INTEGRIDAD = {
  error: 'Violación de integridad',
  message:
    'La operación no puede realizarse porque los datos entran en conflicto con información existente',
}
const DUI_NO_COINCIDE_AL_EDITAR = {
  error: 'Error',
  message: 'El DUI no coincide con el de la persona registrada',
}

describe('crearPaciente · el 409 del backend llega intacto', () => {
  it('dice que ya es paciente cuando eso es lo que pasó', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, YA_ES_PACIENTE))

    const error = await errorDe(crearPaciente(personaExistente))

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.message).toBe(YA_ES_PACIENTE.message)
  })

  it('dice que el DUI no coincide cuando eso es lo que pasó', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, DUI_NO_COINCIDE_AL_ALTA))

    const error = await errorDe(crearPaciente(personaExistente))

    expect(error.message).toBe(DUI_NO_COINCIDE_AL_ALTA.message)
  })

  it('mantiene separados los dos conflictos, sin juntarlos en un «o»', async () => {
    // Antes ambos casos se reemplazaban por una única frase: «Esta persona ya
    // está registrada como paciente, o el DUI no coincide con su registro».
    // Los dos motivos piden acciones opuestas —buscar al paciente ya dado de
    // alta, o corregir el DUI tecleado—, así que fundirlos le quitaba al
    // usuario el dato que el backend sí le estaba dando.
    fetchMock.mockResolvedValueOnce(respuesta(409, YA_ES_PACIENTE))
    const yaEsPaciente = await errorDe(crearPaciente(personaExistente))

    fetchMock.mockResolvedValueOnce(respuesta(409, DUI_NO_COINCIDE_AL_ALTA))
    const duiDistinto = await errorDe(crearPaciente(personaExistente))

    expect(yaEsPaciente.message).not.toBe(duiDistinto.message)
    expect(yaEsPaciente.message).not.toMatch(/DUI/i)
    expect(duiDistinto.message).toMatch(/DUI/i)
    // Ninguno de los dos puede volver a ser la frase con las dos causas.
    for (const error of [yaEsPaciente, duiDistinto]) {
      expect(error.message).not.toMatch(/, o el DUI/i)
    }
  })

  it('no afirma un alta duplicada cuando el backend solo habla de integridad', async () => {
    // Alta de una persona nueva cuyo DUI ya está en la base. Comprobado contra
    // la API: esa persona puede existir SIN ser paciente (solo médico, o dada
    // de baja como paciente), así que «Esta persona ya está registrada como
    // paciente» —el texto que se ponía aquí— es falso en ese caso. El genérico
    // del backend es vago, pero no miente.
    fetchMock.mockResolvedValueOnce(respuesta(409, INTEGRIDAD))

    const error = await errorDe(crearPaciente(personaNueva))

    expect(error.message).toBe(INTEGRIDAD.message)
    expect(error.message).not.toMatch(/registrada como paciente/i)
  })

  it('nunca muestra la categoría del error en vez del motivo', async () => {
    // `error` trae «Error» o «Violación de integridad»: no le dicen al usuario
    // qué pasó. Si `lib/api.ts` volviera a preferir esa clave, esto se cae.
    fetchMock.mockResolvedValueOnce(respuesta(409, YA_ES_PACIENTE))
    expect((await errorDe(crearPaciente(personaExistente))).message).not.toBe('Error')

    fetchMock.mockResolvedValueOnce(respuesta(409, INTEGRIDAD))
    expect((await errorDe(crearPaciente(personaNueva))).message).not.toBe(
      'Violación de integridad',
    )
  })

  it('no toca los errores que no son 409', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(422, { error: 'sexo es obligatorio' }))

    const error = await errorDe(crearPaciente(personaNueva))

    // El 422 del backend ya viene legible; reescribirlo escondería qué falta.
    expect(error.status).toBe(422)
    expect(error.message).toBe('sexo es obligatorio')
  })
})

describe('pacientes · ninguna sustitución puede tapar el motivo del backend', () => {
  // Motivo que este servicio no puede conocer ni predecir. Cualquier frase
  // fija escrita en pacientes.ts —da igual cuál— lo reemplazaría y pondría
  // estas pruebas en rojo. Esa es exactamente su función.
  const CONFLICTO_IMPREVISTO = {
    error: 'Conflicto',
    message: 'El expediente EXP-000042 ya fue emitido para otra persona',
  }

  it('al dar de alta a una persona nueva', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, CONFLICTO_IMPREVISTO))

    const error = await errorDe(crearPaciente(personaNueva))

    expect(error.message).toBe(CONFLICTO_IMPREVISTO.message)
  })

  it('al completar una persona ya existente', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, CONFLICTO_IMPREVISTO))

    const error = await errorDe(crearPaciente(personaExistente))

    expect(error.message).toBe(CONFLICTO_IMPREVISTO.message)
  })

  it('al editar un paciente', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, CONFLICTO_IMPREVISTO))

    const error = await errorDe(actualizarPaciente(12, { tipoSangre: 'B+' }))

    // El texto que había —«El DUI no coincide con el de la persona
    // registrada»— se aplicaba a CUALQUIER 409: aquí le habría contado al
    // usuario un problema de DUI que no existe.
    expect(error.message).toBe(CONFLICTO_IMPREVISTO.message)
    expect(error.message).not.toMatch(/DUI/i)
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

  it('deja pasar el conflicto de DUI tal como lo redacta el backend', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(409, DUI_NO_COINCIDE_AL_EDITAR))

    const error = await errorDe(actualizarPaciente(12, { persona: { dui: '99999999-1' } }))

    expect(error.status).toBe(409)
    expect(error.message).toBe(DUI_NO_COINCIDE_AL_EDITAR.message)
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
