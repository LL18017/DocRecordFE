// DEF-01 (HU-14 y HU-30) · pantalla de catálogos del Administrador.
//
// Dos secciones, tipos de cita y tipos de hábito, cada una con su lista, su
// alta, su edición y su borrado. Lo que se fija aquí: que lista lo que manda el
// servidor (ordenado), que crea con el cuerpo que espera cada endpoint —que no
// es el mismo—, y que un rechazo del backend se muestra con SU mensaje.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type {
  GuardarTipoDeCitaPayload,
  GuardarTipoDeHabitoPayload,
  TipoDeCitaDto,
  TipoDeHabitoDto,
} from '@/services/catalogos'
import CatalogosPage from './page'

const listarTiposDeCita = vi.fn<() => Promise<TipoDeCitaDto[]>>()
const crearTipoDeCita = vi.fn<(p: GuardarTipoDeCitaPayload) => Promise<TipoDeCitaDto>>()
const actualizarTipoDeCita =
  vi.fn<(id: number, p: GuardarTipoDeCitaPayload) => Promise<TipoDeCitaDto>>()
const eliminarTipoDeCita = vi.fn<(id: number) => Promise<void>>()
const listarTiposDeHabito = vi.fn<() => Promise<TipoDeHabitoDto[]>>()
const crearTipoDeHabito = vi.fn<(p: GuardarTipoDeHabitoPayload) => Promise<TipoDeHabitoDto>>()
const actualizarTipoDeHabito =
  vi.fn<(id: number, p: GuardarTipoDeHabitoPayload) => Promise<TipoDeHabitoDto>>()
const eliminarTipoDeHabito = vi.fn<(id: number) => Promise<void>>()

vi.mock('@/services/catalogos', async (importarOriginal) => {
  // Los ayudantes (orden, duplicados, topes) se dejan reales: la pantalla los usa.
  const real = await importarOriginal<typeof import('@/services/catalogos')>()
  return {
    ...real,
    listarTiposDeCita: () => listarTiposDeCita(),
    crearTipoDeCita: (p: GuardarTipoDeCitaPayload) => crearTipoDeCita(p),
    actualizarTipoDeCita: (id: number, p: GuardarTipoDeCitaPayload) => actualizarTipoDeCita(id, p),
    eliminarTipoDeCita: (id: number) => eliminarTipoDeCita(id),
    listarTiposDeHabito: () => listarTiposDeHabito(),
    crearTipoDeHabito: (p: GuardarTipoDeHabitoPayload) => crearTipoDeHabito(p),
    actualizarTipoDeHabito: (id: number, p: GuardarTipoDeHabitoPayload) =>
      actualizarTipoDeHabito(id, p),
    eliminarTipoDeHabito: (id: number) => eliminarTipoDeHabito(id),
  }
})

const CONTROL: TipoDeCitaDto = { tipoCitaId: 2, nombre: 'Control', descripcion: 'Seguimiento' }
const GENERAL: TipoDeCitaDto = { tipoCitaId: 1, nombre: 'Consulta general', descripcion: null }
const TABAQUISMO: TipoDeHabitoDto = { id: 7, descripcion: 'Tabaquismo' }

beforeEach(() => {
  for (const f of [
    listarTiposDeCita,
    crearTipoDeCita,
    actualizarTipoDeCita,
    eliminarTipoDeCita,
    listarTiposDeHabito,
    crearTipoDeHabito,
    actualizarTipoDeHabito,
    eliminarTipoDeHabito,
  ]) {
    f.mockReset()
  }
  listarTiposDeCita.mockResolvedValue([CONTROL, GENERAL])
  listarTiposDeHabito.mockResolvedValue([TABAQUISMO])
})

function seccion(titulo: string): HTMLElement {
  return screen.getByRole('region', { name: titulo })
}

async function montar() {
  const user = userEvent.setup()
  render(<CatalogosPage />)
  await screen.findByRole('list', { name: 'Tipos de cita' })
  await screen.findByRole('list', { name: 'Tipos de hábito' })
  return user
}

describe('catálogos · listar', () => {
  it('muestra las dos secciones con lo que manda el servidor, en orden alfabético', async () => {
    await montar()

    const citas = within(seccion('Tipos de cita')).getAllByRole('listitem')
    expect(citas.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Consulta general'),
      expect.stringContaining('Control'),
    ])
    expect(within(seccion('Tipos de cita')).getByText('Seguimiento')).toBeInTheDocument()
    expect(within(seccion('Tipos de hábito')).getByText('Tabaquismo')).toBeInTheDocument()
  })

  it('una lista vacía lo dice en vez de quedarse en blanco', async () => {
    listarTiposDeHabito.mockResolvedValue([])
    render(<CatalogosPage />)

    expect(await screen.findByText(/No hay tipos de hábito/)).toBeInTheDocument()
  })

  it('si no se pudo cargar, muestra el mensaje del backend', async () => {
    listarTiposDeCita.mockRejectedValue(
      new ApiError(403, 'No tienes permisos para realizar esta acción'),
    )
    render(<CatalogosPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes permisos para realizar esta acción',
    )
  })
})

