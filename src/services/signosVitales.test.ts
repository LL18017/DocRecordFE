// Guardas del servicio de signos vitales: la anulación (HU-16, criterio 4).
//
// Lo que se vigila: que anular sea un PATCH a `/anulacion` con el motivo y NUNCA
// un DELETE (una toma no se borra), y que el error del servidor llegue entero.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { anularToma, estaAnulada } from './signosVitales'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

beforeEach(() => {
  apiFetch.mockReset()
})

describe('anularToma', () => {
  it('anula con PATCH a /anulacion y manda solo el motivo', async () => {
    apiFetch.mockResolvedValue({ signosVitalesId: 11, estado: 'ANULADA' })

    const anulada = await anularToma(11, 'Paciente equivocado')

    expect(apiFetch).toHaveBeenCalledWith('/signos-vitales/11/anulacion', {
      method: 'PATCH',
      body: { motivo: 'Paciente equivocado' },
    })
    expect(anulada.estado).toBe('ANULADA')
  })

  it('el rechazo del servidor (403, 409) llega tal cual, con su mensaje', async () => {
    apiFetch.mockRejectedValue(new ApiError(409, 'La toma ya estaba anulada'))

    await expect(anularToma(11, 'Otra vez')).rejects.toMatchObject({
      status: 409,
      message: 'La toma ya estaba anulada',
    })
  })
})

describe('estaAnulada', () => {
  it('distingue una toma anulada de una activa', () => {
    expect(estaAnulada({ estado: 'ANULADA' })).toBe(true)
    expect(estaAnulada({ estado: 'ACTIVA' })).toBe(false)
  })
})
