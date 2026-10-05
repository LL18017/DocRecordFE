// HU-13 · Condiciones hereditarias: una prueba por criterio de aceptación.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  agruparPorParentesco,
  PARENTESCOS,
  type CondicionHereditariaDto,
  type CrearCondicionHereditariaPayload,
} from '@/services/antecedentes'
import { SeccionCondicionesHereditarias } from './SeccionCondicionesHereditarias'

const listarCondicionesHereditarias = vi.fn<(pacienteId: number) => Promise<CondicionHereditariaDto[]>>()
const crearCondicionHereditaria = vi.fn<(p: CrearCondicionHereditariaPayload) => Promise<CondicionHereditariaDto>>()

vi.mock('@/services/antecedentes', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/antecedentes')>()
  return {
    ...real,
    listarCondicionesHereditarias: (id: number) => listarCondicionesHereditarias(id),
    crearCondicionHereditaria: (p: CrearCondicionHereditariaPayload) => crearCondicionHereditaria(p),
  }
})

function condicion(parcial: Partial<CondicionHereditariaDto>): CondicionHereditariaDto {
  return {
    condicionHereditariaId: 1,
    pacienteId: 7,
    nombre: 'Hipertensión',
    parentesco: 'PADRE',
    observaciones: null,
    ...parcial,
  }
}

beforeEach(() => {
  listarCondicionesHereditarias.mockReset()
  crearCondicionHereditaria.mockReset()
  listarCondicionesHereditarias.mockResolvedValue([])
})

async function montar(puedeEditar: boolean) {
  const user = userEvent.setup()
  render(
    <SeccionCondicionesHereditarias pacienteId={7} puedeEditar={puedeEditar} expanded onToggle={() => {}} />,
  )
  await vi.waitFor(() => expect(screen.queryByText(/Cargando condiciones/)).toBeNull())
  return user
}

describe('HU-13 · condiciones hereditarias', () => {
  it('c1: el médico registra una condición con el parentesco y queda visible', async () => {
    crearCondicionHereditaria.mockImplementation(async (p) =>
      condicion({ condicionHereditariaId: 4, nombre: p.nombre, parentesco: p.parentesco }),
    )
    const user = await montar(true)

    await user.click(screen.getByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nueva condición hereditaria' })
    await user.type(within(form).getByLabelText(/^condición/i), 'Glaucoma')
    await user.selectOptions(within(form).getByLabelText(/^parentesco/i), 'ABUELA')
    await user.click(within(form).getByRole('button', { name: 'Guardar condición' }))

    expect(crearCondicionHereditaria).toHaveBeenCalledWith({ pacienteId: 7, nombre: 'Glaucoma', parentesco: 'ABUELA' })
    expect(await screen.findByText('Glaucoma')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Abuela' })).toBeVisible()
  })

  it('c2: el parentesco solo ofrece los valores de la lista controlada, y es obligatorio', async () => {
    const user = await montar(true)
    await user.click(screen.getByRole('button', { name: '+ Agregar' }))

    const opciones = within(screen.getByLabelText(/^parentesco/i))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(opciones).toEqual(['PADRE', 'MADRE', 'ABUELO', 'ABUELA', 'HERMANO', 'HERMANA', 'OTRO'])

    await user.type(screen.getByLabelText(/^condición/i), 'Asma')
    await user.click(screen.getByRole('button', { name: 'Guardar condición' }))
    expect(crearCondicionHereditaria).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/parentesco/)
  })

  it('c3: varias condiciones aparecen agrupadas por parentesco', async () => {
    listarCondicionesHereditarias.mockResolvedValue([
      condicion({ condicionHereditariaId: 1, nombre: 'Diabetes', parentesco: 'PADRE' }),
      condicion({ condicionHereditariaId: 2, nombre: 'Hipertensión', parentesco: 'PADRE' }),
      condicion({ condicionHereditariaId: 3, nombre: 'Asma', parentesco: 'HERMANA' }),
    ])
    await montar(false)

    const grupos = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(grupos).toEqual(['Padre', 'Hermana'])

    const padre = screen.getByRole('heading', { name: 'Padre' }).parentElement as HTMLElement
    expect(within(padre).getByText('Diabetes')).toBeVisible()
    expect(within(padre).getByText('Hipertensión')).toBeVisible()
    expect(within(padre).queryByText('Asma')).toBeNull()
  })

  it('c4: la enfermera la consulta pero no la modifica', async () => {
    listarCondicionesHereditarias.mockResolvedValue([condicion({ nombre: 'Glaucoma' })])
    await montar(false)

    expect(screen.getByText('Glaucoma')).toBeVisible()
    expect(screen.queryByRole('button', { name: /agregar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull()
  })

  it('sin condiciones muestra un estado vacío, no un error', async () => {
    await montar(true)
    expect(screen.getByText(/No hay condiciones hereditarias registradas/)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('agruparPorParentesco', () => {
  it('sigue el orden de la lista controlada y omite los grupos vacíos', () => {
    const grupos = agruparPorParentesco([
      condicion({ condicionHereditariaId: 1, parentesco: 'OTRO' }),
      condicion({ condicionHereditariaId: 2, parentesco: 'MADRE' }),
      condicion({ condicionHereditariaId: 3, parentesco: 'MADRE' }),
    ])
    expect(grupos.map((g) => g.parentesco)).toEqual(['MADRE', 'OTRO'])
    expect(grupos[0].condiciones).toHaveLength(2)
    expect(PARENTESCOS).toHaveLength(7)
  })
})
