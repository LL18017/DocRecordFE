// Acceso del paciente a su portal (HU-34), desde el expediente: el personal
// ve cómo está la cuenta y, si hace falta, le manda la invitación.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { AccesoAlPortalDto } from '@/services/portal'
import { AccesoAlPortal } from './AccesoAlPortal'

const obtenerAccesoAlPortal = vi.fn<(id: number) => Promise<AccesoAlPortalDto>>()
const darAccesoAlPortal = vi.fn<(id: number, email?: string) => Promise<AccesoAlPortalDto>>()

vi.mock('@/services/portal', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/portal')>()
  return {
    ...real,
    obtenerAccesoAlPortal: (id: number) => obtenerAccesoAlPortal(id),
    darAccesoAlPortal: (id: number, email?: string) => darAccesoAlPortal(id, email),
  }
})

function acceso(cambios: Partial<AccesoAlPortalDto> = {}): AccesoAlPortalDto {
  return {
    pacienteId: 42,
    correoDeContacto: 'ana.perez@correo.sv',
    cuenta: null,
    invitacionEnviada: false,
    correoEnviado: false,
    ...cambios,
  }
}

const CUENTA = { userId: 9, email: 'ana.perez@correo.sv', estado: 'ACTIVA' as const, conRolPaciente: true }

beforeEach(() => {
  obtenerAccesoAlPortal.mockReset()
  darAccesoAlPortal.mockReset()
})

async function montar(estado: AccesoAlPortalDto, onCambio?: (a: AccesoAlPortalDto) => void) {
  obtenerAccesoAlPortal.mockResolvedValue(estado)
  const user = userEvent.setup()
  render(<AccesoAlPortal pacienteId={42} nombrePaciente="Ana Pérez" onCambio={onCambio} />)
  await waitFor(() => expect(obtenerAccesoAlPortal).toHaveBeenCalledWith(42))
  return user
}

describe('AccesoAlPortal · sin cuenta', () => {
  it('propone el correo de contacto y manda la invitación', async () => {
    const onCambio = vi.fn()
    const user = await montar(acceso(), onCambio)
    expect(await screen.findByText('Sin acceso al portal')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Dar acceso al portal' }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByLabelText(/correo para iniciar sesión/i)).toHaveValue('ana.perez@correo.sv')
    // El diálogo dice qué es el portal: solo lectura.
    expect(dialogo.getByText(/no puede modificar nada/i)).toBeVisible()

    const nuevo = acceso({
      cuenta: { ...CUENTA, estado: 'SIN_ACTIVAR' },
      invitacionEnviada: true,
      correoEnviado: true,
    })
    darAccesoAlPortal.mockResolvedValue(nuevo)
    await user.click(dialogo.getByRole('button', { name: 'Dar acceso al portal' }))

    await waitFor(() => expect(darAccesoAlPortal).toHaveBeenCalledWith(42, 'ana.perez@correo.sv'))
    expect(await screen.findByRole('status')).toHaveTextContent(/se envió la invitación a ana\.perez@correo\.sv/i)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Invitación enviada')).toBeVisible()
    expect(onCambio).toHaveBeenCalledWith(nuevo)
  })

  it('sin correo de contacto no deja enviar hasta escribir uno', async () => {
    const user = await montar(acceso({ correoDeContacto: null }))
    await user.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
    const dialogo = within(screen.getByRole('dialog'))
    const enviar = dialogo.getByRole('button', { name: 'Dar acceso al portal' })
    expect(enviar).toBeDisabled()

    await user.type(dialogo.getByLabelText(/correo para iniciar sesión/i), 'ana@correo.sv')
    expect(enviar).toBeEnabled()
  })

  it('muestra el motivo del servidor si el correo ya es de otra cuenta', async () => {
    const user = await montar(acceso())
    darAccesoAlPortal.mockRejectedValue(new ApiError(409, 'Este correo ya está registrado'))
    await user.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dar acceso al portal' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Este correo ya está registrado',
    )
  })

  it('avisa si la cuenta quedó lista pero el correo no salió', async () => {
    const user = await montar(acceso())
    darAccesoAlPortal.mockResolvedValue(
      acceso({ cuenta: { ...CUENTA, estado: 'SIN_ACTIVAR' }, invitacionEnviada: true, correoEnviado: false }),
    )
    await user.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dar acceso al portal' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/no salió/i)
  })
})

describe('AccesoAlPortal · con cuenta', () => {
  it('sin activar ofrece reenviar la invitación, sin pedir el correo', async () => {
    const user = await montar(acceso({ cuenta: { ...CUENTA, estado: 'SIN_ACTIVAR' } }))
    await user.click(await screen.findByRole('button', { name: 'Reenviar invitación' }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.queryByLabelText(/correo/i)).not.toBeInTheDocument()

    darAccesoAlPortal.mockResolvedValue(
      acceso({ cuenta: { ...CUENTA, estado: 'SIN_ACTIVAR' }, invitacionEnviada: true, correoEnviado: true }),
    )
    await user.click(dialogo.getByRole('button', { name: 'Reenviar invitación' }))
    await waitFor(() => expect(darAccesoAlPortal).toHaveBeenCalledWith(42, undefined))
  })

  it('una cuenta del personal sin el rol recibe el acceso', async () => {
    const user = await montar(acceso({ cuenta: { ...CUENTA, conRolPaciente: false } }))
    await user.click(await screen.findByRole('button', { name: 'Dar acceso al portal' }))
    darAccesoAlPortal.mockResolvedValue(acceso({ cuenta: CUENTA }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dar acceso al portal' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/ya puede ver su expediente/i)
    expect(screen.getByText('Con acceso al portal')).toBeVisible()
  })

  it('con acceso no ofrece nada que hacer', async () => {
    await montar(acceso({ cuenta: CUENTA }))
    expect(await screen.findByText('Con acceso al portal')).toBeVisible()
    expect(screen.getByText(/entra con ana\.perez@correo\.sv/i)).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('con la cuenta desactivada manda al administrador en vez de invitar', async () => {
    await montar(acceso({ cuenta: { ...CUENTA, estado: 'DESACTIVADA' } }))
    expect(await screen.findByText('Cuenta desactivada')).toBeVisible()
    expect(screen.getByText(/un administrador puede reactivarla/i)).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

it('si no se puede consultar el acceso lo dice', async () => {
  obtenerAccesoAlPortal.mockRejectedValue(new ApiError(404, 'Paciente no encontrado'))
  render(<AccesoAlPortal pacienteId={42} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Paciente no encontrado')
})
