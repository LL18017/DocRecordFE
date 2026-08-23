// Guardas del servicio de prescripciones.
//
// La regla que más se protege aquí: UNA RECETA SIN MEDICAMENTOS NO ES UNA
// RECETA. La comprobación vive en el servicio y no solo en el formulario
// porque es del dominio; estas pruebas se ponen en rojo si alguien la mueve o
// la relaja, incluido el caso tramposo de «tres líneas en blanco», que a
// simple vista parecen tres medicamentos.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  crearPrescripcion,
  eliminarPrescripcion,
  formatearFechaEmision,
  listarPrescripcionesDeConsulta,
  listarPrescripcionesDePaciente,
  MENSAJE_RECETA_VACIA,
  nombreDeMedicoQueReceta,
  normalizarMedicamentos,
  obtenerPrescripcion,
  textoOpcional,
  type PrescripcionDto,
} from './prescripciones'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

function receta(cambios: Partial<PrescripcionDto> = {}): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra' },
    medicamentos: [
      { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', frecuencia: 'cada 8 h', duracion: '7 días' },
    ],
    ...cambios,
  }
}

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
  apiFetch.mockResolvedValue(receta())
})

describe('prescripciones · una receta sin medicamentos no es una receta', () => {
  it('rechaza la lista vacía sin llegar a llamar al backend', async () => {
    const error = await errorDe(crearPrescripcion({ consultaId: 7, medicamentos: [] }))

    expect(error.message).toBe(MENSAJE_RECETA_VACIA)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('tampoco cuela una lista de líneas en blanco', async () => {
    const error = await errorDe(
      crearPrescripcion({
        consultaId: 7,
        medicamentos: [
          { medicamento: '   ' },
          { medicamento: '', dosis: '500 mg' },
        ],
      }),
    )

    expect(error.message).toBe(MENSAJE_RECETA_VACIA)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('prescripciones · lo que viaja al backend', () => {
  it('manda exactamente el cuerpo del contrato', async () => {
    await crearPrescripcion({
      consultaId: 7,
      medicamentos: [
        { medicamento: 'Amoxicilina', dosis: '500 mg', frecuencia: 'cada 8 h', duracion: '7 días' },
      ],
    })

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones', {
      method: 'POST',
      body: {
        consultaId: 7,
        medicamentos: [
          {
            medicamento: 'Amoxicilina',
            dosis: '500 mg',
            frecuencia: 'cada 8 h',
            duracion: '7 días',
          },
        ],
      },
    })
  })

  it('omite los opcionales vacíos en vez de mandar cadenas vacías', async () => {
    // Guardar `dosis: ''` no es lo mismo que no guardarla: la primera se pinta
    // como un hueco raro en la receta, la segunda vuelve como null y la
    // interfaz ya sabe mostrarla como «—».
    await crearPrescripcion({
      consultaId: 7,
      medicamentos: [{ medicamento: '  Ibuprofeno ', dosis: '  ', frecuencia: 'cada 12 h' }],
    })

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones', {
      method: 'POST',
      body: {
        consultaId: 7,
        medicamentos: [{ medicamento: 'Ibuprofeno', frecuencia: 'cada 12 h' }],
      },
    })
  })

  it('descarta las líneas sin medicamento y conserva las útiles', () => {
    expect(
      normalizarMedicamentos([
        { medicamento: 'Amoxicilina', dosis: '500 mg' },
        { medicamento: '  ' },
        { medicamento: 'Ibuprofeno' },
      ]),
    ).toEqual([{ medicamento: 'Amoxicilina', dosis: '500 mg' }, { medicamento: 'Ibuprofeno' }])
  })

  it('consulta las recetas por consulta y por paciente con su parámetro', async () => {
    apiFetch.mockResolvedValue([])

    await listarPrescripcionesDeConsulta(7)
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones?consultaId=7')

    await listarPrescripcionesDePaciente(42)
    expect(apiFetch).toHaveBeenLastCalledWith('/prescripciones?pacienteId=42')
  })

  it('anula con DELETE sobre el id', async () => {
    apiFetch.mockResolvedValue(undefined)

    await eliminarPrescripcion(11)

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones/11', { method: 'DELETE' })
  })
})

describe('prescripciones · campos opcionales al mostrarlos', () => {
  it('pinta un guion donde el backend mandó null', () => {
    // Sin esto la receta que alguien lleva a la farmacia diría «null».
    expect(textoOpcional(null)).toBe('—')
    expect(textoOpcional('   ')).toBe('—')
    expect(textoOpcional('500 mg')).toBe('500 mg')
  })

  it('arma el nombre del médico que firma y la fecha de emisión', () => {
    expect(nombreDeMedicoQueReceta(receta())).toBe('Juan Guerra')
    expect(formatearFechaEmision(receta({ fecha: '2026-08-23' }))).toContain('23')
  })
})

describe('prescripciones · traducción de errores', () => {
  it('al emitir, el 404 habla de la consulta y no de la receta', async () => {
    // La receta todavía no existe: decir «esta receta ya no existe» sería
    // falso y mandaría a buscar algo que nunca se creó.
    apiFetch.mockRejectedValue(new ApiError(404, 'Recurso no encontrado'))

    const error = await errorDe(
      crearPrescripcion({ consultaId: 7, medicamentos: [{ medicamento: 'Amoxicilina' }] }),
    )

    expect(error.message).toContain('consulta')
    expect(error.message).toContain('no se emitió')
    expect(error.message).not.toContain('Esta receta ya no existe')
  })

  it('al anular o abrir, el 404 sí habla de la receta', async () => {
    apiFetch.mockRejectedValue(new ApiError(404, 'Recurso no encontrado'))

    expect((await errorDe(obtenerPrescripcion(11))).message).toBe(
      'Esta receta ya no existe; puede que alguien la haya anulado.',
    )
    expect((await errorDe(eliminarPrescripcion(11))).message).toBe(
      'Esta receta ya no existe; puede que alguien la haya anulado.',
    )
  })

  it('deja pasar el motivo concreto del backend en los demás códigos', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(403, 'Solo el médico que atendió la consulta puede recetar'),
    )

    const error = await errorDe(
      crearPrescripcion({ consultaId: 7, medicamentos: [{ medicamento: 'Amoxicilina' }] }),
    )

    expect(error.message).toBe('Solo el médico que atendió la consulta puede recetar')
  })
})
