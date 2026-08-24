// Guardas del alta de pacientes: la búsqueda por DUI y lo que se manda al
// crear. Las reglas de aquí son las que evitan expedientes duplicados y los
// 409 del backend por DUI que no coincide.
//
// Los campos se buscan por su etiqueta visible (`getByLabelText`), que es como
// los encuentra una persona —viendo la pantalla o escuchándola— y lo que
// mantiene en pie la asociación `<label htmlFor>` ↔ `<input id>`.

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
    email: null,
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

const campoDui = () => screen.getByLabelText(/identificación \(dui\)/i)
const campoNombres = () => screen.getByLabelText(/^nombres/i)
const campoApellidos = () => screen.getByLabelText(/^apellidos/i)
const campoFechaNacimiento = () => screen.getByLabelText(/fecha de nacimiento/i)

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

  it('no ofrece campo editable para lo que la persona ya tiene registrado', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona())

    await buscarDui(user)
    await screen.findByText(/1996-06-15/)

    // La fecha ya registrada se muestra como texto, no como campo: no hay
    // ningún control que se llame así, solo el rótulo y su valor.
    expect(screen.queryByLabelText(/fecha de nacimiento/i)).not.toBeInTheDocument()
  })

  it('muestra el correo que la persona ya tiene registrado, como texto y no como campo', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona({ email: 'carlos@correo.com' }))

    await buscarDui(user)

    expect(await screen.findByText('carlos@correo.com')).toBeVisible()
    expect(screen.queryByLabelText(/correo electrónico/i)).not.toBeInTheDocument()
  })

  it('dice "—" cuando la persona ya existente no tiene correo capturado', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona({ email: null }))

    await buscarDui(user)
    await screen.findByText(/1996-06-15/)

    // El correo va en el mismo resumen que teléfono/dirección: un dato
    // opcional ausente se marca con «—», no se calla la fila entera.
    const filaDeCorreo = (await screen.findByText('Correo')).closest('div')!
    expect(filaDeCorreo).toHaveTextContent('—')
  })
})

