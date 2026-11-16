// Agenda de citas (HU-30, HU-31, HU-32).
//
// Antes esta prueba fijaba lo contrario: que la agenda NO pareciera real,
// porque no había endpoint de citas y la pantalla mostraba cinco inventadas.
// Desde V24 las citas existen y son del paciente del expediente. Lo que se
// conserva de aquellas guardas es lo que sigue valiendo: ninguna cita de la
// maqueta, y nada que se muestre sin haber salido del backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { appointments } from '@/data/mockData'
import type { Clinica, User } from '@/types'
import type { CitaDto } from '@/services/citas'
import { hoy } from '@/components/clinico/SeccionDeExpediente'
import AgendaPage from './page'

type Opciones = { medicoId?: number; mias?: boolean }
const listarAgenda = vi.fn<(clinicaId: number, desde: string, hasta?: string, opciones?: Opciones) => Promise<CitaDto[]>>()
const cancelarCita = vi.fn<(id: number, motivo: string) => Promise<CitaDto>>()
const marcarNoAsistio = vi.fn<(id: number) => Promise<CitaDto>>()

vi.mock('@/services/citas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/citas')>()
  return {
    ...real,
    listarAgenda: (clinicaId: number, desde: string, hasta?: string, opciones?: Opciones) =>
      listarAgenda(clinicaId, desde, hasta, opciones),
    listarMedicosDeClinica: async () => [{ medicoId: 3, nombre: 'Ana Rivas' }],
    listarTiposDeCita: async () => [{ tipoCitaId: 1, nombre: 'Consulta general', descripcion: null }],
    cancelarCita: (id: number, motivo: string) => cancelarCita(id, motivo),
    marcarNoAsistio: (id: number) => marcarNoAsistio(id),
  }
})

const SEDE = { id: 5, name: 'Clínica Santa Ana', lat: null, lng: null } as Clinica
const SESION: { user: User | null; activeClinic: Clinica | null } = {
  user: { name: 'Ana Rivas', roles: ['medico'] },
  activeClinic: SEDE,
}
vi.mock('@/context/AppContext', () => ({ useAppContext: () => SESION }))

const MEDICO: User = { name: 'Ana Rivas', roles: ['medico'] }

function diaISO(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

/** Pasado mañana, lejos de la regla de las 4 horas. */
function pasadoManana(hora: string): string {
  const f = new Date()
  f.setDate(f.getDate() + 2)
  return `${diaISO(f)}T${hora}:00`
}

/** Ayer: una cita cuya hora ya pasó. */
function ayer(hora: string): string {
  const f = new Date()
  f.setDate(f.getDate() - 1)
  return `${diaISO(f)}T${hora}:00`
}

/** Lo que pidió la última llamada a la agenda. */
function ultimaPeticion() {
  const [clinicaId, desde, hasta, opciones] = listarAgenda.mock.calls[listarAgenda.mock.calls.length - 1]
  return { clinicaId, desde, hasta, opciones }
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
    motivo: 'Control de presión arterial',
    ...parcial,
  }
}

beforeEach(() => {
  SESION.activeClinic = SEDE
  SESION.user = MEDICO
  listarAgenda.mockReset()
  cancelarCita.mockReset()
  marcarNoAsistio.mockReset()
  listarAgenda.mockResolvedValue([])
})

