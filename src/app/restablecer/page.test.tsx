// Guardas de la pantalla donde se define la contraseña nueva.
//
// El token es de un SOLO uso y vence en una hora, así que cada envío que salga
// mal por una errata quema el enlace. Por eso las comprobaciones locales
// —coinciden, largo mínimo— tienen que cortar antes de la petición, y hay
// pruebas de que efectivamente cortan.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import RestablecerPage from './page'

const restablecerContrasena =
  vi.fn<(token: string, password: string) => Promise<{ mensaje: string }>>()
const push = vi.fn()
let parametros: URLSearchParams

vi.mock('@/services/auth', () => ({
  restablecerContrasena: (token: string, password: string) =>
    restablecerContrasena(token, password),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => parametros,
}))

const CLAVE = 'Docrecord2026!'

async function llenarYEnviar(password: string, confirmacion = password) {
  await userEvent.type(screen.getByLabelText(/contraseña nueva/i), password)
  await userEvent.type(screen.getByLabelText(/repite la contraseña/i), confirmacion)
  await userEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))
}

describe('Restablecer contraseña', () => {
  beforeEach(() => {
    restablecerContrasena.mockReset()
    push.mockReset()
    parametros = new URLSearchParams('token=un-token-valido')
  })

  it('manda el token del enlace junto a la contraseña nueva', async () => {
    restablecerContrasena.mockResolvedValue({ mensaje: 'Contraseña actualizada' })

    render(<RestablecerPage />)
    await llenarYEnviar(CLAVE)

    await waitFor(() =>
      expect(restablecerContrasena).toHaveBeenCalledWith('un-token-valido', CLAVE),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/quedó cambiada/i)
  })

  it('sin token en la URL explica el problema en vez de ofrecer un formulario que falla', async () => {
    // Llegar aquí sin token es lo normal: basta con abrir /restablecer a mano.
    parametros = new URLSearchParams('')

    render(<RestablecerPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/enlace está incompleto/i)
    expect(screen.queryByRole('button', { name: /cambiar contraseña/i })).not.toBeInTheDocument()
  })

  it('si las dos contraseñas no coinciden no gasta el enlace', async () => {
    render(<RestablecerPage />)
    await llenarYEnviar(CLAVE, 'Otra-cosa-2026!')

    expect(await screen.findByRole('alert')).toHaveTextContent(/no coinciden/i)
    expect(restablecerContrasena).not.toHaveBeenCalled()
  })

  it('una contraseña demasiado corta tampoco gasta el enlace', async () => {
    render(<RestablecerPage />)
    await llenarYEnviar('corta')

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 8 caracteres/i)
    expect(restablecerContrasena).not.toHaveBeenCalled()
  })

  it('si el enlace ya venció o se usó, muestra lo que responde el backend', async () => {
    // Los tres casos —inexistente, vencido y usado— comparten mensaje a
    // propósito: distinguirlos diría si ese token llegó a existir alguna vez.
    restablecerContrasena.mockRejectedValue(
      new ApiError(400, 'El enlace no es válido o ya fue utilizado'),
    )

    render(<RestablecerPage />)
    await llenarYEnviar(CLAVE)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es válido o ya fue utilizado/i)
    // Y no se anuncia ningún éxito.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
