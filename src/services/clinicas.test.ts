// Guardas de la traducción de errores del servicio de clínicas.
//
// Lo que se protege aquí no es que salga «un mensaje», sino cuál: `lib/api.ts`
// ya entrega el motivo concreto del backend (incluidos los campos de una
// validación de Spring), así que cada sustitución de este servicio tiene que
// mejorar ese texto. La prueba que importa es la que se pone en rojo si
// alguien vuelve a taparlo con una frase fija.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { actualizarClinica, crearClinica, eliminarClinica } from './clinicas'

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
