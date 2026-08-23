// Guardas de la pantalla de inicio de sesión.
//
// Los `<label>` de este formulario no apuntaban a ningún control: un lector de
// pantalla anunciaba dos «cuadros de edición» sin decir cuál era el correo y
// cuál la contraseña, y el clic en la etiqueta no enfocaba. Los campos se
// buscan aquí por su etiqueta accesible (`getByLabelText`), así que si alguien
// quita el `htmlFor` o el `id` estas pruebas no encuentran los campos y caen
// solas.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import LoginPage from './page'

const iniciarSesion = vi.fn<(email: string, password: string, rol: string) => Promise<void>>()
const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ iniciarSesion }),
}))

beforeEach(() => {
  iniciarSesion.mockReset()
  iniciarSesion.mockResolvedValue(undefined)
  push.mockReset()
})

function montar() {
  render(<LoginPage />)
  return userEvent.setup()
}

const campoCorreo = () => screen.getByLabelText(/^correo electrónico$/i)
const campoClave = () => screen.getByLabelText(/^contraseña$/i)

describe('LoginPage · nombre accesible de los campos', () => {
  it('localiza correo y contraseña por su etiqueta visible', () => {
    montar()

    expect(campoCorreo()).toHaveAttribute('type', 'email')
    expect(campoClave()).toHaveAttribute('type', 'password')
  })

  it('enfoca el campo al hacer clic en su etiqueta', async () => {
    const user = montar()

    await user.click(screen.getByText(/^contraseña$/i))

    // Si la etiqueta no apunta a su control, el clic no enfoca nada y el foco
    // se queda en el <body>.
    expect(campoClave()).toHaveFocus()
  })

  it('anuncia que ambos campos son obligatorios', () => {
    montar()

    expect(campoCorreo()).toBeRequired()
    expect(campoClave()).toBeRequired()
  })

  it('el campo que se escribe es el que viaja al servicio', async () => {
    const user = montar()

    // La etiqueta puede existir y apuntar al control equivocado: esto ata el
    // nombre visible al dato que de verdad se envía.
    await user.type(campoCorreo(), 'ana@ues.edu.sv')
    await user.type(campoClave(), 'Docrecord2026!')
    await user.click(screen.getByRole('button', { name: /ingresar al sistema/i }))

    expect(iniciarSesion).toHaveBeenCalledWith(
      'ana@ues.edu.sv',
      'Docrecord2026!',
      expect.anything(),
    )
  })
})

describe('LoginPage · el error de credenciales', () => {
  it('queda asociado a los campos que lo provocan, no solo puesto debajo', async () => {
    iniciarSesion.mockRejectedValue(new ApiError(401, 'Correo o contraseña incorrectos.'))
    const user = montar()

    await user.type(campoCorreo(), 'ana@ues.edu.sv')
    await user.type(campoClave(), 'clave-mala')
    await user.click(screen.getByRole('button', { name: /ingresar al sistema/i }))

    await screen.findByRole('alert')

    // Un `role="alert"` suelto se anuncia una vez y se pierde. Enlazado con
    // `aria-describedby` se vuelve a leer cada vez que alguien vuelve al campo
    // para corregirlo, que es justo el momento en que hace falta.
    for (const campo of [campoCorreo(), campoClave()]) {
      expect(campo).toHaveAttribute('aria-invalid', 'true')
      const descripciones = (campo.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((idDescripcion) => document.getElementById(idDescripcion)?.textContent ?? '')
      expect(descripciones.join(' ')).toContain('Correo o contraseña incorrectos.')
    }
  })

  it('no marca los campos como inválidos mientras no haya fallado nada', () => {
    montar()

    // `aria-invalid` permanente haría que el lector anunciara «no válido» en
    // un formulario recién abierto, que nadie ha llegado a equivocar todavía.
    expect(campoCorreo()).not.toHaveAttribute('aria-invalid')
    expect(campoClave()).not.toHaveAttribute('aria-invalid')
    expect(campoCorreo()).not.toHaveAttribute('aria-describedby')
  })

  // RUPTURA INTENCIONAL: prueba agregada solo para confirmar que el CI
  // sabe fallar. Se revierte con un commit nuevo en cuanto se vea en rojo.
  it('ruptura intencional para probar que el CI falla', () => {
    expect(true).toBe(false)
  })
})
