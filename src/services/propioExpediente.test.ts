// Regla del backend: el personal no puede escribir en su propio expediente
// clínico. Lo rechaza con 403 y un motivo que dice qué hacer («Pídale a otro
// miembro del personal que lo haga»), y ese motivo tiene que llegar a la
// persona tal cual. El frontend no sabe de quién es el expediente que se está
// mirando —la sesión no trae el `personaId`—, así que el backend es la única
// fuente de verdad y lo único que puede hacer aquí es no estorbar.
//
// Lo que estorbaba: alergias, antecedentes, condiciones hereditarias y hábitos
// cambiaban TODO 403 por «Solo un médico puede…». A un médico que intenta
// escribir en su propio expediente eso no le explica nada. Ahora solo cambian
// la negativa genérica por rol, y eso también se vigila abajo.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { crearAlergia, eliminarAlergia } from './alergias'
import {
  crearAntecedente,
  crearCondicionHereditaria,
  eliminarAntecedente,
  eliminarCondicionHereditaria,
} from './antecedentes'
import { aprobarSolicitud, rechazarSolicitud } from './anulaciones'
import { actualizarConsulta, anularConsulta, crearConsulta } from './consultas'
import { actualizarHabito, eliminarHabito, registrarHabito } from './habitos'
import { anularPrescripcion, crearPrescripcion } from './prescripciones'
import { anularToma, registrarToma } from './signosVitales'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

/** Textos exactos del backend para la regla. */
const PROPIO_EXPEDIENTE =
  'No puede registrar ni modificar información clínica de su propio expediente. Pídale a otro miembro del personal que lo haga.'
const PROPIA_ANULACION =
  'No puede aprobar ni rechazar la anulación de un documento de su propio expediente.'

/** Lo que manda Spring Security cuando el rol no alcanza. */
const NEGATIVA_POR_ROL = 'No tienes permisos para realizar esta acción'

async function errorDe(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa
  } catch (e) {
    return e as ApiError
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
}

// El contenido de los payloads no importa: `apiFetch` está simulado y lo que
// se prueba es qué pasa con su rechazo.
const escrituras: [string, () => Promise<unknown>][] = [
  ['registrar una consulta', () => crearConsulta({} as Parameters<typeof crearConsulta>[0])],
  ['editar una consulta', () => actualizarConsulta(1, {} as Parameters<typeof actualizarConsulta>[1])],
  ['anular una consulta', () => anularConsulta(1, 'Registrada por error')],
  [
    'emitir una receta',
    () =>
      crearPrescripcion({
        consultaId: 1,
        medicamentos: [
          {
            medicamentoId: 3,
            dosis: '1 tableta',
            viaAdministracion: 'Oral',
            frecuencia: 'Cada 8 horas',
            duracion: '5 días',
          },
        ],
      }),
  ],
  ['anular una receta', () => anularPrescripcion(1, 'Registrada por error')],
  ['registrar signos vitales', () => registrarToma({} as Parameters<typeof registrarToma>[0])],
  ['anular una toma de signos vitales', () => anularToma(1, 'Registrada por error')],
  ['registrar una alergia', () => crearAlergia({} as Parameters<typeof crearAlergia>[0])],
  ['eliminar una alergia', () => eliminarAlergia(1)],
  ['registrar un antecedente', () => crearAntecedente({} as Parameters<typeof crearAntecedente>[0])],
  ['eliminar un antecedente', () => eliminarAntecedente(1)],
  [
    'registrar una condición hereditaria',
    () => crearCondicionHereditaria({} as Parameters<typeof crearCondicionHereditaria>[0]),
  ],
  ['eliminar una condición hereditaria', () => eliminarCondicionHereditaria(1)],
  ['registrar un hábito', () => registrarHabito({} as Parameters<typeof registrarHabito>[0])],
  ['editar un hábito', () => actualizarHabito(1, {} as Parameters<typeof actualizarHabito>[1])],
  ['eliminar un hábito', () => eliminarHabito(1)],
]

beforeEach(() => {
  apiFetch.mockReset()
})

describe('el personal no puede escribir en su propio expediente', () => {
  it.each(escrituras)('al %s, el 403 llega con el motivo del backend', async (_, escribir) => {
    apiFetch.mockRejectedValue(new ApiError(403, PROPIO_EXPEDIENTE))

    const error = await errorDe(escribir())

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.message).toBe(PROPIO_EXPEDIENTE)
  })

  it.each([
    ['aprobar', () => aprobarSolicitud(7)],
    ['rechazar', () => rechazarSolicitud(7, 'No corresponde anularla')],
  ])('al %s la anulación de un documento propio, el 403 llega con el motivo del backend', async (_, resolver) => {
    apiFetch.mockRejectedValue(new ApiError(403, PROPIA_ANULACION))

    const error = await errorDe(resolver())

    expect(error.status).toBe(403)
    expect(error.message).toBe(PROPIA_ANULACION)
  })
})

describe('la negativa genérica por rol se sigue explicando', () => {
  it.each([
    [
      'alergias',
      () => crearAlergia({} as Parameters<typeof crearAlergia>[0]),
      'Solo un médico o una enfermera pueden registrar o eliminar alergias.',
    ],
    [
      'antecedentes',
      () => crearAntecedente({} as Parameters<typeof crearAntecedente>[0]),
      'Solo un médico puede registrar o eliminar el antecedente.',
    ],
    [
      'condiciones hereditarias',
      () => eliminarCondicionHereditaria(1),
      'Solo un médico puede registrar o eliminar la condición.',
    ],
    [
      'hábitos',
      () => registrarHabito({} as Parameters<typeof registrarHabito>[0]),
      'Registran y editan hábitos el médico y la enfermera; eliminarlos es solo del médico.',
    ],
  ])('en %s, la negativa de Spring Security se cambia por quién sí puede', async (_, escribir, esperado) => {
    apiFetch.mockRejectedValue(new ApiError(403, NEGATIVA_POR_ROL))

    const error = await errorDe(escribir())

    expect(error.status).toBe(403)
    expect(error.message).toBe(esperado)
  })

  it('también la que queda cuando el 403 llega sin motivo legible', async () => {
    // El texto por defecto de `lib/api.ts` para un 403 sin cuerpo útil.
    apiFetch.mockRejectedValue(new ApiError(403, 'No tiene permisos para realizar esta acción.'))

    const error = await errorDe(eliminarAlergia(1))

    expect(error.message).toBe('Solo un médico o una enfermera pueden registrar o eliminar alergias.')
  })
})
