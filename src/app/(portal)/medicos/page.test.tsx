// Pantalla de fichas de médico (HU-02): primero la ficha, después el acceso.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { AccesoDto, AccesoPayload, GuardarMedicoPayload, MedicoDto } from '@/services/medicos'
import type { ClinicaDto } from '@/services/clinicas'
import type { EspecialidadDto } from '@/services/personas'
import MedicosPage from './page'

const listarMedicos = vi.fn<() => Promise<MedicoDto[]>>()
const crearMedico = vi.fn<(p: GuardarMedicoPayload) => Promise<MedicoDto>>()
const actualizarMedico = vi.fn<(id: number, p: GuardarMedicoPayload) => Promise<MedicoDto>>()
const cambiarEstadoMedico = vi.fn<(id: number, activo: boolean) => Promise<MedicoDto>>()
const darAcceso = vi.fn<(id: number, p: AccesoPayload) => Promise<AccesoDto>>()

vi.mock('@/services/medicos', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/medicos')>()
  return {
    ...real,
    listarMedicos: () => listarMedicos(),
    crearMedico: (p: GuardarMedicoPayload) => crearMedico(p),
    actualizarMedico: (id: number, p: GuardarMedicoPayload) => actualizarMedico(id, p),
    cambiarEstadoMedico: (id: number, activo: boolean) => cambiarEstadoMedico(id, activo),
    darAcceso: (id: number, p: AccesoPayload) => darAcceso(id, p),
  }
})

vi.mock('@/services/personas', () => ({
  listarEspecialidades: async (): Promise<EspecialidadDto[]> => [
    { especialidadId: 1, nombre: 'Medicina General', activa: true },
    { especialidadId: 9, nombre: 'Especialidad retirada', activa: false },
  ],
}))

vi.mock('@/services/clinicas', () => ({
  listarTodasLasClinicas: async () => [{ clinicaId: 11, name: 'Unidad de Salud Escalón' } as ClinicaDto],
}))

function medico(cambios: Partial<MedicoDto> = {}): MedicoDto {
  return {
    personaId: 42,
    nombres: 'Lucía',
    apellidos: 'Mejía',
    telefono: null,
    especialidadId: 1,
    especialidad: 'Medicina General',
    registroJunta: 'JVPM-4471',
    activo: true,
    cuenta: null,
    ...cambios,
  }
}

const CON_INVITACION = medico({
  cuenta: { userId: 7, email: 'lucia@docrecord.sv', estado: 'SIN_ACTIVAR', conRolMedico: true, sedes: [] },
})

beforeEach(() => {
  for (const f of [listarMedicos, crearMedico, actualizarMedico, cambiarEstadoMedico, darAcceso]) f.mockReset()
  listarMedicos.mockResolvedValue([medico()])
})

async function montar() {
  const user = userEvent.setup()
  render(<MedicosPage />)
  await screen.findByText('Lucía Mejía')
  return user
}

