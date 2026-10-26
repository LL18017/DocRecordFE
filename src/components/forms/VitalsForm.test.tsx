// HU-16 (DRS-26) criterio 2 · HU-17 (DRS-88) criterio 3.
//
// El formulario hace dos cosas distintas con un valor raro, y estas pruebas
// vigilan que no se mezclen:
//   · fuera del rango NORMAL  → advierte junto al campo y DEJA guardar;
//   · fuera del límite FISIOLÓGICO (el que el servidor rechaza) → muestra el
//     error y NO deja enviar.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VitalsForm } from './VitalsForm'

function montar() {
  const onSubmit = vi.fn()
  render(<VitalsForm defaultPacienteId={7} onSubmit={onSubmit} onCancel={() => {}} />)
  return { onSubmit, user: userEvent.setup() }
}

const guardar = () => screen.getByRole('button', { name: 'Guardar Registro' })

describe('VitalsForm · advertencia de rango normal (HU-16 criterio 2)', () => {
  it('un valor normal no advierte nada', async () => {
    const { user } = montar()

    await user.type(screen.getByLabelText('Pulso (lpm)'), '72')

    expect(screen.queryByText(/fuera del rango normal/i)).not.toBeInTheDocument()
  })

  it('una temperatura de 40 °C advierte junto al campo, con el rango normal', async () => {
    const { user } = montar()

    await user.type(screen.getByLabelText('Temperatura (°C)'), '40')

    const aviso = screen.getByText(/fuera del rango normal/i)
    expect(aviso).toHaveTextContent('36–37.5 °C')
    // Es un aviso, no un error: no es role=alert y está enlazado al campo.
    expect(aviso).toHaveAttribute('role', 'status')
    expect(screen.getByLabelText('Temperatura (°C)')).toHaveAttribute('aria-describedby', aviso.id)
    expect(screen.getByLabelText('Temperatura (°C)')).not.toHaveAttribute('aria-invalid')
  })

  it('y deja guardar: advertir no es bloquear', async () => {
    const { user, onSubmit } = montar()

    await user.type(screen.getByLabelText('Temperatura (°C)'), '40')
    expect(guardar()).toBeEnabled()
    await user.click(guardar())

    expect(onSubmit).toHaveBeenCalledWith({ pacienteId: 7, temperaturaC: 40 })
  })

  it('la advertencia aparece mientras se escribe y se va al corregir', async () => {
    const { user } = montar()
    const saturacion = screen.getByLabelText('Saturación O₂ (%)')

    await user.type(saturacion, '88')
    expect(screen.getByText(/fuera del rango normal/i)).toBeInTheDocument()

    await user.clear(saturacion)
    await user.type(saturacion, '97')
    expect(screen.queryByText(/fuera del rango normal/i)).not.toBeInTheDocument()
  })

  it('peso y talla no tienen rango normal: nunca advierten', async () => {
    const { user } = montar()

    await user.type(screen.getByLabelText('Peso (kg)'), '399')
    await user.type(screen.getByLabelText('Talla (cm)'), '249')

    expect(screen.queryByText(/fuera del rango normal/i)).not.toBeInTheDocument()
    expect(guardar()).toBeEnabled()
  })
})

describe('VitalsForm · límites fisiológicos (HU-17 criterio 3)', () => {
  it('un peso de 500 kg se rechaza en pantalla con el mismo rango que el servidor', async () => {
    const { user, onSubmit } = montar()

    await user.type(screen.getByLabelText('Peso (kg)'), '500')

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('El peso debe estar entre 0.5 y 400 kg.')
    expect(screen.getByLabelText('Peso (kg)')).toHaveAttribute('aria-invalid', 'true')
    expect(guardar()).toBeDisabled()

    // Ni con Enter desde el campo se envía.
    await user.type(screen.getByLabelText('Peso (kg)'), '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('una talla de 300 cm se rechaza', async () => {
    const { user } = montar()

    await user.type(screen.getByLabelText('Talla (cm)'), '300')

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('La talla debe estar entre 30 y 250 cm.')
    expect(guardar()).toBeDisabled()
  })

  it('los extremos válidos (0.5 kg y 30 cm: el prematuro) se aceptan', async () => {
    const { user, onSubmit } = montar()

    await user.type(screen.getByLabelText('Peso (kg)'), '0.5')
    await user.type(screen.getByLabelText('Talla (cm)'), '30')
    expect(guardar()).toBeEnabled()
    await user.click(guardar())

    expect(onSubmit).toHaveBeenCalledWith({ pacienteId: 7, pesoKg: 0.5, estaturaCm: 30 })
  })

  it('un peso de 0.2 kg (coma corrida) se rechaza', async () => {
    const { user } = montar()

    await user.type(screen.getByLabelText('Peso (kg)'), '0.2')

    expect(guardar()).toBeDisabled()
  })

  it('corregir el valor vuelve a habilitar el guardado', async () => {
    const { user } = montar()
    const peso = screen.getByLabelText('Peso (kg)')

    await user.type(peso, '500')
    expect(guardar()).toBeDisabled()

    await user.clear(peso)
    await user.type(peso, '72.5')
    expect(guardar()).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
