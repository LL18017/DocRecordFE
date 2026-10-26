// Signos vitales · el catálogo de pacientes está al día al abrir el formulario.
//
// Observación de la tutora: «la opción Signos vitales no muestra nuevos
// pacientes para asignar signos vitales». El catálogo se pedía una sola vez,
// al entrar a la pantalla; un paciente registrado después no aparecía hasta
// recargar.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PacienteDto } from '@/services/pacientes'
import EnfermeriaPage from './page'

const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ user: { name: 'Marta Guevara', roles: ['enfermera'] }, activeClinic: null }),
}))
vi.mock('@/services/pacientes', () => ({ listarPacientes: () => listarPacientes() }))
vi.mock('@/services/signosVitales', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/signosVitales')>()
  return { ...real, listarTomas: async () => [] }
})

function paciente(personaId: number, nombres: string, expediente: string): PacienteDto {
  return {
    personaId,
    expediente,
    tipoSangre: null,
    creadoEn: '2026-10-25T10:00:00',
    estado: 'ACTIVO',
    persona: { personaId, nombres, apellidos: 'Prueba' },
  } as unknown as PacienteDto
}

beforeEach(() => {
  listarPacientes.mockReset()
})

describe('signos vitales · catálogo de pacientes', () => {
  it('al abrir el formulario vuelve a pedir los pacientes y ofrece a uno registrado después', async () => {
    const user = userEvent.setup()
    listarPacientes.mockResolvedValueOnce([paciente(1, 'Rosa', 'EXP-000001')])
    render(<EnfermeriaPage />)
    await screen.findByText('Todavía no se ha registrado ninguna toma de constantes.')

    // Mientras la pantalla está abierta, alguien registra a «Carlos».
    listarPacientes.mockResolvedValue([paciente(1, 'Rosa', 'EXP-000001'), paciente(2, 'Carlos', 'EXP-000002')])
    await user.click(screen.getByRole('button', { name: /Registrar Signos Vitales/ }))

    expect(await screen.findByRole('option', { name: 'Carlos Prueba (EXP-000002)' })).toBeInTheDocument()
    expect(listarPacientes).toHaveBeenCalledTimes(2)
  })
})
