// Pantalla de anulaciones del administrador (HU-21, HU-22 c3): resolver las
// solicitudes pedidas fuera de la ventana y fijar esa ventana.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type {
  CambioDeParametros,
  ParametroDeAnulacionDto,
  SolicitudDeAnulacionDto,
  TipoDocumentoAnulable,
} from '@/services/anulaciones'
import AnulacionesPage from './page'

const listarSolicitudes = vi.fn<(f?: object) => Promise<SolicitudDeAnulacionDto[]>>()
const aprobarSolicitud = vi.fn<(id: number) => Promise<SolicitudDeAnulacionDto>>()
const rechazarSolicitud = vi.fn<(id: number, motivo: string) => Promise<SolicitudDeAnulacionDto>>()
const obtenerParametros = vi.fn<() => Promise<ParametroDeAnulacionDto[]>>()
const actualizarParametros =
  vi.fn<(tipo: TipoDocumentoAnulable, c: CambioDeParametros) => Promise<ParametroDeAnulacionDto>>()

vi.mock('@/services/anulaciones', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/anulaciones')>()
  return {
    ...real,
    listarSolicitudes: (f?: object) => listarSolicitudes(f),
    aprobarSolicitud: (id: number) => aprobarSolicitud(id),
    rechazarSolicitud: (id: number, motivo: string) => rechazarSolicitud(id, motivo),
    obtenerParametros: () => obtenerParametros(),
    actualizarParametros: (tipo: TipoDocumentoAnulable, c: CambioDeParametros) => actualizarParametros(tipo, c),
  }
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
    solicitadaEn: '2026-11-03T11:00:00',
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

function parametro(tipo: TipoDocumentoAnulable): ParametroDeAnulacionDto {
  return {
    tipo,
    minutosAnulacionDirecta: 10,
    aprobacionesRequeridas: 2,
    diasMaximos: null,
    actualizadoEn: null,
    actualizadoPor: null,
  }
}

beforeEach(() => {
  for (const f of [listarSolicitudes, aprobarSolicitud, rechazarSolicitud, obtenerParametros, actualizarParametros]) {
    f.mockReset()
  }
  listarSolicitudes.mockResolvedValue([solicitud()])
  obtenerParametros.mockResolvedValue([parametro('CONSULTA'), parametro('RECETA')])
})

describe('anulaciones · solicitudes', () => {
  it('lista las pendientes con su avance y su motivo', async () => {
    render(<AnulacionesPage />)

    expect(await screen.findByText(/paciente equivocado/)).toBeInTheDocument()
    expect(screen.getByText(/0 de 2 aprobaciones/)).toBeInTheDocument()
    expect(listarSolicitudes).toHaveBeenCalledWith({ estado: 'PENDIENTE' })
  })

  it('con la primera de dos aprobaciones sigue en la lista; con la última sale', async () => {
    const user = userEvent.setup()
    aprobarSolicitud.mockResolvedValueOnce(
      solicitud({ aprobaciones: [{ administrador: 'Ana Admin', aprobadaEn: '2026-11-03T12:00:00' }], puedeResolver: false }),
    )
    render(<AnulacionesPage />)

    await user.click(await screen.findByRole('button', { name: 'Aprobar la anulación 4' }))
    expect(await screen.findByText(/1 de 2 aprobaciones/)).toBeInTheDocument()
    expect(screen.getByText(/falta otro administrador/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar la anulación 4' })).toBeNull()
  })

  it('al aprobarse del todo la solicitud sale de pendientes', async () => {
    const user = userEvent.setup()
    aprobarSolicitud.mockResolvedValue(solicitud({ estado: 'APROBADA' }))
    render(<AnulacionesPage />)

    await user.click(await screen.findByRole('button', { name: 'Aprobar la anulación 4' }))
    expect(await screen.findByText(/no hay anulaciones esperando aprobación/i)).toBeInTheDocument()
  })

  it('rechazar pide un motivo de al menos 10 caracteres y lo manda', async () => {
    const user = userEvent.setup()
    rechazarSolicitud.mockResolvedValue(solicitud({ estado: 'RECHAZADA', motivoRechazo: 'La consulta es correcta' }))
    render(<AnulacionesPage />)

    await user.click(await screen.findByRole('button', { name: 'Rechazar la anulación 4' }))
    const dialogo = within(await screen.findByRole('dialog'))
    await user.type(dialogo.getByLabelText(/motivo del rechazo/i), 'no')
    await user.click(dialogo.getByRole('button', { name: 'Rechazar' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent(/al menos 10 caracteres/)
    expect(rechazarSolicitud).not.toHaveBeenCalled()

    await user.type(dialogo.getByLabelText(/motivo del rechazo/i), ' procede, la consulta es correcta')
    await user.click(dialogo.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(rechazarSolicitud).toHaveBeenCalledWith(4, 'no procede, la consulta es correcta'))
    expect(await screen.findByText(/no hay anulaciones esperando aprobación/i)).toBeInTheDocument()
  })

  it('el mensaje del servidor llega entero cuando no se puede aprobar', async () => {
    const user = userEvent.setup()
    aprobarSolicitud.mockRejectedValue(new ApiError(403, 'No puede resolver una anulación que pidió usted'))
    render(<AnulacionesPage />)

    await user.click(await screen.findByRole('button', { name: 'Aprobar la anulación 4' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No puede resolver una anulación que pidió usted')
  })

  it('el historial pide todas, sin filtro de estado', async () => {
    const user = userEvent.setup()
    render(<AnulacionesPage />)
    await screen.findByText(/paciente equivocado/)

    listarSolicitudes.mockResolvedValue([
      solicitud({ estado: 'RECHAZADA', resueltaPor: 'Ana Admin', motivoRechazo: 'La consulta es correcta', puedeResolver: false }),
    ])
    await user.click(screen.getByRole('tab', { name: 'Historial' }))

    expect(await screen.findByText(/rechazada por ana admin/i)).toBeInTheDocument()
    expect(listarSolicitudes).toHaveBeenLastCalledWith({})
  })
})

describe('anulaciones · reglas', () => {
  it('guarda los minutos, las aprobaciones y el tope; vacío es sin tope', async () => {
    const user = userEvent.setup()
    actualizarParametros.mockResolvedValue({ ...parametro('RECETA'), minutosAnulacionDirecta: 30 })
    render(<AnulacionesPage />)

    const recetas = within(await screen.findByRole('form', { name: 'Reglas de receta' }))
    const minutos = recetas.getByLabelText(/minutos de anulación directa/i)
    await user.clear(minutos)
    await user.type(minutos, '30')
    await user.click(recetas.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(actualizarParametros).toHaveBeenCalledWith('RECETA', {
        minutosAnulacionDirecta: 30,
        aprobacionesRequeridas: 2,
        diasMaximos: null,
      }),
    )
    expect(await recetas.findByRole('status')).toHaveTextContent('Reglas guardadas.')
  })
})