describe('médicos · la ficha', () => {
  it('lista la ficha con su junta y dice que todavía no tiene acceso', async () => {
    await montar()
    const fila = screen.getByText('Lucía Mejía').closest('tr')!
    expect(within(fila).getByText('JVPM-4471')).toBeVisible()
    expect(within(fila).getByText('Sin acceso')).toBeVisible()
  })

  it('registrar exige la junta con formato y solo ofrece especialidades activas', async () => {
    crearMedico.mockResolvedValue(medico({ personaId: 50, nombres: 'Mario', apellidos: 'Lemus', registroJunta: 'JVPM-1000' }))
    const user = await montar()

    await user.click(screen.getByRole('button', { name: /registrar médico/i }))
    const modal = within(await screen.findByRole('dialog'))
    await user.type(modal.getByLabelText(/nombres/i), 'Mario')
    await user.type(modal.getByLabelText(/apellidos/i), 'Lemus')
    const especialidad = modal.getByLabelText(/especialidad/i)
    await waitFor(() => expect(within(especialidad).getByRole('option', { name: 'Medicina General' })).toBeVisible())
    expect(within(especialidad).queryByRole('option', { name: 'Especialidad retirada' })).toBeNull()
    await user.selectOptions(especialidad, '1')

    const guardar = modal.getByRole('button', { name: /registrar médico/i })
    await user.type(modal.getByLabelText(/número de junta/i), 'JVPM')
    expect(modal.getByText(/al menos un número/i)).toBeVisible()
    expect(guardar).toBeDisabled()

    await user.type(modal.getByLabelText(/número de junta/i), '-1000')
    await user.click(guardar)

    await waitFor(() =>
      expect(crearMedico).toHaveBeenCalledWith({
        nombres: 'Mario',
        apellidos: 'Lemus',
        telefono: '',
        especialidadId: 1,
        registroJunta: 'JVPM-1000',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/dele acceso/i)
    expect(screen.getByText('Mario Lemus')).toBeVisible()
  })

  it('el 409 de la junta repetida se muestra con el mensaje del servidor', async () => {
    crearMedico.mockRejectedValue(new ApiError(409, 'Este número de junta de vigilancia ya está registrado'))
    const user = await montar()

    await user.click(screen.getByRole('button', { name: /registrar médico/i }))
    const modal = within(await screen.findByRole('dialog'))
    await user.type(modal.getByLabelText(/nombres/i), 'Otro')
    await user.type(modal.getByLabelText(/apellidos/i), 'Medico')
    await waitFor(() => expect(modal.getByRole('option', { name: 'Medicina General' })).toBeVisible())
    await user.selectOptions(modal.getByLabelText(/especialidad/i), '1')
    await user.type(modal.getByLabelText(/número de junta/i), 'JVPM-4471')
    await user.click(modal.getByRole('button', { name: /registrar médico/i }))

    expect(await modal.findByRole('alert')).toHaveTextContent('ya está registrado')
  })

  it('dar de baja manda false y avisa que ya no atiende', async () => {
    cambiarEstadoMedico.mockResolvedValue(medico({ activo: false }))
    const user = await montar()

    await user.click(screen.getByRole('button', { name: /dar de baja a lucía mejía/i }))

    await waitFor(() => expect(cambiarEstadoMedico).toHaveBeenCalledWith(42, false))
    expect(await screen.findByRole('status')).toHaveTextContent(/ya no atiende/i)
  })
})

describe('médicos · el acceso', () => {
  it('a una ficha sin cuenta le pide correo y sede, y avisa que salió la invitación', async () => {
    darAcceso.mockResolvedValue({ medico: CON_INVITACION, invitacionEnviada: true, correoEnviado: true })
    const user = await montar()

    await user.click(screen.getByRole('button', { name: /dar acceso: lucía mejía/i }))
    const modal = within(await screen.findByRole('dialog'))
    const enviar = modal.getByRole('button', { name: /^dar acceso$/i })
    expect(enviar).toBeDisabled()

    await user.type(modal.getByLabelText(/correo para iniciar sesión/i), 'lucia@docrecord.sv')
    expect(enviar).toBeDisabled()
    const sede = modal.getByLabelText(/sede donde va a trabajar/i)
    await waitFor(() => expect(within(sede).getByRole('option', { name: 'Unidad de Salud Escalón' })).toBeVisible())
    await user.selectOptions(sede, '11')
    await user.click(enviar)

    await waitFor(() => expect(darAcceso).toHaveBeenCalledWith(42, { email: 'lucia@docrecord.sv', clinicaId: 11 }))
    expect(await screen.findByRole('status')).toHaveTextContent(/se envió la invitación a lucia@docrecord.sv/i)
    expect(within(screen.getByText('Lucía Mejía').closest('tr')!).getByText('Invitación enviada')).toBeVisible()
  })

  it('a una cuenta sin activar le ofrece reenviar la invitación, sin pedir el correo', async () => {
    listarMedicos.mockResolvedValue([
      medico({
        cuenta: {
          userId: 7,
          email: 'lucia@docrecord.sv',
          estado: 'SIN_ACTIVAR',
          conRolMedico: true,
          sedes: [{ clinicaId: 11, nombre: 'Unidad de Salud Escalón' }],
        },
      }),
    ])
    darAcceso.mockResolvedValue({ medico: CON_INVITACION, invitacionEnviada: true, correoEnviado: false })
    const user = await montar()

    await user.click(screen.getByRole('button', { name: /reenviar invitación: lucía mejía/i }))
    const modal = within(await screen.findByRole('dialog'))
    expect(modal.queryByLabelText(/correo para iniciar sesión/i)).toBeNull()
    await user.click(modal.getByRole('button', { name: /reenviar invitación/i }))

    await waitFor(() => expect(darAcceso).toHaveBeenCalledWith(42, {}))
    expect(await screen.findByRole('status')).toHaveTextContent(/no salió/i)
  })
})
