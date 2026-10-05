// Guardas del servicio del catálogo de medicamentos (HU-23).
//
// Lo que más importa aquí es lo que NO se traduce: el 409 del duplicado llega
// con el medicamento que ya existe nombrado (criterio 2), y cambiarlo por un
// «ya existe» genérico dejaría al administrador buscándolo a mano.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  actualizarMedicamento,
  cambiarEstadoMedicamento,
  coincideConBusqueda,
  crearMedicamento,
  listarMedicamentos,
  type MedicamentoCatalogoDto,
} from './medicamentos'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

const PANADOL: MedicamentoCatalogoDto = {
  medicamentoId: 1,
  nombreGenerico: 'Acetaminofén',
  nombreComercial: 'Panadol',
  principioActivo: 'Paracetamol',
  presentacion: 'Tableta',
  concentracion: '500 mg',
  activo: true,
  descripcion: 'Acetaminofén 500 mg (Panadol), Tableta',
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
  apiFetch.mockResolvedValue(PANADOL)
})

describe('medicamentos · lo que viaja al backend', () => {
  it('sin filtro pide el catálogo activo, sin parámetros', async () => {
    apiFetch.mockResolvedValue([PANADOL])
    await listarMedicamentos()
    expect(apiFetch).toHaveBeenCalledWith('/medicamentos')
  })

  it('la búsqueda y los desactivados viajan como parámetros', async () => {
    apiFetch.mockResolvedValue([])
    await listarMedicamentos({ buscar: '  acetaminofén ', incluirInactivos: true })
    expect(apiFetch).toHaveBeenCalledWith(
      `/medicamentos?buscar=${encodeURIComponent('acetaminofén').replace(/%20/g, '+')}&incluirInactivos=true`,
    )
  })

  it('registra con los cinco campos ya recortados', async () => {
    await crearMedicamento({
      nombreGenerico: ' Acetaminofén ',
      nombreComercial: 'Panadol ',
      principioActivo: ' Paracetamol',
      presentacion: 'Tableta',
      concentracion: ' 500 mg ',
    })
    expect(apiFetch).toHaveBeenCalledWith('/medicamentos', {
      method: 'POST',
      body: {
        nombreGenerico: 'Acetaminofén',
        nombreComercial: 'Panadol',
        principioActivo: 'Paracetamol',
        presentacion: 'Tableta',
        concentracion: '500 mg',
      },
    })
  })

  it('edita con PUT y cambia el estado con PATCH, sin borrar nunca', async () => {
    await actualizarMedicamento(1, {
      nombreGenerico: 'Acetaminofén',
      nombreComercial: 'Panadol',
      principioActivo: 'Paracetamol',
      presentacion: 'Tableta',
      concentracion: '500 mg',
    })
    expect(apiFetch).toHaveBeenLastCalledWith('/medicamentos/1', expect.objectContaining({ method: 'PUT' }))

    await cambiarEstadoMedicamento(1, false)
    expect(apiFetch).toHaveBeenLastCalledWith('/medicamentos/1/estado', {
      method: 'PATCH',
      body: { activo: false },
    })
  })
})

describe('medicamentos · errores', () => {
  it('el 409 del duplicado pasa entero: nombra al medicamento que ya existe', async () => {
    const motivo =
      'Ya existe un medicamento con el mismo nombre comercial, presentacion y concentracion: Acetaminofén 500 mg (Panadol), Tableta (codigo 1).'
    apiFetch.mockRejectedValue(new ApiError(409, motivo))

    const error = await errorDe(
      crearMedicamento({
        nombreGenerico: 'Paracetamol',
        nombreComercial: 'PANADOL',
        principioActivo: 'Paracetamol',
        presentacion: 'tableta',
        concentracion: '500mg',
      }),
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect(error.message).toBe(motivo)
  })

  it('el 403 dice que el catálogo solo lo mantiene un administrador', async () => {
    apiFetch.mockRejectedValue(new ApiError(403, 'No tienes permisos para realizar esta acción'))
    const error = await errorDe(cambiarEstadoMedicamento(1, false))
    expect(error.message).toMatch(/solo lo mantiene un administrador/i)
  })
})

describe('medicamentos · coincideConBusqueda', () => {
  it('encuentra por cualquiera de los tres nombres, sin tildes ni mayúsculas', () => {
    expect(coincideConBusqueda(PANADOL, 'acetaminofen')).toBe(true)
    expect(coincideConBusqueda(PANADOL, 'PANADOL')).toBe(true)
    expect(coincideConBusqueda(PANADOL, 'paracet')).toBe(true)
    expect(coincideConBusqueda(PANADOL, 'ibuprofeno')).toBe(false)
    expect(coincideConBusqueda(PANADOL, '   ')).toBe(true)
  })
})
