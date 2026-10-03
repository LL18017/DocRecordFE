// Guardas de la pantalla donde se pide el enlace de restablecimiento.
//
// Lo que más vigila este archivo no es que el formulario envíe: es que la
// confirmación NO delate si el correo está registrado. El backend responde 202
// con el mismo mensaje exista o no la cuenta (HU-04 criterio 4), y esa decisión
// se puede tirar abajo desde aquí con un simple «ese correo no existe» —quien
// quiera averiguar quién tiene cuenta solo tendría que probar en esta pantalla.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import RecuperarPage from './page'

const solicitarRecuperacion = vi.fn<(email: string) => Promise<{ mensaje: string }>>()

vi.mock('@/services/auth', () => ({
  solicitarRecuperacion: (email: string) => solicitarRecuperacion(email),
}))

const MENSAJE_DEL_BACKEND =
  'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.'

describe('Recuperar contraseña', () => {
  beforeEach(() => {
    solicitarRecuperacion.mockReset()
  })

  it('envía el correo escrito y muestra la confirmación del backend', async () => {
    solicitarRecuperacion.mockResolvedValue({ mensaje: MENSAJE_DEL_BACKEND })

    render(<RecuperarPage />)
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'naun@ues.edu.sv')
    await userEvent.click(screen.getByRole('button', { name: /enviarme el enlace/i }))

    await waitFor(() => expect(solicitarRecuperacion).toHaveBeenCalledWith('naun@ues.edu.sv'))
    expect(await screen.findByText(MENSAJE_DEL_BACKEND)).toBeInTheDocument()
  })

  it('muestra el mismo texto exista o no la cuenta', async () => {
    // El backend devuelve el mismo mensaje en ambos casos; esta prueba fija que
    // la pantalla no añada ninguna diferencia por su cuenta.
    solicitarRecuperacion.mockResolvedValue({ mensaje: MENSAJE_DEL_BACKEND })

    const { unmount } = render(<RecuperarPage />)
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'existe@ues.edu.sv')
    await userEvent.click(screen.getByRole('button', { name: /enviarme el enlace/i }))
    const primero = (await screen.findByRole('status')).textContent
    unmount()

    render(<RecuperarPage />)
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'no.existe@ues.edu.sv')
    await userEvent.click(screen.getByRole('button', { name: /enviarme el enlace/i }))
    const segundo = (await screen.findByRole('status')).textContent

    expect(segundo).toBe(primero)
  })

  it('esconde el formulario tras confirmar, para no reenviar en bucle', async () => {
    // Cada envío emite un enlace nuevo y quema el anterior: dejar el botón a la
    // vista invita justo a invalidar el enlace que la persona está por abrir.
    solicitarRecuperacion.mockResolvedValue({ mensaje: MENSAJE_DEL_BACKEND })

    render(<RecuperarPage />)
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'naun@ues.edu.sv')
    await userEvent.click(screen.getByRole('button', { name: /enviarme el enlace/i }))

    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: /enviarme el enlace/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument()
  })

  it('si falla la red lo dice, y deja volver a intentarlo', async () => {
    solicitarRecuperacion.mockRejectedValue(new ApiError(0, 'Sin conexión con el servidor'))

    render(<RecuperarPage />)
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'naun@ues.edu.sv')
    await userEvent.click(screen.getByRole('button', { name: /enviarme el enlace/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/sin conexión con el servidor/i)
    // El formulario sigue ahí: un fallo de red no es una confirmación.
    expect(screen.getByRole('button', { name: /enviarme el enlace/i })).toBeInTheDocument()
  })
})
