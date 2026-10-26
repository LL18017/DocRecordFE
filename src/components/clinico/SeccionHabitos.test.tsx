import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HabitoDto, HabitoPayload, TipoDeHabitoDto } from '@/services/habitos'
import { SeccionHabitos } from './SeccionHabitos'

const listarHabitos = vi.fn<(pacienteId: number) => Promise<HabitoDto[]>>()
const listarTiposDeHabito = vi.fn<() => Promise<TipoDeHabitoDto[]>>()
const registrarHabito = vi.fn<(p: HabitoPayload) => Promise<HabitoDto>>()

vi.mock('@/services/habitos', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/habitos')>()
  return {
    ...real,
    listarHabitos: (id: number) => listarHabitos(id),
    listarTiposDeHabito: () => listarTiposDeHabito(),
    registrarHabito: (p: HabitoPayload) => registrarHabito(p),
  }
})

const TABACO = { id: 1, descripcion: 'Tabaquismo' }
const EJERCICIO = { id: 2, descripcion: 'Actividad física' }

function habito(parcial: Partial<HabitoDto>): HabitoDto {
  return { id: 1, descripcion: 'Camina 30 minutos', nivel: 'BAJO', pacienteId: 7, tipoHabito: EJERCICIO, ...parcial }
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
  listarHabitos.mockResolvedValue([])
  listarTiposDeHabito.mockResolvedValue([TABACO, EJERCICIO])
})

describe('hábitos (HU-14)', () => {
  it('c1: pide los hábitos de ESTE paciente y registra uno con tipo, nivel y descripción', async () => {
    const user = userEvent.setup()
    registrarHabito.mockImplementation(async (p) =>
      habito({ id: 9, tipoHabito: TABACO, nivel: p.nivel, descripcion: p.descripcion }),
    )
    montar()

    await user.click(await screen.findByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nuevo hábito' })
    await user.selectOptions(within(form).getByLabelText(/Tipo de hábito/), '1')
    await user.selectOptions(within(form).getByLabelText(/Nivel de riesgo/), 'ALTO')
    await user.type(within(form).getByLabelText(/Descripción/), 'Fuma 10 cigarrillos al día')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(listarHabitos).toHaveBeenCalledWith(7)
    expect(registrarHabito).toHaveBeenCalledWith({
      pacienteId: 7,
      tipoHabitoId: 1,
      nivel: 'ALTO',
      descripcion: 'Fuma 10 cigarrillos al día',
    })
    expect(await screen.findByText('Fuma 10 cigarrillos al día')).toBeVisible()
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
