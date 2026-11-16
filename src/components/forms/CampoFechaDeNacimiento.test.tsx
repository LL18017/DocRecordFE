// El campo de fecha de nacimiento: rango 1900–hoy, avisado al entrar al campo.
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampoFechaDeNacimiento } from './CampoFechaDeNacimiento'

function montar(error: string | null = null) {
  render(
    <>
      <label htmlFor="nacimiento">Fecha de nacimiento</label>
      <CampoFechaDeNacimiento
        id="nacimiento"
        valor=""
        onCambio={() => {}}
        hoy="2026-11-05"
        error={error}
        className=""
      />
    </>,
  )
  return userEvent.setup()
}

describe('CampoFechaDeNacimiento', () => {
  it('acota el calendario entre el 1 de enero de 1900 y hoy', () => {
    montar()
    const campo = screen.getByLabelText('Fecha de nacimiento')
    expect(campo).toHaveAttribute('min', '1900-01-01')
    expect(campo).toHaveAttribute('max', '2026-11-05')
  })

  it('avisa el rango al entrar al campo, antes de equivocarse', async () => {
    const user = montar()
    const campo = screen.getByLabelText('Fecha de nacimiento')
    const ayuda = screen.getByText('Desde el 1 de enero de 1900 hasta hoy.')
    // Fuera del campo solo la oyen los lectores de pantalla.
    expect(ayuda).toHaveClass('sr-only')
    expect(campo).toHaveAccessibleDescription('Desde el 1 de enero de 1900 hasta hoy.')

    await user.click(campo)
    expect(ayuda).not.toHaveClass('sr-only')

    await user.tab()
    expect(ayuda).toHaveClass('sr-only')
  })

  it('con una fecha fuera de rango, el error ocupa el lugar de la ayuda', () => {
    montar('La fecha de nacimiento no puede ser anterior a 1900.')
    expect(screen.getByRole('alert')).toHaveTextContent(/anterior a 1900/)
    expect(screen.queryByText('Desde el 1 de enero de 1900 hasta hoy.')).toBeNull()
    expect(screen.getByLabelText('Fecha de nacimiento')).toHaveAttribute('aria-invalid', 'true')
  })
})
