// Línea de tiempo del expediente (HU-15): la ruta que se pide y el filtro que
// corre en el navegador (criterio 2).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filtrarLineaDeTiempo, obtenerLineaDeTiempo, type EventoDelExpedienteDto } from './expediente'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

function evento(tipo: EventoDelExpedienteDto['tipo'], id: number, fecha: string): EventoDelExpedienteDto {
  return {
    tipo,
    id,
    fecha,
    estado: 'ACTIVA',
    clinica: null,
    profesional: { personaId: 1, nombres: 'Ana', apellidos: 'Ruiz', rol: 'MEDICO' },
    consulta: null,
    signosVitales: null,
    receta: null,
  }
}

const EVENTOS = [
  evento('RECETA', 3, '2026-03-12T10:00:00'),
  evento('CONSULTA', 7, '2026-03-10T23:59:00'),
  evento('SIGNOS_VITALES', 5, '2026-03-10T08:00:00'),
  evento('SIGNOS_VITALES', 4, '2026-03-01T08:00:00'),
]

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue([])
})

describe('expediente · línea de tiempo', () => {
  it('pide la línea de tiempo del paciente', async () => {
    await obtenerLineaDeTiempo(42)
    expect(apiFetch).toHaveBeenCalledWith('/pacientes/42/linea-de-tiempo')
  })

  it('sin filtros devuelve todo, en el orden que vino', () => {
    expect(filtrarLineaDeTiempo(EVENTOS, {})).toEqual(EVENTOS)
    expect(filtrarLineaDeTiempo(EVENTOS, { tipos: [] })).toEqual(EVENTOS)
  })

  it('filtra por uno o varios tipos', () => {
    expect(filtrarLineaDeTiempo(EVENTOS, { tipos: ['SIGNOS_VITALES'] }).map((e) => e.id)).toEqual([5, 4])
    expect(filtrarLineaDeTiempo(EVENTOS, { tipos: ['RECETA', 'CONSULTA'] }).map((e) => e.id)).toEqual([3, 7])
  })

  it('el rango de fechas incluye el día completo de «hasta»', () => {
    const delDiez = filtrarLineaDeTiempo(EVENTOS, { desde: '2026-03-10', hasta: '2026-03-10' })
    expect(delDiez.map((e) => e.id)).toEqual([7, 5])
  })

  it('tipo y fechas se combinan', () => {
    const r = filtrarLineaDeTiempo(EVENTOS, { tipos: ['SIGNOS_VITALES'], desde: '2026-03-05' })
    expect(r.map((e) => e.id)).toEqual([5])
  })
})
