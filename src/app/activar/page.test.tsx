// Pantalla donde se activa la cuenta con la invitación del correo (HU-02).
//
// La cuenta la abrió el administrador desde la ficha del médico; aquí la
// persona elige su contraseña. Las comprobaciones locales cortan antes de la
// petición, igual que al restablecer la contraseña.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import ActivarPage from './page'

const activarInvitacion = vi.fn<(token: string, password: string) => Promise<void>>()
const push = vi.fn()
let parametros: URLSearchParams

vi.mock('@/services/auth', () => ({
  activarInvitacion: (token: string, password: string) => activarInvitacion(token, password),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => parametros,
}))

const CLAVE = 'Docrecord2026!'

async function llenarYEnviar(password: string, confirmacion = password) {
  await userEvent.type(screen.getByLabelText(/tu contraseña/i), password)
  await userEvent.type(screen.getByLabelText(/repite la contraseña/i), confirmacion)
  await userEvent.click(screen.getByRole('button', { name: /activar mi cuenta/i }))
}

describe('Activar cuenta', () => {
  beforeEach(() => {
    activarInvitacion.mockReset()
    push.mockReset()
    parametros = new URLSearchParams('token=invitacion-valida')
  })

  it('manda el token de la invitación con la contraseña elegida y dice que la cuenta quedó activa', async () => {
    activarInvitacion.mockResolvedValue()

    render(<ActivarPage />)
    await llenarYEnviar(CLAVE)

    await waitFor(() => expect(activarInvitacion).toHaveBeenCalledWith('invitacion-valida', CLAVE))
    expect(await screen.findByRole('status')).toHaveTextContent(/quedó activa/i)
  })

  it('sin token explica qué hacer en vez de ofrecer un formulario que falla', async () => {
    parametros = new URLSearchParams('')

    render(<ActivarPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/administrador/i)
    expect(screen.queryByRole('button', { name: /activar mi cuenta/i })).not.toBeInTheDocument()
  })

  it('si las contraseñas no coinciden o no cumplen la regla no llama al servidor', async () => {
    render(<ActivarPage />)
    await llenarYEnviar(CLAVE, 'Otra-cosa-2026!')
    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/i)
    expect(activarInvitacion).not.toHaveBeenCalled()
  })

  it('una invitación vencida o usada muestra lo que responde el backend', async () => {
    activarInvitacion.mockRejectedValue(
      new ApiError(400, 'El enlace de invitación no es válido o ya venció. Pida al administrador uno nuevo.'),
    )

    render(<ActivarPage />)
    await llenarYEnviar(CLAVE)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es válido o ya venció/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
