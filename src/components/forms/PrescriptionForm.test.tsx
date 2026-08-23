// Guardas del formulario de recetas.
//
// Lo central: UNA RECETA SIN MEDICAMENTOS NO ES UNA RECETA. El formulario
// arranca con una línea en blanco, así que «no escribir nada y darle a emitir»
// es el camino más fácil del mundo; estas pruebas exigen que ahí no salga
// ninguna petición y que se diga por qué.
//
// Lo segundo: que el cuerpo sea el del contrato —`consultaId` más la lista de
// medicamentos, con los opcionales OMITIDOS cuando están en blanco—.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { ConsultaDto } from '@/services/consultas'
import type { CrearPrescripcionPayload, PrescripcionDto } from '@/services/prescripciones'
import { MENSAJE_RECETA_VACIA } from '@/services/prescripciones'
import { PrescriptionForm } from './PrescriptionForm'

const crearPrescripcion = vi.fn<(p: CrearPrescripcionPayload) => Promise<PrescripcionDto>>()
const listarConsultas = vi.fn<(pacienteId?: number) => Promise<ConsultaDto[]>>()

vi.mock('@/services/prescripciones', async (importarOriginal) => {
  // `normalizarMedicamentos` y el mensaje se dejan reales: son la regla que se
  // está probando.
  const real = await importarOriginal<typeof import('@/services/prescripciones')>()
  return { ...real, crearPrescripcion: (p: CrearPrescripcionPayload) => crearPrescripcion(p) }
})

vi.mock('@/services/consultas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return { ...real, listarConsultas: (pacienteId?: number) => listarConsultas(pacienteId) }
})

function consulta(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
  return {
    consultaId: 7,
    fecha: '2026-08-23T14:30:00',
    motivo: 'Dolor de garganta',
    diagnostico: 'Faringitis aguda',
    estado: 'FINALIZADA',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: null,
    ...cambios,
  }
}

function receta(): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra' },
    medicamentos: [
      { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', frecuencia: null, duracion: null },
    ],
  }
}

const PACIENTES = [{ personaId: 42, nombre: 'Ana María Ramírez', expediente: 'EXP-0042' }]

let onCreada: ReturnType<typeof vi.fn<(prescripcion: PrescripcionDto) => void>>
let onCancel: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  crearPrescripcion.mockReset()
  listarConsultas.mockReset()
  crearPrescripcion.mockResolvedValue(receta())
  listarConsultas.mockResolvedValue([consulta()])
  onCreada = vi.fn<(prescripcion: PrescripcionDto) => void>()
  onCancel = vi.fn<() => void>()
})

function montar(props: Partial<React.ComponentProps<typeof PrescriptionForm>> = {}) {
  render(
    <PrescriptionForm
      pacientes={PACIENTES}
      onCreada={onCreada}
      onCancel={onCancel}
      {...props}
    />,
  )
  return userEvent.setup()
}

const botonEmitir = () => screen.getByRole('button', { name: /emitir/i })
const campoMedicamento = (n: number) => screen.getByLabelText(new RegExp(`^medicamento ${n}$`, 'i'))
const campoDosis = (n: number) => screen.getByLabelText(new RegExp(`dosis del medicamento ${n}`, 'i'))
const campoFrecuencia = (n: number) =>
  screen.getByLabelText(new RegExp(`frecuencia del medicamento ${n}`, 'i'))

/** Espera a que la lista de consultas del paciente esté cargada. */
async function esperarConsultas() {
  await waitFor(() => expect(listarConsultas).toHaveBeenCalled())
  await screen.findByRole('option', { name: /dolor de garganta/i })
}

describe('PrescriptionForm · una receta sin medicamentos no es una receta', () => {
  it('no emite nada si no se escribió ningún medicamento', async () => {
    const user = montar()
    await esperarConsultas()

    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_RECETA_VACIA)
    expect(crearPrescripcion).not.toHaveBeenCalled()
    expect(onCreada).not.toHaveBeenCalled()
  })

  it('tampoco cuenta como receta un par de líneas en blanco', async () => {
    // «Agregar medicamento» tres veces y no llenar ninguna sigue siendo cero
    // medicamentos, por mucho que la pantalla muestre tres filas.
    const user = montar()
    await esperarConsultas()

    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.type(campoDosis(1), '500 mg')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_RECETA_VACIA)
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })
})

