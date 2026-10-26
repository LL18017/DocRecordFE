import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { HorarioPayload, MedicoDeClinicaDto } from '@/services/horarios'
import type { CitaDto } from '@/services/citas'
import { MedicosDeLaClinica } from './MedicosDeLaClinica'

const listarMedicosConHorario = vi.fn<(clinicaId: number) => Promise<MedicoDeClinicaDto[]>>()
const agregarHorario = vi.fn<(c: number, m: number, p: HorarioPayload) => Promise<unknown>>()
const citasFuturasDelMedico = vi.fn<(c: number, m: number) => Promise<CitaDto[]>>()
const quitarMedicoDeLaClinica = vi.fn<(c: number, m: number) => Promise<void>>()

vi.mock('@/services/horarios', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/horarios')>()
  return {
    ...real,
    listarMedicosConHorario: (c: number) => listarMedicosConHorario(c),
    agregarHorario: (c: number, m: number, p: HorarioPayload) => agregarHorario(c, m, p),
    citasFuturasDelMedico: (c: number, m: number) => citasFuturasDelMedico(c, m),
    quitarMedicoDeLaClinica: (c: number, m: number) => quitarMedicoDeLaClinica(c, m),
    quitarHorario: async () => {},
  }
})
vi.mock('@/services/usuarios', () => ({ listarUsuarios: async () => [] }))

const ANA: MedicoDeClinicaDto = {
  medicoId: 3,
  nombre: 'Ana Rivas',
  especialidad: 'Medicina general',
  horarios: [{ horarioId: 1, diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' }],
}

beforeEach(() => {
  listarMedicosConHorario.mockReset()
  agregarHorario.mockReset()
  citasFuturasDelMedico.mockReset()
  quitarMedicoDeLaClinica.mockReset()
  listarMedicosConHorario.mockResolvedValue([ANA])
})

describe('médicos de la sede (HU-29)', () => {
  it('c3: lista a cada médico con su especialidad y su horario', async () => {
    render(<MedicosDeLaClinica clinicaId={5} esAdmin={false} />)

    const fila = await screen.findByRole('listitem', { name: 'Médico Ana Rivas' })
    expect(within(fila).getByText('Medicina general')).toBeVisible()
    expect(within(fila).getByText('Lun 08:00–12:00')).toBeVisible()
    expect(listarMedicosConHorario).toHaveBeenCalledWith(5)
  })

  it('c5: quien no es administrador solo consulta', async () => {
    render(<MedicosDeLaClinica clinicaId={5} esAdmin={false} />)

    await screen.findByText('Ana Rivas')
    expect(screen.queryByRole('form', { name: 'Agregar horario' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Quitar de la sede' })).toBeNull()
  })

  it('c2: un traslape lo rechaza el backend y se muestra su mensaje', async () => {
    const user = userEvent.setup()
    agregarHorario.mockRejectedValue(
      new ApiError(409, 'El médico ya atiende el lunes de 08:00 a 12:00 en Sede Norte: los horarios no pueden traslaparse'),
    )
    render(<MedicosDeLaClinica clinicaId={5} esAdmin />)

    const form = await screen.findByRole('form', { name: 'Agregar horario' })
    await user.selectOptions(within(form).getByLabelText(/Médico/), '3')
    await user.click(within(form).getByRole('button', { name: 'Agregar horario' }))

    expect(agregarHorario).toHaveBeenCalledWith(5, 3, { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' })
    expect(await within(form).findByRole('alert')).toHaveTextContent('ya atiende el lunes de 08:00 a 12:00 en Sede Norte')
  })

  it('c4: antes de quitarlo muestra sus citas futuras y pide confirmar', async () => {
    const user = userEvent.setup()
    citasFuturasDelMedico.mockResolvedValue([
      { citaId: 9, fechaHora: '2026-11-02T09:00:00', paciente: 'Rosa Martínez' } as CitaDto,
    ])
    quitarMedicoDeLaClinica.mockResolvedValue()
    render(<MedicosDeLaClinica clinicaId={5} esAdmin />)

    await user.click(await screen.findByRole('button', { name: 'Quitar de la sede' }))
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('Tiene 1 cita futura en esta sede')
    expect(aviso).toHaveTextContent('2026-11-02 09:00 · Rosa Martínez')
    expect(quitarMedicoDeLaClinica).not.toHaveBeenCalled()

    await user.click(within(aviso).getByRole('button', { name: 'Confirmar y quitar' }))
    expect(quitarMedicoDeLaClinica).toHaveBeenCalledWith(5, 3)
  })
})
