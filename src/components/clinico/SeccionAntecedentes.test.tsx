// HU-12 · Antecedentes patológicos: una prueba por criterio de aceptación.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { AntecedenteDto, CrearAntecedentePayload } from '@/services/antecedentes'
import { SeccionAntecedentes } from './SeccionAntecedentes'

const listarAntecedentes = vi.fn<(pacienteId: number) => Promise<AntecedenteDto[]>>()
const crearAntecedente = vi.fn<(p: CrearAntecedentePayload) => Promise<AntecedenteDto>>()
const eliminarAntecedente = vi.fn<(id: number) => Promise<void>>()

vi.mock('@/services/antecedentes', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/antecedentes')>()
  return {
    ...real,
    listarAntecedentes: (id: number) => listarAntecedentes(id),
    crearAntecedente: (p: CrearAntecedentePayload) => crearAntecedente(p),
    eliminarAntecedente: (id: number) => eliminarAntecedente(id),
  }
})

function antecedente(parcial: Partial<AntecedenteDto>): AntecedenteDto {
  return {
    antecedenteId: 1,
    pacienteId: 7,
    tipo: 'ENFERMEDAD',
    descripcion: 'Asma bronquial',
    fecha: '2015-02-10',
    estado: 'ACTIVO',
    registradoPor: 'Ana Médica',
    registradoEn: '2026-10-03T09:00:00',
    ...parcial,
  }
}

beforeEach(() => {
  listarAntecedentes.mockReset()
  crearAntecedente.mockReset()
  eliminarAntecedente.mockReset()
  listarAntecedentes.mockResolvedValue([])
})

/** Monta la sección desplegada y espera a que termine de cargar. */
async function montar(puedeEditar: boolean) {
  const user = userEvent.setup()
  render(<SeccionAntecedentes pacienteId={7} puedeEditar={puedeEditar} expanded onToggle={() => {}} />)
  await vi.waitFor(() => expect(screen.queryByText(/Cargando antecedentes/)).toBeNull())
  return user
}

describe('HU-12 · antecedentes patológicos', () => {
  it('c1: el médico registra un antecedente con tipo, descripción, fecha y estado', async () => {
    crearAntecedente.mockImplementation(async (p) =>
      antecedente({ antecedenteId: 9, tipo: p.tipo, descripcion: p.descripcion, fecha: p.fecha, estado: p.estado }),
    )
    const user = await montar(true)

    await user.click(screen.getByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nuevo antecedente patológico' })
    await user.selectOptions(within(form).getByLabelText(/^tipo/i), 'CIRUGIA')
    await user.type(within(form).getByLabelText(/^fecha/i), '2019-03-14')
    await user.selectOptions(within(form).getByLabelText(/^estado/i), 'RESUELTO')
    await user.type(within(form).getByLabelText(/^descripción/i), 'Apendicectomía')
    await user.click(within(form).getByRole('button', { name: 'Guardar antecedente' }))

    expect(crearAntecedente).toHaveBeenCalledWith({
      pacienteId: 7,
      tipo: 'CIRUGIA',
      descripcion: 'Apendicectomía',
      fecha: '2019-03-14',
      estado: 'RESUELTO',
    })
    expect(await screen.findByText('Apendicectomía')).toBeVisible()
    expect(screen.getByText('Cirugía')).toBeVisible()
    expect(screen.getByText('Resuelto')).toBeVisible()
    expect(screen.getByText('14/03/2019')).toBeVisible()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('c1: sin descripción ni fecha no envía nada y lo dice', async () => {
    const user = await montar(true)
    await user.click(screen.getByRole('button', { name: '+ Agregar' }))
    await user.click(screen.getByRole('button', { name: 'Guardar antecedente' }))

    expect(crearAntecedente).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/obligatorias/)
  })

  it('c2: se listan del más reciente al más antiguo, y lo nuevo entra en su lugar', async () => {
    listarAntecedentes.mockResolvedValue([
      antecedente({ antecedenteId: 2, descripcion: 'Neumonía', fecha: '2022-11-20' }),
      antecedente({ antecedenteId: 1, descripcion: 'Varicela', fecha: '2001-06-01' }),
    ])
    crearAntecedente.mockResolvedValue(
      antecedente({ antecedenteId: 3, descripcion: 'Hipertensión', fecha: '2015-02-10' }),
    )
    const user = await montar(true)

    await user.click(screen.getByRole('button', { name: '+ Agregar' }))
    await user.type(screen.getByLabelText(/^fecha/i), '2015-02-10')
    await user.type(screen.getByLabelText(/^descripción/i), 'Hipertensión')
    await user.click(screen.getByRole('button', { name: 'Guardar antecedente' }))
    await screen.findByText('Hipertensión')

    const orden = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent)
    expect(orden).toEqual(['Neumonía', 'Hipertensión', 'Varicela'])
  })

  it('c3: la enfermera los consulta pero no ve cómo registrarlos ni eliminarlos', async () => {
    listarAntecedentes.mockResolvedValue([antecedente({ descripcion: 'Diabetes gestacional' })])
    await montar(false)

    expect(screen.getByText('Diabetes gestacional')).toBeVisible()
    expect(screen.queryByRole('button', { name: /agregar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull()
  })

  it('c4: sin antecedentes muestra un estado vacío explicativo, no un error', async () => {
    await montar(false)

    expect(screen.getByText(/No hay antecedentes patológicos registrados/)).toBeVisible()
    expect(screen.getByText(/Solo un médico puede registrarlos/)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('el médico elimina un antecedente solo después de confirmar', async () => {
    listarAntecedentes.mockResolvedValue([antecedente({ antecedenteId: 5, descripcion: 'Gastritis' })])
    eliminarAntecedente.mockResolvedValue(undefined)
    const user = await montar(true)

    await user.click(screen.getByRole('button', { name: 'Eliminar antecedente: Gastritis' }))
    expect(eliminarAntecedente).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(eliminarAntecedente).toHaveBeenCalledWith(5)
    await vi.waitFor(() => expect(screen.queryByText('Gastritis')).toBeNull())
  })

  it('si no se pudo cargar, lo dice con el motivo y deja reintentar', async () => {
    listarAntecedentes.mockRejectedValueOnce(new ApiError(500, 'Error del servidor (500).'))
    const user = await montar(true)

    expect(screen.getByRole('alert')).toHaveTextContent('Error del servidor (500).')
    listarAntecedentes.mockResolvedValue([antecedente({ descripcion: 'Rinitis' })])
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Rinitis')).toBeVisible()
  })
})
