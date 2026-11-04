// Anular una consulta desde su detalle (HU-21).
//
// Las dos salidas del servidor se ven distinto a propósito: dentro de la
// ventana la consulta queda ANULADA y se marca; fuera de ella queda una
// solicitud y la consulta sigue vigente. Confundirlas dejaría al médico
// creyendo que anuló algo que sigue en uso.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@/types'
import type { ConsultaDto } from '@/services/consultas'
import type { SolicitudDeAnulacionDto } from '@/services/anulaciones'
import type { PrescripcionDto } from '@/services/prescripciones'
import { DetalleDeConsulta } from './DetalleDeConsulta'

const anularConsulta = vi.fn<(id: number, motivo: string) => Promise<ConsultaDto | SolicitudDeAnulacionDto>>()
const listarSolicitudes = vi.fn<() => Promise<SolicitudDeAnulacionDto[]>>()
const listarPrescripcionesDeConsulta = vi.fn<(id: number) => Promise<PrescripcionDto[]>>()

vi.mock('@/services/consultas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return { ...real, anularConsulta: (id: number, motivo: string) => anularConsulta(id, motivo) }
})

vi.mock('@/services/anulaciones', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/anulaciones')>()
  return { ...real, listarSolicitudes: () => listarSolicitudes() }
})

vi.mock('@/services/prescripciones', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/prescripciones')>()
  return { ...real, listarPrescripcionesDeConsulta: (id: number) => listarPrescripcionesDeConsulta(id) }
})

const SESION: { user: User | null } = { user: null }
vi.mock('@/context/AppContext', () => ({ useAppContext: () => SESION }))

const MEDICO: User = { name: 'juan@docrecord.sv', email: 'juan@docrecord.sv', roles: ['medico'] }
const ENFERMERA: User = { name: 'eva@docrecord.sv', email: 'eva@docrecord.sv', roles: ['enfermera'] }

function consulta(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
  return {
    consultaId: 7,
    fecha: '2026-11-03T10:00:00',
    motivo: 'Dolor de garganta',
    diagnostico: 'Faringitis aguda',
    exploracionFisica: null,
    indicaciones: null,
    estado: 'FINALIZADA',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: null,
    motivoAnulacion: null,
    anuladaEn: null,
    anuladaPor: null,
    ...cambios,
  }
}

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
    puedeResolver: false,
    ...cambios,
  }
}

const MOTIVO = 'Consulta registrada al paciente equivocado'

beforeEach(() => {
  SESION.user = MEDICO
  anularConsulta.mockReset()
  listarSolicitudes.mockReset()
  listarPrescripcionesDeConsulta.mockReset()
  listarSolicitudes.mockResolvedValue([])
  listarPrescripcionesDeConsulta.mockResolvedValue([])
})

async function pedirAnulacion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Anular consulta' }))
  await user.type(screen.getByLabelText(/motivo de la anulación/i), MOTIVO)
  await user.click(screen.getAllByRole('button', { name: 'Anular consulta' }).at(-1)!)
}

describe('detalle de consulta · anular (HU-21)', () => {
  it('dentro de la ventana la consulta queda marcada como anulada y deja de ofrecer recetas', async () => {
    const anulada = consulta({
      estado: 'ANULADA',
      motivoAnulacion: MOTIVO,
      anuladaEn: '2026-11-03T10:05:00',
      anuladaPor: 'Juan Guerra',
    })
    anularConsulta.mockResolvedValue(anulada)
    const onConsultaCambio = vi.fn()
    const user = userEvent.setup()
    render(<DetalleDeConsulta consulta={consulta()} onConsultaCambio={onConsultaCambio} />)

    expect(await screen.findByRole('button', { name: 'Emitir receta' })).toBeInTheDocument()
    await pedirAnulacion(user)

    await waitFor(() => expect(anularConsulta).toHaveBeenCalledWith(7, MOTIVO))
    expect(await screen.findByText('Consulta anulada')).toBeInTheDocument()
    expect(screen.getByText(/paciente equivocado/)).toBeInTheDocument()
    expect(onConsultaCambio).toHaveBeenCalledWith(anulada)
    expect(screen.queryByRole('button', { name: 'Emitir receta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anular consulta' })).toBeNull()
  })

  it('fuera de la ventana avisa que quedó una solicitud y la consulta sigue vigente', async () => {
    anularConsulta.mockResolvedValue(solicitud())
    const onConsultaCambio = vi.fn()
    const user = userEvent.setup()
    render(<DetalleDeConsulta consulta={consulta()} onConsultaCambio={onConsultaCambio} />)

    await pedirAnulacion(user)

    expect(await screen.findByRole('status')).toHaveTextContent(/aprobar 2 administradores.*sigue vigente/)
    expect(onConsultaCambio).not.toHaveBeenCalled()
    expect(screen.queryByText('Consulta anulada')).toBeNull()

    // Al cerrar el aviso se vuelve a pedir la lista, que ahora trae la pendiente.
    listarSolicitudes.mockResolvedValue([solicitud()])
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(await screen.findByText(/anulación pendiente de aprobación/i)).toBeInTheDocument()
    expect(screen.getByText(/0 de 2 aprobaciones/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular consulta' })).toBeNull()
  })

  it('no envía un motivo de menos de 10 caracteres', async () => {
    const user = userEvent.setup()
    render(<DetalleDeConsulta consulta={consulta()} />)

    await user.click(await screen.findByRole('button', { name: 'Anular consulta' }))
    await user.type(screen.getByLabelText(/motivo de la anulación/i), 'error')
    await user.click(screen.getAllByRole('button', { name: 'Anular consulta' }).at(-1)!)

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 10 caracteres/)
    expect(anularConsulta).not.toHaveBeenCalled()
  })

  it('una consulta ya anulada muestra su rastro y no ofrece anular ni recetar', async () => {
    render(
      <DetalleDeConsulta
        consulta={consulta({ estado: 'ANULADA', motivoAnulacion: MOTIVO, anuladaPor: 'Juan Guerra' })}
      />,
    )

    expect(await screen.findByText('Consulta anulada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular consulta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Emitir receta' })).toBeNull()
  })

  it('a enfermería no le ofrece anular ni le pide las solicitudes', async () => {
    SESION.user = ENFERMERA
    render(<DetalleDeConsulta consulta={consulta()} />)

    await screen.findByText(/no se ha emitido ninguna receta/i)
    expect(screen.queryByRole('button', { name: 'Anular consulta' })).toBeNull()
    expect(listarSolicitudes).not.toHaveBeenCalled()
  })
})
