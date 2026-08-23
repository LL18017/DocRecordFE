// Guardas del alta de pacientes: la búsqueda por DUI y lo que se manda al
// crear. Las reglas de aquí son las que evitan expedientes duplicados y los
// 409 del backend por DUI que no coincide.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { PersonaDto } from '@/services/personas'
import type { CrearPacientePayload, PacienteDto } from '@/services/pacientes'
import { PatientForm } from './PatientForm'

const buscarPersonaPorDui = vi.fn<(dui: string) => Promise<PersonaDto | null>>()
const crearPaciente = vi.fn()

vi.mock('@/services/personas', () => ({
  buscarPersonaPorDui: (dui: string) => buscarPersonaPorDui(dui),
}))

vi.mock('@/services/pacientes', () => ({
  crearPaciente: (payload: CrearPacientePayload) => crearPaciente(payload),
}))

function persona(cambios: Partial<PersonaDto> = {}): PersonaDto {
  return {
    personaId: 12,
    dui: '01234567-8',
    nombres: 'Carlos Miguel',
    apellidos: 'Chávez Aguilar',
    fechaNacimiento: '1996-06-15',
    sexo: 'M',
    telefono: '7000-0000',
    direccion: 'San Salvador',
    esMedico: false,
    esEnfermera: false,
    esPaciente: false,
    ...cambios,
  }
}

let onCreated: ReturnType<typeof vi.fn<(paciente: PacienteDto) => void>>
let onCancel: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  buscarPersonaPorDui.mockReset()
  crearPaciente.mockReset()
  crearPaciente.mockResolvedValue({ personaId: 12, expediente: 'EXP-0007' })
  onCreated = vi.fn<(paciente: PacienteDto) => void>()
  onCancel = vi.fn<() => void>()
})

afterEach(() => {
  vi.clearAllMocks()
})

function montar() {
  render(<PatientForm onCreated={onCreated} onCancel={onCancel} />)
  return userEvent.setup()
}

const botonSiguiente = () => screen.getByRole('button', { name: /siguiente/i })

/**
 * Los `<label>` del formulario no están asociados a sus `<input>` (no hay
 * `htmlFor`/`id` ni anidamiento), así que `getByLabelText` no los encuentra:
 * hay que llegar al campo por el placeholder o por la estructura del DOM.
 * Ver la prueba de accesibilidad al final de este archivo.
 */
const campoDui = () => screen.getByPlaceholderText('01234567-8')

/** Input hermano del `<label>` cuyo texto coincide. */
function campoJuntoA(etiqueta: RegExp, selector = 'input'): HTMLInputElement {
  const label = screen
    .getAllByText(etiqueta)
    .find((el): el is HTMLLabelElement => el.tagName === 'LABEL')
  const input = label?.parentElement?.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`No se encontró el campo de "${etiqueta}"`)
  return input
}

const campoFechaNacimiento = () =>
  campoJuntoA(/fecha de nacimiento/i, 'input[type="date"]')

async function buscarDui(user: ReturnType<typeof userEvent.setup>, dui = '01234567-8') {
  await user.type(campoDui(), dui)
  await user.click(screen.getByRole('button', { name: /^buscar$/i }))
}

/** Avanza del paso 1 al 3 y guarda. Devuelve el payload que recibió el servicio. */
async function guardar(
  user: ReturnType<typeof userEvent.setup>,
): Promise<CrearPacientePayload> {
  await user.click(botonSiguiente())
  await user.click(botonSiguiente())
  await user.click(screen.getByRole('button', { name: /guardar paciente/i }))
  await waitFor(() => expect(crearPaciente).toHaveBeenCalled())
  return crearPaciente.mock.calls[0][0] as CrearPacientePayload
}

describe('PatientForm · persona que ya es paciente', () => {
  it('bloquea el avance si la persona ya tiene expediente', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona({ esPaciente: true }))

    await buscarDui(user)

    expect(await screen.findByText(/ya tiene un expediente de paciente registrado/i)).toBeVisible()
    // La regla dura: no se puede crear un segundo expediente para la misma
    // persona. Si el botón se habilitara, el backend respondería 409 y el
    // usuario solo vería un error críptico tras llenar tres pasos.
    expect(botonSiguiente()).toBeDisabled()
  })
})

describe('PatientForm · reutilizar una persona existente', () => {
  it('manda SOLO el personaId cuando la persona ya tiene todos sus datos', async () => {
    const user = montar()
    // Persona completa: fecha de nacimiento 1996-06-15 y sexo 'M'.
    buscarPersonaPorDui.mockResolvedValue(persona())

    await buscarDui(user)
    await waitFor(() => expect(botonSiguiente()).toBeEnabled())
    const payload = await guardar(user)

    // El backend responde 409 si el `dui` enviado no coincide exactamente con
    // el que esa persona ya tiene. Como el campo del formulario es editable,
    // reenviarlo es una fuente directa de 409 evitables.
    expect(payload.persona).not.toHaveProperty('dui')

    // Y nada más: los campos que la persona YA tiene no se reenvían. El estado
    // interno del formulario arranca en `sexo: 'M'` y `fechaNacimiento: ''`,
    // así que mandarlos "por si acaso" le cambiaría el sexo registrado a una
    // paciente 'F' y le borraría la fecha de nacimiento.
    expect(payload.persona).toEqual({ personaId: 12 })
    expect(payload.tipoSangre).toBe('O+')
  })

  it('solo manda los campos que a la persona le faltaban', async () => {
    const user = montar()
    // Persona registrada antes como personal médico: sin fecha ni sexo.
    buscarPersonaPorDui.mockResolvedValue(
      persona({ fechaNacimiento: null, sexo: null, esMedico: true }),
    )

    await buscarDui(user)
    expect(await screen.findByText(/ya figura en el sistema como personal médico/i)).toBeVisible()

    await user.type(campoFechaNacimiento(), '1996-06-15')
    await user.click(screen.getByRole('radio', { name: /femenino/i }))

    const payload = await guardar(user)

    expect(payload.persona).toEqual({
      personaId: 12,
      fechaNacimiento: '1996-06-15',
      sexo: 'F',
    })
    // Ni nombres ni apellidos ni teléfono: completar no debe pisar lo que la
    // persona ya tenía guardado.
    expect(payload.persona).not.toHaveProperty('nombres')
    expect(payload.persona).not.toHaveProperty('telefono')
  })

  it('no deja avanzar mientras falte la fecha de nacimiento que la persona no tiene', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona({ fechaNacimiento: null }))

    await buscarDui(user)

    // El backend responde 422 sin fechaNacimiento; el formulario debe frenarlo antes.
    await waitFor(() => expect(botonSiguiente()).toBeDisabled())
    await user.type(campoFechaNacimiento(), '1996-06-15')
    await waitFor(() => expect(botonSiguiente()).toBeEnabled())
  })
})

