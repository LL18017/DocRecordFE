// Guardas de la traducción de errores del servicio de clínicas.
//
// Lo que se protege aquí no es que salga «un mensaje», sino cuál: `lib/api.ts`
// ya entrega el motivo concreto del backend (incluidos los campos de una
// validación de Spring), así que cada sustitución de este servicio tiene que
// mejorar ese texto. La prueba que importa es la que se pone en rojo si
// alguien vuelve a taparlo con una frase fija.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  actualizarClinica,
  clinicaDtoAClinica,
  crearClinica,
  eliminarClinica,
  formatearCoordenadas,
  type ClinicaDto,
} from './clinicas'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

const PAYLOAD = { name: 'Clínica Escalón', latitud: 13.7053, longitud: -89.2182 }

/** Espera el rechazo y devuelve el error. Falla si la promesa se resuelve. */
async function errorDe(promesa: Promise<unknown>): Promise<Error> {
  try {
    await promesa
  } catch (e) {
    return e as Error
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
}

beforeEach(() => {
  apiFetch.mockReset()
})

// Guardas de `clinicaDtoAClinica` y `formatearCoordenadas`, que hasta ahora
// solo se ejercitaban de forma indirecta (a través de las pantallas). Se
// prueban aquí con la forma REAL de `ClinicasResponseDto` —`latitud`/
// `longitud` como `number | null`, tal como lo documenta `ClinicaDto`—, no con
// un `Clinica` ya adaptado: es en la frontera del adaptador donde un `0` o un
// texto inventado en vez de `null` se cuela sin que nada avise.
describe('clinicaDtoAClinica · adapta ClinicasResponseDto tal cual llega', () => {
  it('traslada las coordenadas cuando la clínica sí las tiene', () => {
    const dto: ClinicaDto = { clinicaId: 1, name: 'Clínica Escalón', latitud: 13.7053, longitud: -89.2182 }

    expect(clinicaDtoAClinica(dto)).toEqual({
      id: 1,
      name: 'Clínica Escalón',
      lat: 13.7053,
      lng: -89.2182,
    })
  })

  it('conserva AMBOS nulos cuando la clínica no tiene ubicación registrada', () => {
    // Forma real de una fila sin GPS todavía capturado: las dos columnas
    // nulas a la vez, no una sola. Sustituir por 0 pondría la clínica en
    // medio del golfo de Guinea sin que nadie lo note.
    const dto: ClinicaDto = { clinicaId: 2, name: 'Clínica Sin Sede', latitud: null, longitud: null }

    const clinica = clinicaDtoAClinica(dto)

    expect(clinica.lat).toBeNull()
    expect(clinica.lng).toBeNull()
  })

  it('conserva un solo nulo cuando falta nada más una coordenada', () => {
    // Caso asimétrico: una fila cargada a mano con latitud pero no longitud.
    // Si el adaptador colapsara "falta una" a "faltan las dos" perdería el
    // dato real que sí llegó.
    const dto: ClinicaDto = { clinicaId: 3, name: 'Clínica Parcial', latitud: 13.5, longitud: null }

    const clinica = clinicaDtoAClinica(dto)

    expect(clinica.lat).toBe(13.5)
    expect(clinica.lng).toBeNull()
  })
})

describe('formatearCoordenadas · con los nulos reales del backend', () => {
  it('formatea con 4 decimales cuando hay ambas coordenadas', () => {
    expect(formatearCoordenadas(13.7053, -89.2182)).toBe('13.7053, -89.2182')
  })

  it('devuelve null cuando faltan las dos coordenadas a la vez', () => {
    expect(formatearCoordenadas(null, null)).toBeNull()
  })

  it('devuelve null cuando solo falta la latitud', () => {
    // Una sola coordenada no ubica nada: no hay «casi una posición» que
    // mostrar, así que esto también debe negarse por completo.
    expect(formatearCoordenadas(null, -89.2182)).toBeNull()
  })

  it('devuelve null cuando solo falta la longitud', () => {
    expect(formatearCoordenadas(13.7053, null)).toBeNull()
  })

  it('no confunde 0 con nulo: el (0, 0) del golfo de Guinea es una coordenada válida', () => {
    // `0` es falsy en JS; una comparación con `||` en vez de `=== null`
    // trataría una clínica real en el ecuador/meridiano como si no tuviera
    // ubicación.
    expect(formatearCoordenadas(0, 0)).toBe('0.0000, 0.0000')
  })
})

describe('clínicas · 400 de validación', () => {
  it('deja pasar el campo que el backend señala en vez de una frase fija', async () => {
    // Esto es lo que `extraerMensajeDeError` produce con {"latitud":"La
    // latitud es obligatoria"}. Sustituirlo por «el nombre es obligatorio y
    // la ubicación necesita latitud y longitud» le quita al usuario el único
    // dato que le servía.
    apiFetch.mockRejectedValue(new ApiError(400, 'La latitud es obligatoria.'))

    const error = await errorDe(crearClinica(PAYLOAD))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect(error.message).toBe('La latitud es obligatoria.')
  })

  it('respeta también el 400 al editar', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(400, 'El nombre no puede tener más de 100 caracteres.'),
    )

    const error = await errorDe(actualizarClinica(7, PAYLOAD))

    expect(error.message).toBe('El nombre no puede tener más de 100 caracteres.')
  })

  it('no inventa un motivo cuando el backend no lo da', async () => {
    // 400 sin cuerpo aprovechable: api.ts ya dejó su genérico y el servicio no
    // debe adornarlo con un motivo que no sabe si es el verdadero.
    apiFetch.mockRejectedValue(new ApiError(400, 'Los datos enviados no son válidos.'))

    const error = await errorDe(crearClinica(PAYLOAD))

    expect(error.message).toBe('Los datos enviados no son válidos.')
  })
})