describe('PatientForm · persona nueva', () => {
  it('manda los datos capturados y nunca un expediente', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    await buscarDui(user)
    expect(await screen.findByText(/no se encontró ninguna persona con ese DUI/i)).toBeVisible()

    await user.type(campoNombres(), 'Ana María')
    await user.type(campoApellidos(), 'Rivas López')
    await user.type(campoFechaNacimiento(), '2000-03-02')

    const payload = await guardar(user)

    expect(payload.persona.dui).toBe('01234567-8')
    expect(payload.persona.nombres).toBe('Ana María')
    // El expediente lo emite el servidor con un correlativo; el formulario
    // muestra "Se asigna automáticamente" y no debe mandar ningún valor.
    expect(payload).not.toHaveProperty('expediente')
    expect(JSON.stringify(payload)).not.toMatch(/expediente/i)
  })

  it('omite teléfono, dirección y correo vacíos en vez de mandar cadenas vacías', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    await buscarDui(user)
    await user.type(await screen.findByLabelText(/^nombres/i), 'Ana')
    await user.type(campoApellidos(), 'Rivas')
    await user.type(campoFechaNacimiento(), '2000-03-02')

    const payload = await guardar(user)

    // Una cadena vacía sobrescribiría el dato con "" en la base; `undefined`
    // hace que la clave ni siquiera viaje en el JSON.
    expect(payload.persona.telefono).toBeUndefined()
    expect(payload.persona.direccion).toBeUndefined()
    expect(payload.persona.email).toBeUndefined()
    expect(JSON.stringify(payload)).not.toMatch(/"telefono"|"direccion"|"email"/)
  })

  it('manda el correo capturado, recortado de espacios', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    await buscarDui(user)
    await user.type(await screen.findByLabelText(/^nombres/i), 'Ana')
    await user.type(campoApellidos(), 'Rivas')
    await user.type(campoFechaNacimiento(), '2000-03-02')
    await user.type(screen.getByLabelText(/correo electrónico/i), '  ana@correo.com  ')

    const payload = await guardar(user)

    expect(payload.persona.email).toBe('ana@correo.com')
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
   * La red de seguridad del arreglo: si alguien quita un `htmlFor` o un `id`,
   * el campo deja de tener nombre accesible y esta prueba cae. Sin ella el
   * lector de pantalla vuelve a anunciar «cuadro de edición» sin decir cuál, y
   * en un expediente clínico capturar el dato en la casilla equivocada no es un
   * detalle estético.
   */
  it('localiza todos los campos del paso 1 por su nombre visible', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    await buscarDui(user)
    await screen.findByText(/no se encontró ninguna persona con ese DUI/i)

    const etiquetas = [
      /identificación \(dui\)/i,
      /^nombres/i,
      /^apellidos/i,
      /^teléfono/i,
      /fecha de nacimiento/i,
      /dirección de residencia/i,
      /correo electrónico/i,
      /tipo sanguíneo/i,
    ]
    for (const etiqueta of etiquetas) {
      expect(screen.getByLabelText(etiqueta).tagName).toMatch(/^(INPUT|SELECT|TEXTAREA)$/)
    }

    // Los radios de sexo van envueltos por su `<label>`, y el grupo entero
    // tiene nombre para que se anuncie de qué pregunta se trata.
    expect(screen.getByRole('radio', { name: /masculino/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /femenino/i })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /sexo/i })).toBeInTheDocument()
  })

  it('localiza por etiqueta los campos de los pasos 2 y 3', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(persona())

    await buscarDui(user)
    await waitFor(() => expect(botonSiguiente()).toBeEnabled())

    await user.click(botonSiguiente())
    for (const etiqueta of [/alergias conocidas/i, /enfermedades crónicas/i, /condiciones heredofamiliares/i]) {
      expect(screen.getByLabelText(etiqueta).tagName).toBe('TEXTAREA')
    }

    await user.click(botonSiguiente())
    for (const etiqueta of [
      /peso \(kg\)/i,
      /talla \(cm\)/i,
      /temperatura/i,
      /presión arterial/i,
      /pulso/i,
      /saturación/i,
    ]) {
      expect(screen.getByLabelText(etiqueta).tagName).toBe('INPUT')
    }
  })

  it('enfoca el campo al hacer clic en su etiqueta', async () => {
    const user = montar()

    // Comportamiento estándar que la gente espera sin pensarlo, y que solo
    // existe si la etiqueta apunta de verdad a su control.
    await user.click(screen.getByText(/identificación \(dui\)/i))

    expect(campoDui()).toHaveFocus()
  })

  it('no repite ids si el formulario se monta dos veces en la misma página', () => {
    render(
      <>
        <PatientForm onCreated={onCreated} onCancel={onCancel} />
        <PatientForm onCreated={onCreated} onCancel={onCancel} />
      </>,
    )

    // Con ids fijos ambas etiquetas resolverían al mismo input y aquí habría
    // un solo elemento: `useId()` es lo que evita la colisión.
    const campos = screen.getAllByLabelText(/identificación \(dui\)/i)
    expect(campos).toHaveLength(2)
    expect(campos[0]).not.toBe(campos[1])
    expect(campos[0].id).not.toBe(campos[1].id)
  })

  it('comunica lo obligatorio de forma programática, no solo con el asterisco', async () => {
    const user = montar()
    buscarPersonaPorDui.mockResolvedValue(null)

    // `required` es lo que lee el lector de pantalla; el `*` es solo pintura y
    // va oculto para no ensuciar el nombre del campo.
    expect(campoDui()).toBeRequired()

    await buscarDui(user)
    await screen.findByText(/no se encontró ninguna persona con ese DUI/i)

    expect(campoNombres()).toBeRequired()
    expect(campoApellidos()).toBeRequired()
    expect(campoFechaNacimiento()).toBeRequired()
    // Opcionales de verdad: no deben anunciarse como obligatorios.
    expect(screen.getByLabelText(/^teléfono/i)).not.toBeRequired()
    expect(screen.getByLabelText(/dirección de residencia/i)).not.toBeRequired()
  })

  it('asocia el error de la búsqueda al campo que lo provoca', async () => {
    const user = montar()
    buscarPersonaPorDui.mockRejectedValue(new ApiError(500, 'La base de datos no responde'))

    await buscarDui(user)
    await screen.findByRole('alert')

    // Un `role="alert"` suelto se anuncia una vez y se pierde; enlazado al
    // campo se vuelve a leer cada vez que alguien lo enfoca para corregirlo.
    const campo = campoDui()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    const descripciones = (campo.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((idDescripcion) => document.getElementById(idDescripcion)?.textContent ?? '')
    expect(descripciones.join(' ')).toContain('La base de datos no responde')
  })
})