describe('PatientForm · persona nueva', () => {
  it('manda los datos capturados y nunca un expediente', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    await buscarDui(user)
    expect(await screen.findByText(/no se encontró ninguna persona con ese DUI/i)).toBeVisible()

    await user.type(screen.getByPlaceholderText('Carlos Miguel'), 'Ana María')
    await user.type(screen.getByPlaceholderText('Chávez Aguilar'), 'Rivas López')
    await user.type(campoFechaNacimiento(), '2000-03-02')

    const payload = await guardar(user)

    expect(payload.persona.dui).toBe('01234567-8')
    expect(payload.persona.nombres).toBe('Ana María')
    // El expediente lo emite el servidor con un correlativo; el formulario
    // muestra "Se asigna automáticamente" y no debe mandar ningún valor.
    expect(payload).not.toHaveProperty('expediente')
    expect(JSON.stringify(payload)).not.toMatch(/expediente/i)
  })

  it('omite teléfono y dirección vacíos en vez de mandar cadenas vacías', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    await buscarDui(user)
    await user.type(screen.getByPlaceholderText('Carlos Miguel'), 'Ana')
    await user.type(screen.getByPlaceholderText('Chávez Aguilar'), 'Rivas')
    await user.type(campoFechaNacimiento(), '2000-03-02')

    const payload = await guardar(user)

    // Una cadena vacía sobrescribiría el dato con "" en la base; `undefined`
    // hace que la clave ni siquiera viaje en el JSON.
    expect(payload.persona.telefono).toBeUndefined()
    expect(payload.persona.direccion).toBeUndefined()
    expect(JSON.stringify(payload)).not.toMatch(/"telefono"|"direccion"/)
  })
})

describe('PatientForm · invalidación de la búsqueda', () => {
  it('obliga a volver a buscar si el DUI cambia después de la búsqueda', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona())

    await buscarDui(user)
    await waitFor(() => expect(botonSiguiente()).toBeEnabled())

    await user.type(campoDui(), '9')

    // Sin esto se podría dar de alta a la persona encontrada con el DUI
    // anterior bajo un DUI distinto al que se ve en pantalla.
    expect(botonSiguiente()).toBeDisabled()
    expect(screen.queryByText(/Chávez Aguilar/)).not.toBeInTheDocument()
  })

  it('muestra el error del backend si la búsqueda por DUI falla', async () => {
    const user = montar()
    buscarPersonaPorDui.mockRejectedValue(new ApiError(500, 'La base de datos no responde'))

    await buscarDui(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('La base de datos no responde')
    expect(botonSiguiente()).toBeDisabled()
  })
})

describe('PatientForm · errores al guardar', () => {
  it('muestra el mensaje del 409 sin perder lo capturado', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona())
    crearPaciente.mockRejectedValue(
      new ApiError(409, 'Esta persona ya está registrada como paciente.'),
    )

    await buscarDui(user)
    await waitFor(() => expect(botonSiguiente()).toBeEnabled())
    await user.click(botonSiguiente())
    await user.click(botonSiguiente())
    await user.click(screen.getByRole('button', { name: /guardar paciente/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta persona ya está registrada como paciente.',
    )
    expect(onCreated).not.toHaveBeenCalled()
    // El botón vuelve a habilitarse: si quedara en "Guardando…" el usuario
    // tendría que recargar y volver a capturar los tres pasos.
    expect(screen.getByRole('button', { name: /guardar paciente/i })).toBeEnabled()
  })
})

describe('PatientForm · accesibilidad de los campos', () => {
  /**
   * DEFECTO CONOCIDO (no corregido a propósito, ver informe).
   *
   * Ningún `<label>` del formulario apunta a su campo: no llevan `htmlFor`,
   * los `<input>` no llevan `id` y el label tampoco envuelve al input (los
   * radios de sexo sí, y por eso son los únicos que se consultan por su
   * nombre accesible en este archivo).
   *
   * Consecuencia: un lector de pantalla anuncia «cuadro de edición» sin decir
   * de qué campo se trata, y hacer clic en la etiqueta no enfoca el campo. En
   * un sistema de expedientes clínicos capturar el dato en la casilla
   * equivocada no es un detalle estético.
   *
   * Arreglo: `id` en cada input + `htmlFor` en su label, o envolver el input
   * con el label como ya se hace con los radios.
   */
  it.fails('DEFECTO: cada campo debería tener un nombre accesible', () => {
    montar()

    expect(screen.getByLabelText(/identificación \(DUI\)/i)).toBeInTheDocument()
  })
})
