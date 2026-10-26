import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HabitoDto, HabitoHistorialDto, HabitoPayload, TipoDeHabitoDto } from '@/services/habitos'
import { SeccionHabitos } from './SeccionHabitos'

const listarHabitos = vi.fn<(pacienteId: number) => Promise<HabitoDto[]>>()
const listarTiposDeHabito = vi.fn<() => Promise<TipoDeHabitoDto[]>>()
const registrarHabito = vi.fn<(p: HabitoPayload) => Promise<HabitoDto>>()
const listarHistorialDeHabito = vi.fn<(id: number) => Promise<HabitoHistorialDto[]>>()

vi.mock('@/services/habitos', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/habitos')>()
  return {
    ...real,
    listarHabitos: (id: number) => listarHabitos(id),
    listarTiposDeHabito: () => listarTiposDeHabito(),
    registrarHabito: (p: HabitoPayload) => registrarHabito(p),
    listarHistorialDeHabito: (id: number) => listarHistorialDeHabito(id),
  }
})

const TABACO = { id: 1, descripcion: 'Tabaquismo' }
const EJERCICIO = { id: 2, descripcion: 'Actividad física' }

function habito(parcial: Partial<HabitoDto>): HabitoDto {
  return {
    id: 1,
    descripcion: 'Camina 30 minutos',
    nivel: 'BAJO',
    frecuencia: 'Diaria',
    observaciones: null,
    actualizadoEn: '2026-08-23T14:30:00',
    actualizadoPor: 'Juan Guerra',
    pacienteId: 7,
    tipoHabito: EJERCICIO,
    ...parcial,
  }
}

function version(parcial: Partial<HabitoHistorialDto>): HabitoHistorialDto {
  return {
    historialId: 1,
    habitoId: 1,
    tipoHabito: TABACO,
    descripcion: 'Fuma cigarrillos',
    nivel: 'ALTO',
    frecuencia: 'A diario',
    observaciones: null,
    actualizadoEn: '2026-03-02T09:15:00',
    actualizadoPor: 'Juan Guerra',
    reemplazadoEn: '2026-08-23T14:30:00',
    reemplazadoPor: 'Ana Pérez',
    ...parcial,
  }
}

function montar(props: Partial<React.ComponentProps<typeof SeccionHabitos>> = {}) {
  return render(
    <SeccionHabitos pacienteId={7} puedeEditar puedeEliminar expanded onToggle={() => {}} {...props} />,
  )
}

beforeEach(() => {
  listarHabitos.mockReset()
  listarTiposDeHabito.mockReset()
  registrarHabito.mockReset()
  listarHistorialDeHabito.mockReset()
  listarHistorialDeHabito.mockResolvedValue([])
  listarHabitos.mockResolvedValue([])
  listarTiposDeHabito.mockResolvedValue([TABACO, EJERCICIO])
})

