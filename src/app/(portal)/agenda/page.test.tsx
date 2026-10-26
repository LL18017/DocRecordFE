// Agenda de citas (HU-30, HU-32).
//
// Antes esta prueba fijaba lo contrario: que la agenda NO pareciera real,
// porque no había endpoint de citas y la pantalla mostraba cinco inventadas.
// Desde V24 las citas existen y son del paciente del expediente. Lo que se
// conserva de aquellas guardas es lo que sigue valiendo: ninguna cita de la
// maqueta, y nada que se muestre sin haber salido del backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { appointments } from '@/data/mockData'
import type { Clinica, User } from '@/types'
import type { CitaDto } from '@/services/citas'
import AgendaPage from './page'

const listarAgenda = vi.fn<(clinicaId: number, desde: string) => Promise<CitaDto[]>>()
const cancelarCita = vi.fn<(id: number, motivo: string) => Promise<CitaDto>>()

vi.mock('@/services/citas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/citas')>()
  return {
    ...real,
    listarAgenda: (clinicaId: number, desde: string) => listarAgenda(clinicaId, desde),
    listarMedicosDeClinica: async () => [{ medicoId: 3, nombre: 'Ana Rivas' }],
    listarTiposDeCita: async () => [{ tipoCitaId: 1, nombre: 'Consulta general', descripcion: null }],
    cancelarCita: (id: number, motivo: string) => cancelarCita(id, motivo),
  }
})

const SEDE = { id: 5, name: 'Clínica Santa Ana', lat: null, lng: null } as Clinica
const SESION: { user: User | null; activeClinic: Clinica | null } = {
  user: { name: 'Ana Rivas', roles: ['medico'] },
  activeClinic: SEDE,
}
vi.mock('@/context/AppContext', () => ({ useAppContext: () => SESION }))

/** Pasado mañana, lejos de la regla de las 4 horas. */
function pasadoManana(hora: string): string {
  const f = new Date()
  f.setDate(f.getDate() + 2)
  const dia = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
  return `${dia}T${hora}:00`
}

function cita(parcial: Partial<CitaDto>): CitaDto {
  return {
    citaId: 1,
    fechaHora: pasadoManana('09:00'),
    tipoCitaId: 1,
    tipoCita: 'Consulta general',
    pacienteId: 40,
    paciente: 'Rosa Martínez',
    expediente: 'EXP-000040',
    medicoId: 3,
    medico: 'Ana Rivas',
    clinicaId: 5,
    clinica: 'Clínica Santa Ana',
    estado: 'AGENDADA',
    motivoCancelacion: null,
    ...parcial,
  }
}

beforeEach(() => {
  SESION.activeClinic = SEDE
  listarAgenda.mockReset()
  cancelarCita.mockReset()
  listarAgenda.mockResolvedValue([])
})

describe('agenda · lo que muestra sale del backend', () => {
  it('pide la agenda de la sede activa y muestra sus citas', async () => {
    listarAgenda.mockResolvedValue([cita({})])
    render(<AgendaPage />)

    const fila = await screen.findByRole('listitem', { name: /Cita de Rosa Martínez a las 09:00/ })
    expect(within(fila).getByText('EXP-000040')).toBeVisible()
    expect(within(fila).getByText(/Ana Rivas · Consulta general/)).toBeVisible()
    expect(listarAgenda).toHaveBeenCalledWith(5, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('no muestra ninguna de las citas de la maqueta', async () => {
    render(<AgendaPage />)
    expect(await screen.findByText('No hay citas para este día.')).toBeVisible()
    for (const c of appointments) {
      expect(screen.queryByText(new RegExp(c.patient.split(' ')[0]))).toBeNull()
    }
    expect(screen.queryByText(/juan guerra/i)).toBeNull()
  })

  it('sin sede activa no inventa una agenda: manda a elegir clínica', () => {
    SESION.activeClinic = null
    render(<AgendaPage />)
    expect(screen.getByRole('link', { name: 'Seleccionar clínica' })).toHaveAttribute('href', '/select-clinica')
    expect(listarAgenda).not.toHaveBeenCalled()
  })

  it('si la agenda no carga, lo dice y deja reintentar', async () => {
    listarAgenda.mockRejectedValue(new ApiError(500, 'El servidor no respondió'))
    render(<AgendaPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no respondió')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })
})

describe('agenda · cancelar (HU-32)', () => {
  it('c1 y c5: cancelar exige motivo y la cita sigue en la lista, cancelada y con su motivo', async () => {
    const user = userEvent.setup()
    listarAgenda.mockResolvedValueOnce([cita({})])
    const cancelada = cita({ estado: 'CANCELADA', motivoCancelacion: 'Viaje' })
    cancelarCita.mockResolvedValue(cancelada)
    render(<AgendaPage />)

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo de la cancelación es obligatorio.')
    expect(cancelarCita).not.toHaveBeenCalled()

    listarAgenda.mockResolvedValue([cancelada])
    await user.type(screen.getByLabelText(/Motivo/), 'Viaje')
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))

    expect(cancelarCita).toHaveBeenCalledWith(1, 'Viaje')
    const fila = await screen.findByRole('listitem', { name: /Cita de Rosa Martínez/ })
    expect(within(fila).getByText('Cancelada')).toBeVisible()
    expect(within(fila).getByText('Motivo: Viaje')).toBeVisible()
  })

  it('c2: con menos de 4 horas no ofrece cancelar ni reprogramar', async () => {
    const enDosHoras = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const fecha = `${enDosHoras.getFullYear()}-${String(enDosHoras.getMonth() + 1).padStart(2, '0')}-${String(
      enDosHoras.getDate(),
    ).padStart(2, '0')}T${String(enDosHoras.getHours()).padStart(2, '0')}:00:00`
    listarAgenda.mockResolvedValue([cita({ fechaHora: fecha })])
    render(<AgendaPage />)

    expect(await screen.findByText(/Menos de 4 h/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).toBeNull()
  })
})
