// HU-11 · Alergias del paciente: una prueba por criterio de aceptación, más
// los permisos y el aviso de arriba de la ficha.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import {
  ordenarPorSeveridad,
  SEVERIDADES,
  type AlergiaDto,
  type CrearAlergiaPayload,
} from '@/services/alergias'
import { AvisoDeAlergiasSeveras, SeccionAlergias, type AlergiasConocidas } from './SeccionAlergias'

const listarAlergias = vi.fn<(pacienteId: number) => Promise<AlergiaDto[]>>()
const crearAlergia = vi.fn<(p: CrearAlergiaPayload) => Promise<AlergiaDto>>()
const eliminarAlergia = vi.fn<(id: number) => Promise<void>>()

vi.mock('@/services/alergias', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/alergias')>()
  return {
    ...real,
    listarAlergias: (id: number) => listarAlergias(id),
    crearAlergia: (p: CrearAlergiaPayload) => crearAlergia(p),
    eliminarAlergia: (id: number) => eliminarAlergia(id),
  }
})

function alergia(parcial: Partial<AlergiaDto>): AlergiaDto {
  return {
    alergiaId: 1,
    pacienteId: 7,
    sustancia: 'Ibuprofeno',
    reaccion: 'Prurito',
    severidad: 'LEVE',
    fechaDeteccion: '2021-07-02',
    registradaPor: 'Marta Guevara',
    registradaEn: '2026-10-01T09:15:00',
    eliminadaPor: null,
    eliminadaEn: null,
    ...parcial,
  }
}

beforeEach(() => {
  listarAlergias.mockReset()
  crearAlergia.mockReset()
  eliminarAlergia.mockReset()
  listarAlergias.mockResolvedValue([])
})

async function montar(puedeEditar: boolean, onCambio?: (a: AlergiasConocidas) => void) {
  const user = userEvent.setup()
  render(
    <SeccionAlergias pacienteId={7} puedeEditar={puedeEditar} expanded onToggle={() => {}} onCambio={onCambio} />,
  )
  await vi.waitFor(() => expect(screen.queryByText(/Cargando alergias/)).toBeNull())
  return user
}

async function llenarFormulario(
  user: ReturnType<typeof userEvent.setup>,
  datos: { sustancia: string; reaccion: string; severidad: string; fecha: string },
) {
  await user.click(screen.getByRole('button', { name: '+ Agregar' }))
  const form = screen.getByRole('form', { name: 'Nueva alergia' })
  await user.type(within(form).getByLabelText(/^sustancia/i), datos.sustancia)
  await user.type(within(form).getByLabelText(/^tipo de reacción/i), datos.reaccion)
  await user.selectOptions(within(form).getByLabelText(/^severidad/i), datos.severidad)
  await user.type(within(form).getByLabelText(/^fecha de detección/i), datos.fecha)
  return form
}

