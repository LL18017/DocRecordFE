// Guardas del formulario de clínicas.
//
// Sus `<label>` no apuntaban a ningún control y el aviso de validación colgaba
// suelto al final del formulario: quien usa lector de pantalla oía «no se
// pudo guardar» sin saber en qué casilla estaba el problema, y ni siquiera qué
// casilla tenía delante.
//
// Los campos se buscan por su etiqueta accesible (`getByLabelText`), así que
// romper el emparejamiento `htmlFor`/`id` hace caer estas pruebas solas.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { ClinicaDto, GuardarClinicaPayload } from '@/services/clinicas'
import ClinicasPage from './page'

const listarMisClinicas = vi.fn<() => Promise<ClinicaDto[]>>()
const crearClinica = vi.fn<(p: GuardarClinicaPayload) => Promise<ClinicaDto>>()
const actualizarClinica = vi.fn<(id: number, p: GuardarClinicaPayload) => Promise<ClinicaDto>>()
const eliminarClinica = vi.fn<(id: number) => Promise<void>>()

vi.mock('@/services/clinicas', async (importarOriginal) => {
  // `clinicaDtoAClinica`, `formatearCoordenadas` y el tope de caracteres se
  // dejan reales: son justo lo que la pantalla tiene que usar bien.
  const real = await importarOriginal<typeof import('@/services/clinicas')>()
  return {
    ...real,
    listarMisClinicas: () => listarMisClinicas(),
    crearClinica: (p: GuardarClinicaPayload) => crearClinica(p),
    actualizarClinica: (id: number, p: GuardarClinicaPayload) => actualizarClinica(id, p),
    eliminarClinica: (id: number) => eliminarClinica(id),
  }
})

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ activeClinic: null, setActiveClinic: vi.fn() }),
}))

// Leaflet lee `document` al importarse y no aporta nada a estas guardas.
vi.mock('@/components/mapa/MapaClinicas', () => ({
  default: () => <div data-testid="mapa" />,
}))

function clinica(cambios: Partial<ClinicaDto> = {}): ClinicaDto {
  return { clinicaId: 3, name: 'Clínica Escalón', latitud: 13.7053, longitud: -89.2182, ...cambios }
}

beforeEach(() => {
  listarMisClinicas.mockReset()
  crearClinica.mockReset()
  actualizarClinica.mockReset()
  eliminarClinica.mockReset()
  listarMisClinicas.mockResolvedValue([clinica()])
  crearClinica.mockResolvedValue(clinica({ clinicaId: 9, name: 'Clínica Nueva' }))
  actualizarClinica.mockResolvedValue(clinica({ name: 'Clínica Renombrada' }))
})

/** Monta la pantalla y abre el modal de alta. */
async function abrirAlta() {
  const user = userEvent.setup()
  render(<ClinicasPage />)
  // El nombre sale dos veces: en la tarjeta de la lista y en el panel de la
  // clínica seleccionada.
  await screen.findAllByText('Clínica Escalón')
  await user.click(screen.getAllByRole('button', { name: /agregar clínica/i })[0])
  return user
}

/** Monta la pantalla y abre el modal de edición de la clínica ya registrada. */
async function abrirEdicion() {
  const user = userEvent.setup()
  render(<ClinicasPage />)
  // El nombre sale dos veces: en la tarjeta de la lista y en el panel de la
  // clínica seleccionada.
  await screen.findAllByText('Clínica Escalón')
  await user.click(screen.getAllByTitle('Editar clínica')[0])
  return user
}

const campoNombre = () => screen.getByLabelText(/^nombre de la clínica/i)
const campoLatitud = () => screen.getByLabelText(/^latitud/i)
const campoLongitud = () => screen.getByLabelText(/^longitud/i)

describe('FormularioClinica · nombre accesible de los campos', () => {
  it('localiza los tres campos por su etiqueta visible', async () => {
    await abrirAlta()

    expect(campoNombre().tagName).toBe('INPUT')
    expect(campoLatitud().tagName).toBe('INPUT')
    expect(campoLongitud().tagName).toBe('INPUT')
  })

  it('enfoca el campo al hacer clic en su etiqueta', async () => {
    const user = await abrirAlta()

    await user.click(screen.getByText(/^latitud/i))

    expect(campoLatitud()).toHaveFocus()
  })

  it('anuncia lo obligatorio de forma programática, no solo con el asterisco', async () => {
    await abrirAlta()

    // El `*` es pintura que el lector de pantalla no transmite; el backend
    // responde 400 sin cualquiera de los tres, así que los tres van `required`.
    expect(campoNombre()).toBeRequired()
    expect(campoLatitud()).toBeRequired()
    expect(campoLongitud()).toBeRequired()
  })

  it('el campo que se escribe es el que viaja al API', async () => {
    const user = await abrirAlta()

    await user.type(campoNombre(), 'Clínica Nueva')
    await user.type(campoLatitud(), '13.5')
    await user.type(campoLongitud(), '-89.1')
    await user.click(screen.getByRole('button', { name: /guardar clínica/i }))

    // La etiqueta puede existir y señalar al control equivocado: esto ata cada
    // rótulo al dato que de verdad se manda. Con latitud y longitud cruzadas,
    // la clínica aparecería en otro punto del mapa.
    await waitFor(() => expect(crearClinica).toHaveBeenCalled())
    expect(crearClinica.mock.calls[0][0]).toEqual({
      name: 'Clínica Nueva',
      latitud: 13.5,
      longitud: -89.1,
    })
  })
})

