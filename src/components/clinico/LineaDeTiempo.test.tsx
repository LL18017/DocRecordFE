// Línea de tiempo del expediente (HU-15): una sola lista con dónde y quién
// (c1, c3), filtros que no vuelven al servidor (c2), sin diagnóstico cuando no
// viene (c4) y sin nada que escriba (c5).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { ConsultaDto } from '@/services/consultas'
import type { EventoDelExpedienteDto } from '@/services/expediente'
import type { PrescripcionDto } from '@/services/prescripciones'
import type { SignosVitalesDto } from '@/services/signosVitales'
import { LineaDeTiempo } from './LineaDeTiempo'

const obtenerLineaDeTiempo = vi.hoisted(() => vi.fn<(id: number) => Promise<EventoDelExpedienteDto[]>>())

vi.mock('@/services/expediente', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/expediente')>()
  return { ...real, obtenerLineaDeTiempo }
})

const SANTA_ANA = { clinicaId: 1, name: 'Clínica Santa Ana' }
const MEDICA = { personaId: 7, nombres: 'Lucía', apellidos: 'Mejía', rol: 'MEDICO' as const }
const ENFERMERA = { personaId: 9, nombres: 'María', apellidos: 'López', rol: 'ENFERMERA' as const }

function base(tipo: EventoDelExpedienteDto['tipo'], id: number, fecha: string) {
  return { tipo, id, fecha, estado: 'ACTIVA', clinica: null, consulta: null, signosVitales: null, receta: null }
}

const RECETA: EventoDelExpedienteDto = {
  ...base('RECETA', 3, '2026-03-12T10:00:00'),
  estado: 'ANULADA',
  clinica: SANTA_ANA,
  profesional: MEDICA,
  receta: {
    prescripcionId: 3,
    motivoAnulacion: 'Dosis mal escrita en la receta',
    medicamentos: [
      { id: 1, medicamento: 'Amoxil', dosis: '1 cápsula', viaAdministracion: 'Oral', frecuencia: 'Cada 8 horas', duracion: '7 días' },
    ],
  } as unknown as PrescripcionDto,
}

const CONSULTA: EventoDelExpedienteDto = {
  ...base('CONSULTA', 7, '2026-03-10T09:00:00'),
  estado: 'FINALIZADA',
  clinica: SANTA_ANA,
  profesional: MEDICA,
  consulta: {
    consultaId: 7,
    motivo: 'Tos persistente',
    diagnostico: 'Bronquitis aguda',
    indicaciones: null,
    motivoAnulacion: null,
  } as unknown as ConsultaDto,
}

const TOMA: EventoDelExpedienteDto = {
  ...base('SIGNOS_VITALES', 5, '2026-03-01T08:00:00'),
  profesional: ENFERMERA,
  signosVitales: {
    signosVitalesId: 5,
    presionSistolica: 120,
    presionDiastolica: 80,
    pulsoLpm: 72,
    temperaturaC: null,
    frecuenciaRespRpm: null,
    saturacionPct: null,
    pesoKg: null,
    estaturaCm: null,
    imc: null,
    clasificacionImc: null,
    observaciones: null,
    motivoAnulacion: null,
  } as unknown as SignosVitalesDto,
}

const EVENTOS = [RECETA, CONSULTA, TOMA]

function eventosEnPantalla() {
  return screen.queryAllByRole('article').map((a) => a.getAttribute('aria-label'))
}

describe('LineaDeTiempo', () => {
  beforeEach(() => {
    obtenerLineaDeTiempo.mockReset()
    obtenerLineaDeTiempo.mockResolvedValue(EVENTOS)
  })

  it('c1 y c3: una sola lista, cada evento con su sede y quién lo registró', async () => {
    render(<LineaDeTiempo pacienteId={42} />)

    expect(await screen.findAllByRole('article')).toHaveLength(3)
    expect(obtenerLineaDeTiempo).toHaveBeenCalledWith(42)
    expect(eventosEnPantalla()[0]).toMatch(/^Receta/)
    expect(eventosEnPantalla()[2]).toMatch(/^Signos vitales/)

    const [receta, consulta, toma] = screen.getAllByRole('article')
    expect(consulta).toHaveTextContent('Clínica Santa Ana · Lucía Mejía (Médico)')
    expect(consulta).toHaveTextContent('Tos persistente')
    expect(consulta).toHaveTextContent('Bronquitis aguda')
    expect(toma).toHaveTextContent('Sede no registrada · María López (Enfermería)')
    expect(toma).toHaveTextContent('120/80 mmHg')
    // Lo que no se tomó no aparece, ni como cero ni como guion.
    expect(toma).not.toHaveTextContent('Temperatura')
    expect(receta).toHaveTextContent('Amoxil')
    expect(within(receta).getByText('Anulada')).toBeInTheDocument()
    expect(receta).toHaveTextContent('Dosis mal escrita en la receta')
  })

  it('c2: filtrar por tipo y por fechas no vuelve al servidor', async () => {
    render(<LineaDeTiempo pacienteId={42} />)
    await screen.findAllByRole('article')

    const signos = screen.getByRole('button', { name: /signos vitales/i })
    await userEvent.click(signos)
    expect(signos).toHaveAttribute('aria-pressed', 'true')
    expect(eventosEnPantalla()).toHaveLength(1)
    expect(screen.getByText('1 de 3 eventos')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /limpiar filtros/i }))
    expect(eventosEnPantalla()).toHaveLength(3)

    await userEvent.type(screen.getByLabelText('Desde'), '2026-03-10')
    expect(eventosEnPantalla()).toHaveLength(2)
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-03-10')
    expect(eventosEnPantalla()).toEqual([expect.stringMatching(/^Consulta/)])

    expect(obtenerLineaDeTiempo).toHaveBeenCalledTimes(1)
  })

  it('c4: si el diagnóstico no viene (enfermería), no se pinta', async () => {
    obtenerLineaDeTiempo.mockResolvedValue([
      { ...CONSULTA, consulta: { ...CONSULTA.consulta!, diagnostico: null } },
    ])
    render(<LineaDeTiempo pacienteId={42} />)

    const consulta = await screen.findByRole('article')
    expect(consulta).toHaveTextContent('Tos persistente')
    expect(consulta).not.toHaveTextContent('Diagnóstico')
  })

  it('c5: los únicos botones son los de los filtros', async () => {
    render(<LineaDeTiempo pacienteId={42} />)
    await screen.findAllByRole('article')

    const nombres = screen.getAllByRole('button').map((b) => b.textContent?.trim())
    expect(nombres).toEqual(['Consulta', 'Signos vitales', 'Receta'])
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('sin eventos lo dice; si falla, muestra el motivo y deja reintentar', async () => {
    obtenerLineaDeTiempo.mockResolvedValueOnce([])
    const { unmount } = render(<LineaDeTiempo pacienteId={42} />)
    expect(await screen.findByText(/todavía no tiene consultas/i)).toBeInTheDocument()
    unmount()

    obtenerLineaDeTiempo.mockRejectedValueOnce(new ApiError(404, 'Paciente no encontrado'))
    render(<LineaDeTiempo pacienteId={42} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Paciente no encontrado')

    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    expect(await screen.findAllByRole('article')).toHaveLength(3)
  })
})