describe('agenda · lo que muestra sale del backend', () => {
  it('pide la agenda de la sede activa y muestra sus citas', async () => {
    listarAgenda.mockResolvedValue([cita({})])
    render(<AgendaPage />)

    const fila = await screen.findByRole('listitem', { name: /Cita de Rosa Martínez a las 09:00/ })
    expect(within(fila).getByText('EXP-000040')).toBeVisible()
    expect(within(fila).getByText(/Ana Rivas · Consulta general/)).toBeVisible()
    expect(listarAgenda).toHaveBeenCalledWith(5, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.any(String), expect.anything())
  })

  it('HU-31 c3: cada cita muestra su clínica y su motivo', async () => {
    listarAgenda.mockResolvedValue([cita({})])
    render(<AgendaPage />)

    const fila = await screen.findByRole('listitem', { name: /Cita de Rosa Martínez/ })
    expect(within(fila).getByText(/Clínica: Clínica Santa Ana/)).toBeVisible()
    expect(within(fila).getByText(/Motivo de la cita: Control de presión arterial/)).toBeVisible()
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

describe('agenda · Mis citas (HU-31 c1)', () => {
  it('el médico abre en «Mis citas» de hoy y puede pasar a toda la sede', async () => {
    const user = userEvent.setup()
    render(<AgendaPage />)

    await waitFor(() => expect(listarAgenda).toHaveBeenCalled())
    expect(ultimaPeticion()).toEqual({ clinicaId: 5, desde: hoy(), hasta: hoy(), opciones: { mias: true } })
    expect(screen.getByRole('button', { name: 'Mis citas' })).toHaveAttribute('aria-pressed', 'true')
    // En sus citas no hay a quién filtrar.
    expect(screen.queryByLabelText('Filtrar por médico')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Toda la sede' }))
    await waitFor(() => expect(ultimaPeticion().opciones).toEqual({ mias: false }))
    expect(screen.getByLabelText('Filtrar por médico')).toBeVisible()
  })

  it('otros roles ven la agenda de la sede, como antes, sin «Mis citas»', async () => {
    SESION.user = { name: 'Elena Cruz', roles: ['enfermera'] }
    render(<AgendaPage />)

    await waitFor(() => expect(listarAgenda).toHaveBeenCalled())
    expect(ultimaPeticion().opciones).toEqual({ mias: false })
    expect(screen.queryByRole('button', { name: 'Mis citas' })).toBeNull()
    expect(screen.getByLabelText('Filtrar por médico')).toBeVisible()
  })
})

describe('agenda · vista semanal (HU-31 c2)', () => {
  it('Semana muestra los 7 días de lunes a domingo y navega por semanas', async () => {
    const user = userEvent.setup()
    listarAgenda.mockResolvedValue([cita({ fechaHora: `${hoy()}T23:30:00` })])
    render(<AgendaPage />)
    await screen.findByRole('listitem', { name: /Cita de Rosa Martínez/ })

    await user.click(screen.getByRole('button', { name: 'Semana' }))
    const semana = await screen.findByRole('region', { name: 'Citas de la semana' })
    const dias = within(semana).getAllByRole('heading', { level: 3 })
    expect(dias).toHaveLength(7)
    expect(dias[0]).toHaveTextContent(/lunes/i)
    expect(dias[6]).toHaveTextContent(/domingo/i)
    // La cita de hoy cae en su columna.
    expect(within(semana).getByRole('listitem', { name: /Cita de Rosa Martínez/ })).toBeVisible()

    const { desde, hasta } = ultimaPeticion()
    const lunes = new Date(`${desde}T12:00:00`)
    expect(lunes.getDay()).toBe(1)
    expect(desde <= hoy() && hoy() <= (hasta ?? '')).toBe(true)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    expect(hasta).toBe(diaISO(domingo))

    await user.click(screen.getByRole('button', { name: 'Semana siguiente' }))
    const siguiente = new Date(lunes)
    siguiente.setDate(lunes.getDate() + 7)
    await waitFor(() => expect(ultimaPeticion().desde).toBe(diaISO(siguiente)))

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }))
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }))
    const anterior = new Date(lunes)
    anterior.setDate(lunes.getDate() - 7)
    await waitFor(() => expect(ultimaPeticion().desde).toBe(diaISO(anterior)))

    await user.click(screen.getByRole('button', { name: 'Hoy' }))
    await waitFor(() => expect(ultimaPeticion().desde).toBe(desde))
  })
})

