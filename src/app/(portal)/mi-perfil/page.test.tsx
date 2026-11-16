// Mi perfil del paciente (DEF-07: HU-33 c4, HU-14 c4): sus datos, el
// interruptor de recordatorios de cita por correo y sus hábitos en solo
// lectura. La guarda de ruta (un médico no entra) está en
// app/(portal)/layout.test.tsx y en lib/rutas.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { HabitoDto } from '@/services/habitos'
import type { MiPerfilDto } from '@/services/miPerfil'
import MiPerfilPage from './page'

const obtenerMiPerfil = vi.fn<() => Promise<MiPerfilDto>>()
const actualizarRecordatorios = vi.fn<(recibe: boolean) => Promise<MiPerfilDto>>()
const listarMisHabitos = vi.fn<() => Promise<HabitoDto[]>>()

vi.mock('@/services/miPerfil', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/miPerfil')>()
  return {
    ...real,
    // Sin argumentos: el perfil es el de la sesión, nunca el de un id.
    obtenerMiPerfil: (...args: unknown[]) => {
      expect(args).toEqual([])
      return obtenerMiPerfil()
    },
    actualizarRecordatorios: (recibe: boolean) => actualizarRecordatorios(recibe),
    listarMisHabitos: (...args: unknown[]) => {
      expect(args).toEqual([])
      return listarMisHabitos()
    },
  }
})

function perfil(cambios: Partial<MiPerfilDto> = {}): MiPerfilDto {
  return {
    pacienteId: 7,
    expediente: '2026-000007',
    nombres: 'Juan Carlos',
    apellidos: 'López Martínez',
    correo: 'juan@example.com',
    telefono: null,
    recibeRecordatorios: true,
    ...cambios,
  }
}

function habito(cambios: Partial<HabitoDto> = {}): HabitoDto {
  return {
    id: 51,
    descripcion: 'Fuma desde los 20 años',
    nivel: 'ALTO',
    frecuencia: 'Diaria',
    observaciones: 'Media cajetilla',
    actualizadoEn: '2026-11-15T10:20:30',
    actualizadoPor: 'Ana Pérez',
    pacienteId: 7,
    tipoHabito: { id: 1, descripcion: 'Tabaquismo' },
    estado: 'ACTIVO',
    motivoAnulacion: null,
    anuladoEn: null,
    anuladoPor: null,
    ...cambios,
  }
}

beforeEach(() => {
  obtenerMiPerfil.mockReset()
  actualizarRecordatorios.mockReset()
  listarMisHabitos.mockReset()
  obtenerMiPerfil.mockResolvedValue(perfil())
  listarMisHabitos.mockResolvedValue([])
})

describe('Mi perfil del paciente (DEF-07)', () => {
  it('carga y muestra sus datos básicos', async () => {
    render(<MiPerfilPage />)

    expect(await screen.findByRole('heading', { name: 'Mis datos' })).toBeVisible()
    expect(screen.getAllByText('Juan Carlos López Martínez').length).toBeGreaterThan(0)
    expect(screen.getByText('juan@example.com')).toBeVisible()
    expect(screen.getAllByText(/2026-000007/).length).toBeGreaterThan(0)
    // El teléfono que no tiene no se inventa.
    expect(screen.getByText('No registrado')).toBeVisible()
    expect(obtenerMiPerfil).toHaveBeenCalledTimes(1)
  })

  it('si el perfil no carga, dice por qué', async () => {
    obtenerMiPerfil.mockRejectedValue(new ApiError(403, 'Su cuenta no está vinculada a un expediente de paciente'))
    render(<MiPerfilPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Su cuenta no está vinculada a un expediente de paciente')
  })

  it('el interruptor es accesible y refleja la preferencia guardada', async () => {
    obtenerMiPerfil.mockResolvedValue(perfil({ recibeRecordatorios: false }))
    render(<MiPerfilPage />)

    const interruptor = await screen.findByRole('switch', { name: 'Recibir recordatorios de citas por correo' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')
  })

  it('al apagarlo llama al servicio, refleja el estado nuevo y lo confirma', async () => {
    const user = userEvent.setup()
    actualizarRecordatorios.mockResolvedValue(perfil({ recibeRecordatorios: false }))
    render(<MiPerfilPage />)

    const interruptor = await screen.findByRole('switch', { name: 'Recibir recordatorios de citas por correo' })
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
    await user.click(interruptor)

    expect(actualizarRecordatorios).toHaveBeenCalledWith(false)
    await waitFor(() => expect(interruptor).toHaveAttribute('aria-checked', 'false'))
    expect(screen.getByRole('status')).toHaveTextContent(/ya no te enviaremos recordatorios/)
  })

  it('al encenderlo llama al servicio con true', async () => {
    const user = userEvent.setup()
    obtenerMiPerfil.mockResolvedValue(perfil({ recibeRecordatorios: false }))
    actualizarRecordatorios.mockResolvedValue(perfil({ recibeRecordatorios: true }))
    render(<MiPerfilPage />)

    const interruptor = await screen.findByRole('switch', { name: 'Recibir recordatorios de citas por correo' })
    await user.click(interruptor)

    expect(actualizarRecordatorios).toHaveBeenCalledWith(true)
    await waitFor(() => expect(interruptor).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('status')).toHaveTextContent(/te enviaremos un recordatorio/)
  })

  it('si el servidor no lo guarda, el interruptor se queda como estaba y se ve el mensaje', async () => {
    const user = userEvent.setup()
    actualizarRecordatorios.mockRejectedValue(
      new ApiError(400, 'Indique si desea recibir recordatorios (true o false)'),
    )
    render(<MiPerfilPage />)

    const interruptor = await screen.findByRole('switch', { name: 'Recibir recordatorios de citas por correo' })
    await user.click(interruptor)

    expect(await screen.findByRole('alert')).toHaveTextContent('Indique si desea recibir recordatorios (true o false)')
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
  })

  it('muestra sus hábitos en solo lectura, sin un solo control para cambiarlos', async () => {
    listarMisHabitos.mockResolvedValue([
      habito({ id: 1, nivel: 'BAJO', tipoHabito: { id: 2, descripcion: 'Actividad física' }, descripcion: 'Camina 30 minutos', observaciones: null }),
      habito(),
    ])
    render(<MiPerfilPage />)

    const lista = await screen.findByRole('list', { name: 'Mis hábitos' })
    const filas = await screen.findAllByRole('listitem')
    expect(lista).toBeVisible()
    // Riesgo alto primero.
    expect(filas[0]).toHaveTextContent('Tabaquismo')
    expect(filas[0]).toHaveTextContent('Riesgo alto')
    expect(filas[0]).toHaveTextContent('Frecuencia: Diaria')
    expect(filas[0]).toHaveTextContent('Observaciones: Media cajetilla')
    expect(filas[1]).toHaveTextContent('Camina 30 minutos')
    expect(listarMisHabitos).toHaveBeenCalledTimes(1)

    // Solo lectura: el único control de la pantalla es el interruptor.
    expect(screen.queryByRole('button', { name: /Editar|Anular|Eliminar|Agregar/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('sin hábitos lo dice', async () => {
    render(<MiPerfilPage />)

    expect(await screen.findByText('No tienes hábitos registrados.')).toBeVisible()
  })
})