describe('clínicas · códigos que el backend no explica', () => {
  it('dice qué operación se negó y quién puede hacerla (403)', async () => {
    // Texto real del backend: habla de «modificar» aunque se esté eliminando,
    // y no dice quién sí puede. Aquí la sustitución sí gana precisión.
    apiFetch.mockRejectedValue(
      new ApiError(403, 'El usuario no tiene permiso para modificar esta clínica'),
    )

    const error = await errorDe(eliminarClinica(7))

    expect(error.message).toContain('eliminar esta clínica')
    expect(error.message).toContain('propietario')
  })

  it('nombra la acción real en el 403 de cada operación', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(403, 'El usuario no tiene permiso para modificar esta clínica'),
    )

    expect((await errorDe(crearClinica(PAYLOAD))).message).toContain('crear esta clínica')
    expect((await errorDe(actualizarClinica(7, PAYLOAD))).message).toContain('editar esta clínica')
  })

  it('explica el 404 con lo que probablemente pasó', async () => {
    apiFetch.mockRejectedValue(new ApiError(404, 'Recurso no encontrado'))

    const error = await errorDe(actualizarClinica(7, PAYLOAD))

    expect(error.message).toBe('Esta clínica ya no existe; puede que alguien la haya eliminado.')
  })
})

describe('clínicas · el 409 solo habla de eliminar cuando se está eliminando', () => {
  it('traduce la restricción de integridad al eliminar', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(409, 'could not execute statement; constraint [fk_citas_clinica]'),
    )

    const error = await errorDe(eliminarClinica(7))

    expect(error.message).toBe(
      'No se puede eliminar la clínica porque tiene información asociada.',
    )
  })

  it('no le cuenta al usuario que algo «no se puede eliminar» mientras crea o edita', async () => {
    // Un 409 al crear (p. ej. un nombre repetido) con el texto de borrado
    // describiría una operación que nadie pidió. Mejor el motivo del backend.
    apiFetch.mockRejectedValue(new ApiError(409, 'Ya existe una clínica con ese nombre.'))

    expect((await errorDe(crearClinica(PAYLOAD))).message).toBe(
      'Ya existe una clínica con ese nombre.',
    )
    expect((await errorDe(actualizarClinica(7, PAYLOAD))).message).toBe(
      'Ya existe una clínica con ese nombre.',
    )
  })
})

describe('clínicas · lo que no se traduce', () => {
  it('deja intacto un 500 y un fallo de red', async () => {
    apiFetch.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    expect((await errorDe(crearClinica(PAYLOAD))).message).toBe('Error del servidor (500).')

    apiFetch.mockRejectedValue(
      new ApiError(0, 'No se pudo contactar al servidor. ¿Está corriendo el backend?'),
    )
    expect((await errorDe(eliminarClinica(7))).message).toContain('No se pudo contactar')
  })

  it('envuelve lo que ni siquiera es un Error en algo que se puede mostrar', async () => {
    apiFetch.mockRejectedValue('vaya')

    const error = await errorDe(eliminarClinica(7))

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('No se pudo completar la operación.')
  })
})
