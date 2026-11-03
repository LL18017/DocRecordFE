// Guardas del servicio de anulaciones (HU-21, HU-22 c3).
//
// Lo que importa es lo que viaja (filtros, motivo recortado) y que la pantalla
// pueda distinguir «quedó anulado» de «quedó una solicitud», que es lo que
// decide si el documento sigue vigente.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  actualizarParametros,
  aprobarSolicitud,
  avanceDeAprobaciones,
  avisoDeSolicitudEnviada,
  esSolicitudDeAnulacion,
  listarSolicitudes,
  rechazarSolicitud,
  type SolicitudDeAnulacionDto,
} from './anulaciones'
import { anularConsulta } from './consultas'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

function solicitud(cambios: Partial<SolicitudDeAnulacionDto> = {}): SolicitudDeAnulacionDto {
  return {
    solicitudId: 4,
    tipo: 'CONSULTA',
    consultaId: 7,
    prescripcionId: null,
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    motivo: 'Consulta registrada al paciente equivocado',
    solicitadaPor: 'Juan Guerra',
    solicitadaEn: '2026-11-03T10:00:00',
    aprobacionesRequeridas: 2,
    aprobaciones: [],
    estado: 'PENDIENTE',
    resueltaEn: null,
    resueltaPor: null,
    motivoRechazo: null,
    puedeResolver: true,
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
  apiFetch.mockResolvedValue(solicitud())
})

describe('anulaciones · lo que viaja al backend', () => {
  it('sin filtros lista todo; con filtros, como parámetros', async () => {
    apiFetch.mockResolvedValue([])
    await listarSolicitudes()
    expect(apiFetch).toHaveBeenLastCalledWith('/anulaciones')

    await listarSolicitudes({ estado: 'PENDIENTE', consultaId: 7 })
    expect(apiFetch).toHaveBeenLastCalledWith('/anulaciones?estado=PENDIENTE&consultaId=7')
  })

  it('aprobar no lleva cuerpo; rechazar lleva el motivo recortado', async () => {
    await aprobarSolicitud(4)
    expect(apiFetch).toHaveBeenLastCalledWith('/anulaciones/4/aprobar', { method: 'POST' })

    await rechazarSolicitud(4, '  La consulta es correcta  ')
    expect(apiFetch).toHaveBeenLastCalledWith('/anulaciones/4/rechazar', {
      method: 'POST',
      body: { motivo: 'La consulta es correcta' },
    })
  })

  it('los parámetros van por tipo, con el tope nulo cuando no hay', async () => {
    await actualizarParametros('RECETA', { minutosAnulacionDirecta: 0, aprobacionesRequeridas: 3, diasMaximos: null })
    expect(apiFetch).toHaveBeenLastCalledWith('/anulaciones/parametros/RECETA', {
      method: 'PUT',
      body: { minutosAnulacionDirecta: 0, aprobacionesRequeridas: 3, diasMaximos: null },
    })
  })

  it('HU-21: anular una consulta manda el motivo recortado a /consultas/{id}/anular', async () => {
    await anularConsulta(7, '  Paciente equivocado  ')
    expect(apiFetch).toHaveBeenLastCalledWith('/consultas/7/anular', {
      method: 'POST',
      body: { motivo: 'Paciente equivocado' },
    })
  })
})

describe('anulaciones · anulada o solicitada', () => {
  it('distingue la solicitud del documento ya anulado', () => {
    expect(esSolicitudDeAnulacion(solicitud())).toBe(true)
    expect(esSolicitudDeAnulacion({ consultaId: 7, estado: 'ANULADA' })).toBe(false)
    expect(esSolicitudDeAnulacion(null)).toBe(false)
  })

  it('el aviso dice que el documento sigue vigente y cuántos aprueban', () => {
    expect(avisoDeSolicitudEnviada(solicitud())).toMatch(/aprobar 2 administradores.*sigue vigente/)
    expect(avisoDeSolicitudEnviada(solicitud({ tipo: 'RECETA', aprobacionesRequeridas: 1 }))).toMatch(
      /^La receta.*aprobar 1 administrador\./,
    )
  })

  it('cuenta el avance de aprobaciones', () => {
    expect(avanceDeAprobaciones(solicitud())).toBe('0 de 2 aprobaciones')
    expect(
      avanceDeAprobaciones(
        solicitud({ aprobacionesRequeridas: 1, aprobaciones: [{ administrador: 'A', aprobadaEn: 'x' }] }),
      ),
    ).toBe('1 de 1 aprobación')
  })
})

describe('anulaciones · errores', () => {
  it('el 403 y el 409 pasan con el mensaje del servidor', async () => {
    apiFetch.mockRejectedValue(new ApiError(403, 'No puede resolver una anulación que pidió usted'))
    expect((await errorDe(aprobarSolicitud(4))).message).toBe('No puede resolver una anulación que pidió usted')

    apiFetch.mockRejectedValue(new ApiError(409, 'Ya aprobó esta solicitud'))
    expect((await errorDe(aprobarSolicitud(4))).message).toBe('Ya aprobó esta solicitud')
  })

  it('el 404 dice que la solicitud ya no existe', async () => {
    apiFetch.mockRejectedValue(new ApiError(404, 'Not Found'))
    expect((await errorDe(rechazarSolicitud(4, 'Motivo suficiente'))).message).toBe(
      'La solicitud de anulación ya no existe.',
    )
  })
})