describe('hábitos (HU-14)', () => {
  it('c1: pide los hábitos de ESTE paciente y registra uno con tipo, nivel, descripción, frecuencia y observaciones', async () => {
    const user = userEvent.setup()
    registrarHabito.mockImplementation(async (p) =>
      habito({
        id: 9,
        tipoHabito: TABACO,
        nivel: p.nivel,
        descripcion: p.descripcion,
        frecuencia: p.frecuencia,
        observaciones: p.observaciones ?? null,
      }),
    )
    montar()

    await user.click(await screen.findByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nuevo hábito' })
    await user.selectOptions(within(form).getByLabelText(/Tipo de hábito/), '1')
    await user.selectOptions(within(form).getByLabelText(/Nivel de riesgo/), 'ALTO')
    await user.type(within(form).getByLabelText(/Descripción/), 'Fuma cigarrillos')
    await user.type(within(form).getByLabelText(/Frecuencia/), '10 al día')
    await user.type(within(form).getByLabelText(/Observaciones/), 'Desde hace 5 años')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(listarHabitos).toHaveBeenCalledWith(7)
    expect(registrarHabito).toHaveBeenCalledWith({
      pacienteId: 7,
      tipoHabitoId: 1,
      nivel: 'ALTO',
      descripcion: 'Fuma cigarrillos',
      frecuencia: '10 al día',
      observaciones: 'Desde hace 5 años',
    })
    expect(await screen.findByText('Fuma cigarrillos')).toBeVisible()
    expect(screen.getByText('Desde hace 5 años')).toBeVisible()
  })

  it('c1: la frecuencia es obligatoria y las observaciones no viajan si están en blanco', async () => {
    const user = userEvent.setup()
    registrarHabito.mockImplementation(async (p) => habito({ id: 9, frecuencia: p.frecuencia }))
    montar()

    await user.click(await screen.findByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nuevo hábito' })
    await user.selectOptions(within(form).getByLabelText(/Tipo de hábito/), '2')
    await user.selectOptions(within(form).getByLabelText(/Nivel de riesgo/), 'BAJO')
    await user.type(within(form).getByLabelText(/Descripción/), 'Camina')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent(/frecuencia/)
    expect(registrarHabito).not.toHaveBeenCalled()

    await user.type(within(form).getByLabelText(/Frecuencia/), '  3 veces por semana ')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(registrarHabito).toHaveBeenCalledTimes(1)
    const enviado = registrarHabito.mock.calls[0][0]
    expect(enviado.frecuencia).toBe('3 veces por semana')
    expect(enviado).not.toHaveProperty('observaciones')
  })

  it('c1: cada hábito muestra su frecuencia, sus observaciones y cuándo y quién lo actualizó', async () => {
    listarHabitos.mockResolvedValue([
      habito({ frecuencia: '3 veces por semana', observaciones: 'Trota en el parque' }),
      habito({ id: 2, descripcion: 'Dieta', actualizadoPor: null }),
    ])
    montar()

    const filas = await screen.findAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Frecuencia: 3 veces por semana')
    expect(filas[0]).toHaveTextContent('Observaciones: Trota en el parque')
    expect(filas[0]).toHaveTextContent(/Actualizado el .*2026.* por Juan Guerra/)
    // Un hábito anterior a que se guardara el autor no inventa uno.
    expect(filas[1]).toHaveTextContent(/Actualizado el .*2026/)
    expect(filas[1]).not.toHaveTextContent(/ por /)
    expect(filas[1]).not.toHaveTextContent('Observaciones:')
  })

  it('c2: «Ver historial» muestra las versiones anteriores con sus fechas, la más reciente primero', async () => {
    const user = userEvent.setup()
    listarHabitos.mockResolvedValue([habito({ id: 4, tipoHabito: TABACO, nivel: 'BAJO', descripcion: 'Dejó de fumar', frecuencia: 'Nunca' })])
    listarHistorialDeHabito.mockResolvedValue([
      version({ historialId: 2, nivel: 'MODERADO', frecuencia: '3 veces por semana', actualizadoEn: '2026-06-10T10:00:00' }),
      version({ historialId: 1, nivel: 'ALTO', frecuencia: 'A diario', actualizadoEn: '2026-03-02T09:15:00' }),
    ])
    montar()

    await user.click(await screen.findByRole('button', { name: /Ver historial del hábito: Tabaquismo/ }))

    expect(listarHistorialDeHabito).toHaveBeenCalledWith(4)
    const historial = await screen.findByLabelText('Historial de Tabaquismo')
    const versiones = await within(historial).findAllByRole('listitem')
    expect(versiones).toHaveLength(2)
    expect(versiones[0]).toHaveTextContent('Frecuencia: 3 veces por semana')
    expect(versiones[0]).toHaveTextContent('Riesgo moderado')
    expect(versiones[1]).toHaveTextContent('Frecuencia: A diario')
    expect(versiones[1]).toHaveTextContent('Riesgo alto')
    expect(versiones[1]).toHaveTextContent(/2026/)
    expect(versiones[1]).toHaveTextContent('Reemplazado el')
    expect(versiones[1]).toHaveTextContent('por Ana Pérez')

    // Se cierra con el mismo botón.
    await user.click(screen.getByRole('button', { name: /Ocultar historial del hábito: Tabaquismo/ }))
    expect(screen.queryByLabelText('Historial de Tabaquismo')).toBeNull()
  })

  it('c2: un hábito que nunca se editó lo dice, y quien solo consulta también puede ver el historial', async () => {
    const user = userEvent.setup()
    listarHabitos.mockResolvedValue([habito({})])
    montar({ puedeEditar: false, puedeEliminar: false })

    await user.click(await screen.findByRole('button', { name: /Ver historial del hábito/ }))

    expect(await screen.findByText(/no hay versiones anteriores/)).toBeVisible()
  })

  it('c2: si el historial no carga, lo dice', async () => {
    const user = userEvent.setup()
    listarHabitos.mockResolvedValue([habito({})])
    listarHistorialDeHabito.mockRejectedValue(new Error('Sin conexión'))
    montar()

    await user.click(await screen.findByRole('button', { name: /Ver historial del hábito/ }))

    expect(await screen.findByText('Sin conexión')).toBeVisible()
  })

  it('c3: los de riesgo alto salen primero y destacados', async () => {
    listarHabitos.mockResolvedValue([
      habito({ id: 1 }),
      habito({ id: 2, tipoHabito: TABACO, nivel: 'ALTO', descripcion: 'Fuma a diario' }),
    ])
    montar()

    const filas = await screen.findAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Tabaquismo')
    expect(within(filas[0]).getByText('Riesgo alto')).toBeVisible()
    expect(filas[0].className).toMatch(/red/)
  })

  it('el administrador consulta, pero no ve botones para cambiar nada', async () => {
    listarHabitos.mockResolvedValue([habito({})])
    montar({ puedeEditar: false, puedeEliminar: false })

    expect(await screen.findByText('Camina 30 minutos')).toBeVisible()
    expect(screen.queryByRole('button', { name: '+ Agregar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull()
  })

  it('sin tipos en el catálogo no ofrece un formulario que no se puede llenar', async () => {
    listarTiposDeHabito.mockResolvedValue([])
    montar()

    expect(await screen.findByText(/No hay tipos de hábito en el catálogo/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '+ Agregar' })).toBeNull()
  })
})