describe('agenda · No asistió (HU-31 c4)', () => {
  it('solo se ofrece en citas AGENDADAS cuya hora ya pasó', async () => {
    listarAgenda.mockResolvedValue([
      cita({ citaId: 1, paciente: 'Rosa Martínez', fechaHora: ayer('09:00') }),
      cita({ citaId: 2, paciente: 'Luis Gómez', fechaHora: pasadoManana('10:00') }),
      cita({ citaId: 3, paciente: 'Marta Díaz', fechaHora: ayer('10:00'), estado: 'ATENDIDA' }),
    ])
    render(<AgendaPage />)

    const pasada = await screen.findByRole('listitem', { name: /Cita de Rosa Martínez/ })
    expect(within(pasada).getByRole('button', { name: 'No asistió' })).toBeVisible()
    const futura = screen.getByRole('listitem', { name: /Cita de Luis Gómez/ })
    expect(within(futura).queryByRole('button', { name: 'No asistió' })).toBeNull()
    const atendida = screen.getByRole('listitem', { name: /Cita de Marta Díaz/ })
    expect(within(atendida).queryByRole('button', { name: 'No asistió' })).toBeNull()
  })

  it('confirma, llama al servicio y la cita queda «No asistió» sin cancelar ni reprogramar', async () => {
    const user = userEvent.setup()
    listarAgenda.mockResolvedValueOnce([cita({ fechaHora: ayer('09:00') })])
    const marcada = cita({ fechaHora: ayer('09:00'), estado: 'NO_ASISTIO' })
    marcarNoAsistio.mockResolvedValue(marcada)
    listarAgenda.mockResolvedValue([marcada])
    render(<AgendaPage />)

    await user.click(await screen.findByRole('button', { name: 'No asistió' }))
    expect(marcarNoAsistio).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sí, no asistió' }))

    expect(marcarNoAsistio).toHaveBeenCalledWith(1)
    await waitFor(() =>
      expect(within(screen.getByRole('listitem', { name: /Cita de Rosa Martínez/ })).getByText('No asistió')).toBeVisible(),
    )
    const fila = screen.getByRole('listitem', { name: /Cita de Rosa Martínez/ })
    expect(within(fila).queryByRole('button')).toBeNull()
    expect(within(fila).queryByRole('link', { name: 'Iniciar consulta' })).toBeNull()
  })

  it('si el backend la rechaza, muestra su mensaje', async () => {
    const user = userEvent.setup()
    listarAgenda.mockResolvedValue([cita({ fechaHora: ayer('09:00') })])
    const mensaje = 'Solo el médico de la cita, enfermería de su sede o un administrador pueden marcar la inasistencia'
    marcarNoAsistio.mockRejectedValue(new ApiError(403, mensaje))
    render(<AgendaPage />)

    await user.click(await screen.findByRole('button', { name: 'No asistió' }))
    await user.click(screen.getByRole('button', { name: 'Sí, no asistió' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
  })
})

describe('agenda · Iniciar consulta (HU-31 c5)', () => {
  it('en sus citas agendadas lleva a la consulta con el paciente y el citaId', async () => {
    listarAgenda.mockResolvedValue([cita({ citaId: 15, pacienteId: 40 })])
    render(<AgendaPage />)

    const enlace = await screen.findByRole('link', { name: 'Iniciar consulta' })
    const href = new URL(enlace.getAttribute('href') ?? '', 'http://localhost')
    expect(href.pathname).toBe('/consultas')
    expect(href.searchParams.get('citaId')).toBe('15')
    expect(href.searchParams.get('pacienteId')).toBe('40')
  })

  it('no se ofrece en una cita ya atendida', async () => {
    listarAgenda.mockResolvedValue([cita({ estado: 'ATENDIDA' })])
    render(<AgendaPage />)

    await screen.findByRole('listitem', { name: /Cita de Rosa Martínez/ })
    expect(screen.queryByRole('link', { name: 'Iniciar consulta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).toBeNull()
  })
})

describe('agenda · cancelar (HU-32)', () => {
  it('c1 y c5: cancelar exige motivo y la cita sigue en la lista, cancelada y con su motivo', async () => {
    const user = userEvent.setup()
    listarAgenda.mockResolvedValueOnce([cita({})])
    const cancelada = cita({ estado: 'CANCELADA', motivoCancelacion: 'Viaje del paciente' })
    cancelarCita.mockResolvedValue(cancelada)
    render(<AgendaPage />)

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo debe tener entre 10 y 500 caracteres.')
    expect(cancelarCita).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/Motivo/), 'Viaje')
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo debe tener entre 10 y 500 caracteres.')
    expect(cancelarCita).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText(/Motivo/))

    listarAgenda.mockResolvedValue([cancelada])
    await user.type(screen.getByLabelText(/Motivo/), 'Viaje del paciente')
    await user.click(screen.getByRole('button', { name: 'Cancelar la cita' }))

    expect(cancelarCita).toHaveBeenCalledWith(1, 'Viaje del paciente')
    const fila = await screen.findByRole('listitem', { name: /Cita de Rosa Martínez/ })
    expect(within(fila).getByText('Cancelada')).toBeVisible()
    expect(within(fila).getByText('Motivo: Viaje del paciente')).toBeVisible()
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