describe('FormularioClinica · el aviso de validación', () => {
  it('queda asociado al campo del nombre cuando es el nombre lo que falta', async () => {
    const user = await abrirAlta()

    // Espacios: pasan el `required` del navegador y los descarta el `trim()`,
    // que es el camino por el que el formulario redacta su propio aviso.
    await user.type(campoNombre(), '   ')
    await user.type(campoLatitud(), '13.5')
    await user.type(campoLongitud(), '-89.1')
    await user.click(screen.getByRole('button', { name: /guardar clínica/i }))

    await screen.findByRole('alert')

    // Un aviso puesto debajo se anuncia una vez y se pierde; enlazado se relee
    // cada vez que alguien vuelve al campo a corregirlo.
    const nombre = campoNombre()
    expect(nombre).toHaveAttribute('aria-invalid', 'true')
    const idAviso = nombre.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(idAviso)?.textContent).toContain(
      'El nombre de la clínica es obligatorio.',
    )

    // Y no señala a quien no tuvo la culpa: marcar las coordenadas mandaría a
    // corregir algo que estaba bien.
    expect(campoLatitud()).not.toHaveAttribute('aria-invalid')
    expect(campoLongitud()).not.toHaveAttribute('aria-invalid')
  })

  it('señala solo la coordenada que no se puede leer', async () => {
    const user = await abrirAlta()

    await user.type(campoNombre(), 'Clínica Nueva')
    await user.type(campoLatitud(), 'trece y pico')
    await user.type(campoLongitud(), '-89.1')
    await user.click(screen.getByRole('button', { name: /guardar clínica/i }))

    await screen.findByRole('alert')

    expect(campoLatitud()).toHaveAttribute('aria-invalid', 'true')
    expect(campoLongitud()).not.toHaveAttribute('aria-invalid')
    expect(campoNombre()).not.toHaveAttribute('aria-invalid')
    expect(crearClinica).not.toHaveBeenCalled()
  })

  it('no señala ningún campo cuando quien falla es el servidor', async () => {
    crearClinica.mockRejectedValue(new ApiError(503, 'El servicio no está disponible.'))
    const user = await abrirAlta()

    await user.type(campoNombre(), 'Clínica Nueva')
    await user.type(campoLatitud(), '13.5')
    await user.type(campoLongitud(), '-89.1')
    await user.click(screen.getByRole('button', { name: /guardar clínica/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible.')
    // Nada de lo capturado está mal: culpar a un campo mandaría a corregir lo
    // que no tiene arreglo desde aquí.
    for (const campo of [campoNombre(), campoLatitud(), campoLongitud()]) {
      expect(campo).not.toHaveAttribute('aria-invalid')
    }
  })

  it('no marca los campos como inválidos mientras no haya fallado nada', async () => {
    await abrirAlta()

    for (const campo of [campoNombre(), campoLatitud(), campoLongitud()]) {
      expect(campo).not.toHaveAttribute('aria-invalid')
      expect(campo).not.toHaveAttribute('aria-describedby')
    }
  })
})

describe('FormularioClinica · edición', () => {
  it('abre con los datos de la clínica en los campos que anuncia su etiqueta', async () => {
    await abrirEdicion()

    // Si el `htmlFor` apuntara al campo de al lado, aquí saldría la latitud en
    // la casilla del nombre.
    expect(campoNombre()).toHaveValue('Clínica Escalón')
    expect(campoLatitud()).toHaveValue('13.7053')
    expect(campoLongitud()).toHaveValue('-89.2182')
  })

  it('manda el nombre editado a la clínica que se estaba editando', async () => {
    const user = await abrirEdicion()

    await user.clear(campoNombre())
    await user.type(campoNombre(), 'Clínica Renombrada')
    await user.click(screen.getByRole('button', { name: /guardar clínica/i }))

    await waitFor(() => expect(actualizarClinica).toHaveBeenCalled())
    expect(actualizarClinica.mock.calls[0][0]).toBe(3)
    expect(actualizarClinica.mock.calls[0][1]).toMatchObject({ name: 'Clínica Renombrada' })
  })
})
