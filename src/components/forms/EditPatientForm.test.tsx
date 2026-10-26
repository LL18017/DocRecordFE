// Observaciones de la tutora en la edición: teléfono de 8 dígitos y fecha de
// nacimiento no posterior a hoy, con el mensaje junto al campo.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ActualizarPacientePayload, PacienteDto } from '@/services/pacientes'
import { hoyEnElSalvador } from '@/lib/validaciones'
import { EditPatientForm } from './EditPatientForm'

const actualizarPaciente = vi.fn()

vi.mock('@/services/pacientes', () => ({
  actualizarPaciente: (id: number, payload: ActualizarPacientePayload) => actualizarPaciente(id, payload),
}))

const PACIENTE: PacienteDto = {
  personaId: 12,
  expediente: 'EXP-000012',
  tipoSangre: 'O+',
  creadoEn: '2026-01-10T09:00:00',
  estado: 'ACTIVO',
  persona: {
    personaId: 12,
    dui: '01234567-8',
    nombres: 'Carlos',
    apellidos: 'Chávez',
    fechaNacimiento: '1996-06-15',
    sexo: 'M',
    telefono: '7000-0000',
    direccion: 'San Salvador',
    email: null,
  },
}

const onUpdated = vi.fn()

function montar() {
  render(<EditPatientForm paciente={PACIENTE} onUpdated={onUpdated} onCancel={() => {}} />)
  return userEvent.setup()
}

const campoTelefono = () => screen.getByLabelText(/^teléfono/i)
const campoFecha = () => screen.getByLabelText(/fecha de nacimiento/i)
const botonGuardar = () => screen.getByRole('button', { name: /guardar/i })

beforeEach(() => {
  actualizarPaciente.mockReset()
  actualizarPaciente.mockResolvedValue(PACIENTE)
  onUpdated.mockReset()
})

describe('EditPatientForm · teléfono', () => {
  it('rechaza 9 dígitos junto al campo y no envía', async () => {
    const user = montar()
    await user.clear(campoTelefono())
    await user.type(campoTelefono(), '999999999')

    expect(await screen.findByText(/el teléfono debe tener 8 dígitos/i)).toBeVisible()
    expect(campoTelefono()).toHaveAttribute('aria-invalid', 'true')
    await user.click(botonGuardar())
    expect(actualizarPaciente).not.toHaveBeenCalled()
  })

  it('acepta 8 dígitos sin guion y los envía', async () => {
    const user = montar()
    await user.clear(campoTelefono())
    await user.type(campoTelefono(), '77778888')
    await user.click(botonGuardar())

    await waitFor(() => expect(actualizarPaciente).toHaveBeenCalledTimes(1))
    expect(actualizarPaciente).toHaveBeenCalledWith(12, { persona: { telefono: '77778888' } })
  })
})

describe('EditPatientForm · fecha de nacimiento', () => {
  it('limita el input a hoy y rechaza una fecha futura con mensaje', async () => {
    const user = montar()
    expect(campoFecha()).toHaveAttribute('max', hoyEnElSalvador())

    await user.clear(campoFecha())
    await user.type(campoFecha(), '2999-01-01')

    expect(await screen.findByText(/no puede ser posterior a hoy/i)).toBeVisible()
    await user.click(botonGuardar())
    expect(actualizarPaciente).not.toHaveBeenCalled()
  })
})