describe('HU-11 · alergias del paciente', () => {
  it('c1: se registra con sustancia, reacción, severidad y fecha, y queda visible en su sección', async () => {
    crearAlergia.mockImplementation(async (p) =>
      alergia({ alergiaId: 4, ...p, registradaPor: 'Sofía Recinos' }),
    )
    const user = await montar(true)

    const form = await llenarFormulario(user, {
      sustancia: 'Penicilina',
      reaccion: 'Anafilaxia',
      severidad: 'SEVERA',
      fecha: '2020-03-14',
    })
    await user.click(within(form).getByRole('button', { name: 'Guardar alergia' }))

    expect(crearAlergia).toHaveBeenCalledWith({
      pacienteId: 7,
      sustancia: 'Penicilina',
      reaccion: 'Anafilaxia',
      severidad: 'SEVERA',
      fechaDeteccion: '2020-03-14',
    })
    expect(await screen.findByText('Penicilina')).toBeVisible()
    expect(screen.getByText('Anafilaxia')).toBeVisible()
    expect(screen.getByText('Severa')).toBeVisible()
    expect(screen.getByText(/Detectada el 14\/03\/2020/)).toBeVisible()
    expect(screen.queryByRole('form', { name: 'Nueva alergia' })).toBeNull()
  })

  it('c1: la severidad es de lista cerrada y ningún dato es opcional', async () => {
    const user = await montar(true)
    await user.click(screen.getByRole('button', { name: '+ Agregar' }))

    const opciones = within(screen.getByLabelText(/^severidad/i))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(opciones).toEqual(['SEVERA', 'MODERADA', 'LEVE'])

    await user.type(screen.getByLabelText(/^sustancia/i), 'Látex')
    await user.click(screen.getByRole('button', { name: 'Guardar alergia' }))
    expect(crearAlergia).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/obligatorias/)
  })

  it('c2: las severas salen primero y resaltadas', async () => {
    listarAlergias.mockResolvedValue([
      alergia({ alergiaId: 1, sustancia: 'Sulfas', severidad: 'SEVERA' }),
      alergia({ alergiaId: 2, sustancia: 'Látex', severidad: 'MODERADA' }),
      alergia({ alergiaId: 3, sustancia: 'Polen', severidad: 'LEVE' }),
    ])
    await montar(false)

    const filas = screen.getAllByRole('listitem')
    expect(within(filas[0]).getByText('Sulfas')).toBeVisible()
    expect(within(filas[1]).getByText('Látex')).toBeVisible()
    expect(within(filas[2]).getByText('Polen')).toBeVisible()
    expect(filas[0].className).toMatch(/red/)
    expect(filas[2].className).not.toMatch(/red/)
  })

  it('c2: una severa recién agregada se coloca arriba sin recargar', async () => {
    listarAlergias.mockResolvedValue([alergia({ alergiaId: 1, sustancia: 'Polen', severidad: 'LEVE' })])
    crearAlergia.mockImplementation(async (p) => alergia({ alergiaId: 9, ...p }))
    const user = await montar(true)

    const form = await llenarFormulario(user, {
      sustancia: 'Yodo',
      reaccion: 'Edema de glotis',
      severidad: 'SEVERA',
      fecha: '2022-01-10',
    })
    await user.click(within(form).getByRole('button', { name: 'Guardar alergia' }))

    await screen.findByText('Yodo')
    const filas = screen.getAllByRole('listitem')
    expect(within(filas[0]).getByText('Yodo')).toBeVisible()
    expect(within(filas[1]).getByText('Polen')).toBeVisible()
    expect(listarAlergias).toHaveBeenCalledTimes(1)
  })

  it('c3: una sustancia repetida se rechaza y se muestra el registro existente', async () => {
    const mensaje =
      'El paciente ya tiene registrada la alergia a Penicilina (severidad SEVERA, detectada el 2020-03-14). ' +
      'Si hay que corregirla, elimine ese registro y vuelva a agregarla.'
    crearAlergia.mockRejectedValue(new ApiError(409, mensaje))
    listarAlergias.mockResolvedValue([alergia({ sustancia: 'Penicilina', severidad: 'SEVERA' })])
    const user = await montar(true)

    const form = await llenarFormulario(user, {
      sustancia: 'penicilina',
      reaccion: 'Rash',
      severidad: 'LEVE',
      fecha: '2023-05-05',
    })
    await user.click(within(form).getByRole('button', { name: 'Guardar alergia' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent(mensaje)
    // El formulario sigue abierto con lo escrito y la lista no cambia.
    expect(within(form).getByLabelText(/^sustancia/i)).toHaveValue('penicilina')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('c4: cada alergia dice quién la registró', async () => {
    listarAlergias.mockResolvedValue([alergia({ registradaPor: 'Marta Guevara' })])
    await montar(false)

    expect(screen.getByText(/Registrada por Marta Guevara/)).toBeVisible()
  })

  it('c4: eliminar pide confirmar en dos pasos y después la quita de la lista', async () => {
    listarAlergias.mockResolvedValue([alergia({ alergiaId: 5, sustancia: 'Aspirina' })])
    eliminarAlergia.mockResolvedValue()
    const user = await montar(true)

    await user.click(screen.getByRole('button', { name: 'Eliminar alergia: Aspirina' }))
    expect(eliminarAlergia).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(eliminarAlergia).toHaveBeenCalledWith(5)
    await vi.waitFor(() => expect(screen.queryByText('Aspirina')).toBeNull())
  })

  it('cancelar la confirmación no elimina nada', async () => {
    listarAlergias.mockResolvedValue([alergia({ sustancia: 'Aspirina' })])
    const user = await montar(true)

    await user.click(screen.getByRole('button', { name: 'Eliminar alergia: Aspirina' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(eliminarAlergia).not.toHaveBeenCalled()
    expect(screen.getByText('Aspirina')).toBeVisible()
  })

  it('quien solo consulta (el administrador) no ve «Agregar» ni «Eliminar»', async () => {
    listarAlergias.mockResolvedValue([alergia({ sustancia: 'Aspirina' })])
    await montar(false)

    expect(screen.getByText('Aspirina')).toBeVisible()
    expect(screen.queryByRole('button', { name: /agregar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull()
  })

  it('sin alergias muestra un estado vacío, no un error', async () => {
    await montar(true)
    expect(screen.getByText(/No hay alergias registradas/)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('avisa a la ficha de lo que sabe: la lista, o null si no se pudo cargar', async () => {
    const onCambio = vi.fn<(a: AlergiasConocidas) => void>()
    const lista = [alergia({ severidad: 'SEVERA' })]
    listarAlergias.mockResolvedValue(lista)
    await montar(false, onCambio)
    expect(onCambio).toHaveBeenLastCalledWith(lista)

    onCambio.mockReset()
    listarAlergias.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    render(<SeccionAlergias pacienteId={8} puedeEditar={false} expanded onToggle={() => {}} onCambio={onCambio} />)
    await vi.waitFor(() => expect(onCambio).toHaveBeenLastCalledWith(null))
  })
})

describe('HU-11 c2 · aviso de alergias severas en la ficha', () => {
  it('destaca cada alergia severa con su reacción, y solo las severas', () => {
    render(
      <AvisoDeAlergiasSeveras
        alergias={[
          alergia({ alergiaId: 1, sustancia: 'Penicilina', reaccion: 'Anafilaxia', severidad: 'SEVERA' }),
          alergia({ alergiaId: 2, sustancia: 'Polen', severidad: 'LEVE' }),
        ]}
      />,
    )

    const aviso = screen.getByRole('alert', { name: 'Alergias severas' })
    expect(aviso).toHaveTextContent('Alergia severa')
    expect(within(aviso).getByText('Penicilina')).toBeVisible()
    expect(aviso).toHaveTextContent('Anafilaxia')
    expect(within(aviso).queryByText('Polen')).toBeNull()
    expect(aviso.className).toMatch(/red/)
  })

  it('no aparece si no hay severas, ni mientras se carga', () => {
    const { container, rerender } = render(<AvisoDeAlergiasSeveras alergias={undefined} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<AvisoDeAlergiasSeveras alergias={[alergia({ severidad: 'MODERADA' })]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('si no se pudieron cargar, advierte en vez de callar', () => {
    render(<AvisoDeAlergiasSeveras alergias={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudieron cargar las alergias/)
  })
})

describe('ordenarPorSeveridad', () => {
  it('pone las severas primero y ordena por sustancia sin distinguir tildes', () => {
    const orden = ordenarPorSeveridad([
      alergia({ alergiaId: 1, sustancia: 'Polen', severidad: 'LEVE' }),
      alergia({ alergiaId: 2, sustancia: 'Yodo', severidad: 'SEVERA' }),
      alergia({ alergiaId: 3, sustancia: 'Ácido acetilsalicílico', severidad: 'SEVERA' }),
      alergia({ alergiaId: 4, sustancia: 'Látex', severidad: 'MODERADA' }),
    ])
    expect(orden.map((a) => a.alergiaId)).toEqual([3, 2, 4, 1])
    expect(SEVERIDADES.map((s) => s.valor)).toEqual(['SEVERA', 'MODERADA', 'LEVE'])
  })
})