describe('PrescriptionForm · el cuerpo que viaja al backend', () => {
  it('manda consultaId y los medicamentos, omitiendo los opcionales vacíos', async () => {
    const user = montar()
    await esperarConsultas()

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.type(campoDosis(1), '500 mg')
    await user.type(campoFrecuencia(1), 'cada 8 h')
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.type(campoMedicamento(2), 'Ibuprofeno')
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0]).toEqual({
      consultaId: 7,
      medicamentos: [
        { medicamento: 'Amoxicilina', dosis: '500 mg', frecuencia: 'cada 8 h' },
        { medicamento: 'Ibuprofeno' },
      ],
    })
  })

  it('descarta la línea que quedó vacía entre dos llenas', async () => {
    const user = montar()
    await esperarConsultas()

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.type(campoMedicamento(3), 'Ibuprofeno')
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].medicamentos).toEqual([
      { medicamento: 'Amoxicilina' },
      { medicamento: 'Ibuprofeno' },
    ])
  })

  it('usa la consulta fija cuando se receta desde una consulta concreta', async () => {
    const user = montar({ consulta: consulta({ consultaId: 99 }) })

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].consultaId).toBe(99)
    // Con la consulta ya decidida no hay por qué pedir la lista del paciente.
    expect(listarConsultas).not.toHaveBeenCalled()
  })
})

describe('PrescriptionForm · la consulta de la que cuelga la receta', () => {
  it('pide las consultas del paciente elegido y preselecciona la más reciente', async () => {
    listarConsultas.mockResolvedValue([
      consulta({ consultaId: 20, motivo: 'Control post operatorio' }),
      consulta({ consultaId: 7 }),
    ])
    const user = montar()
    await waitFor(() => expect(listarConsultas).toHaveBeenCalledWith(42))
    await screen.findByRole('option', { name: /control post operatorio/i })

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].consultaId).toBe(20)
  })

  it('avisa cuando el paciente no tiene consultas, en vez de dejar emitir a ciegas', async () => {
    listarConsultas.mockResolvedValue([])
    const user = montar()
    await waitFor(() => expect(listarConsultas).toHaveBeenCalled())
    await screen.findByRole('option', { name: /no tiene consultas registradas/i })

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(/elige la consulta/i)
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })

  it('no escribe «null» en el selector cuando la consulta llegó sin motivo', async () => {
    // `motivo` PUEDE SER NULL, y una plantilla de cadena no perdona:
    // `${c.motivo}` ponía literalmente la palabra «null» entre las opciones
    // de un formulario de recetas. Se comprueba sobre el desplegable de
    // consultas y no sobre la pantalla entera para que la prueba no dependa
    // de que ninguna otra parte diga «null» por su cuenta.
    listarConsultas.mockResolvedValue([consulta({ consultaId: 20, motivo: null })])
    montar()
    await waitFor(() => expect(listarConsultas).toHaveBeenCalled())

    const selector = await screen.findByLabelText(/^consulta/i)
    const etiquetas = within(selector)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '')

    expect(etiquetas).toHaveLength(1)
    expect(etiquetas[0]).not.toMatch(/null/i)
    // Y el hueco se ve: la fecha sola no distingue «sin motivo» de «aquí se
    // perdió el texto», que es lo que dejaba una etiqueta cortada en el «·».
    expect(etiquetas[0]).toContain('—')
  })

  it('muestra el error de carga de consultas con el motivo del backend', async () => {
    listarConsultas.mockRejectedValue(new ApiError(403, 'No tiene acceso a este paciente'))
    montar()

    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso a este paciente')
  })
})

describe('PrescriptionForm · errores al emitir', () => {
  it('muestra el motivo del backend y no avisa de una receta que no se emitió', async () => {
    crearPrescripcion.mockRejectedValue(
      new ApiError(403, 'Solo el médico que atendió la consulta puede recetar'),
    )
    const user = montar()
    await esperarConsultas()

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el médico que atendió la consulta puede recetar',
    )
    expect(onCreada).not.toHaveBeenCalled()
  })

  it('avisa a la pantalla con la receta que devolvió el servidor', async () => {
    const emitida = receta()
    crearPrescripcion.mockResolvedValue(emitida)
    const user = montar()
    await esperarConsultas()

    await user.type(campoMedicamento(1), 'Amoxicilina')
    await user.click(botonEmitir())

    await waitFor(() => expect(onCreada).toHaveBeenCalledWith(emitida))
  })
})