describe('catálogos · crear', () => {
  it('crea un tipo de cita con nombre y descripción, y lo agrega a la lista', async () => {
    crearTipoDeCita.mockResolvedValue({
      tipoCitaId: 3,
      nombre: 'Emergencia',
      descripcion: 'Atención inmediata',
    })
    const user = await montar()
    const citas = seccion('Tipos de cita')

    await user.type(within(citas).getByLabelText(/^Nombre/), 'Emergencia')
    await user.type(within(citas).getByLabelText(/Descripción/), 'Atención inmediata')
    await user.click(within(citas).getByRole('button', { name: /Agregar/ }))

    expect(crearTipoDeCita).toHaveBeenCalledWith({
      nombre: 'Emergencia',
      descripcion: 'Atención inmediata',
    })
    expect(await within(citas).findByText('Emergencia')).toBeInTheDocument()
  })

  it('crea un tipo de hábito mandando el nombre como `descripcion`, que es como lo llama el backend', async () => {
    crearTipoDeHabito.mockResolvedValue({ id: 8, descripcion: 'Alcohol' })
    const user = await montar()
    const habitos = seccion('Tipos de hábito')

    await user.type(within(habitos).getByLabelText(/Nombre del hábito/), 'Alcohol')
    await user.click(within(habitos).getByRole('button', { name: /Agregar/ }))

    expect(crearTipoDeHabito).toHaveBeenCalledWith({ descripcion: 'Alcohol' })
    expect(await within(habitos).findByText('Alcohol')).toBeInTheDocument()
  })

  it('no envía un nombre vacío ni uno repetido', async () => {
    const user = await montar()
    const citas = seccion('Tipos de cita')

    await user.click(within(citas).getByRole('button', { name: /Agregar/ }))
    expect(within(citas).getByRole('alert')).toHaveTextContent(/obligatorio/i)

    await user.type(within(citas).getByLabelText(/^Nombre/), 'CONTROL')
    await user.click(within(citas).getByRole('button', { name: /Agregar/ }))
    expect(within(citas).getByRole('alert')).toHaveTextContent(/Ya existe/)

    expect(crearTipoDeCita).not.toHaveBeenCalled()
  })

  it('muestra el mensaje del backend cuando rechaza el alta', async () => {
    crearTipoDeHabito.mockRejectedValue(
      new ApiError(400, 'La descripción no puede superar 255 caracteres'),
    )
    const user = await montar()
    const habitos = seccion('Tipos de hábito')

    await user.type(within(habitos).getByLabelText(/Nombre del hábito/), 'Sedentarismo')
    await user.click(within(habitos).getByRole('button', { name: /Agregar/ }))

    expect(await within(habitos).findByRole('alert')).toHaveTextContent(
      'La descripción no puede superar 255 caracteres',
    )
    expect(within(habitos).queryByText('Sedentarismo', { selector: 'li p' })).not.toBeInTheDocument()
  })
})

describe('catálogos · editar y eliminar', () => {
  it('edita un tipo de cita y refleja lo que devolvió el servidor', async () => {
    actualizarTipoDeCita.mockResolvedValue({ ...CONTROL, nombre: 'Control crónico' })
    const user = await montar()
    const citas = seccion('Tipos de cita')

    await user.click(within(citas).getByRole('button', { name: 'Editar Control' }))
    const nombre = within(citas).getByLabelText(/^Nombre/)
    expect(nombre).toHaveValue('Control')
    await user.clear(nombre)
    await user.type(nombre, 'Control crónico')
    await user.click(within(citas).getByRole('button', { name: 'Guardar cambios' }))

    expect(actualizarTipoDeCita).toHaveBeenCalledWith(2, {
      nombre: 'Control crónico',
      descripcion: 'Seguimiento',
    })
    expect(await within(citas).findByText('Control crónico')).toBeInTheDocument()
  })

  it('elimina tras confirmar, y lo quita de la lista', async () => {
    eliminarTipoDeHabito.mockResolvedValue(undefined)
    const user = await montar()

    await user.click(
      within(seccion('Tipos de hábito')).getByRole('button', { name: 'Eliminar Tabaquismo' }),
    )
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(eliminarTipoDeHabito).toHaveBeenCalledWith(7)
    await waitFor(() =>
      expect(within(seccion('Tipos de hábito')).queryByText('Tabaquismo')).not.toBeInTheDocument(),
    )
  })

  it('si el tipo está en uso, muestra el mensaje del backend y lo deja en la lista', async () => {
    eliminarTipoDeHabito.mockRejectedValue(
      new ApiError(400, 'No se puede eliminar el tipo de hábito porque tiene registros asociados'),
    )
    const user = await montar()

    await user.click(
      within(seccion('Tipos de hábito')).getByRole('button', { name: 'Eliminar Tabaquismo' }),
    )
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    const habitos = seccion('Tipos de hábito')
    expect(await within(habitos).findByRole('alert')).toHaveTextContent(
      'No se puede eliminar el tipo de hábito porque tiene registros asociados',
    )
    expect(within(habitos).getByText('Tabaquismo')).toBeInTheDocument()
  })
})
