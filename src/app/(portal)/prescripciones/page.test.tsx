// Guardas de la pantalla de recetas.
//
// Lo que se protege:
//  1. Que dosis, frecuencia y duración nulas —el contrato las marca
//     opcionales— se pinten como «—» y no como «null» en un papel que alguien
//     va a llevar a la farmacia.
//  2. Que la tarjeta desaparezca SOLO cuando el servidor confirmó la anulación.
//  3. Que la pantalla no finja una lista: sin paciente elegido no hay recetas
//     que mostrar, porque el contrato no expone un `GET /prescripciones` sin
//     filtro.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { PacienteDto } from '@/services/pacientes'
import type { PrescripcionDto } from '@/services/prescripciones'
import PrescripcionesPage from './page'

const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()
const listarPrescripcionesDePaciente = vi.fn<(id: number) => Promise<PrescripcionDto[]>>()
const eliminarPrescripcion = vi.fn<(id: number) => Promise<void>>()

vi.mock('@/services/pacientes', () => ({
  listarPacientes: () => listarPacientes(),
}))

vi.mock('@/services/prescripciones', async (importarOriginal) => {
  // `textoOpcional` y los formateadores se dejan reales: son lo que la
  // pantalla tiene que usar bien con los nulos.
  const real = await importarOriginal<typeof import('@/services/prescripciones')>()
  return {
    ...real,
    listarPrescripcionesDePaciente: (id: number) => listarPrescripcionesDePaciente(id),
    eliminarPrescripcion: (id: number) => eliminarPrescripcion(id),
  }
})

function paciente(): PacienteDto {
  return {
    personaId: 42,
    expediente: 'EXP-0042',
    tipoSangre: 'O+',
    creadoEn: '2026-08-22T23:09:13',
    persona: {
      personaId: 42,
      dui: '01234567-8',
      nombres: 'Ana María',
      apellidos: 'Ramírez',
      fechaNacimiento: '1994-06-02',
      sexo: 'F',
      telefono: null,
      direccion: null,
    },
  }
}

function receta(cambios: Partial<PrescripcionDto> = {}): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra' },
    medicamentos: [
      { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', frecuencia: null, duracion: null },
    ],
    ...cambios,
  }
}

beforeEach(() => {
  listarPacientes.mockReset()
  listarPrescripcionesDePaciente.mockReset()
  eliminarPrescripcion.mockReset()
  listarPacientes.mockResolvedValue([paciente()])
  listarPrescripcionesDePaciente.mockResolvedValue([receta()])
  eliminarPrescripcion.mockResolvedValue(undefined)
})

function montar() {
  render(<PrescripcionesPage />)
  return userEvent.setup()
}

describe('recetas · campos opcionales', () => {
  it('pinta un guion donde el backend mandó null', async () => {
    montar()

    const fila = (await screen.findByText('Amoxicilina')).closest('tr')!
    expect(within(fila).getByText('500 mg')).toBeInTheDocument()
    // frecuencia y duracion vinieron null: dos guiones, ningún «null».
    expect(within(fila).getAllByText('—')).toHaveLength(2)
  })

  it('pide las recetas del paciente preseleccionado', async () => {
    montar()

    await waitFor(() => expect(listarPrescripcionesDePaciente).toHaveBeenCalledWith(42))
    expect(await screen.findByText(/receta #11/i)).toBeInTheDocument()
  })
})

describe('recetas · anulación', () => {
  it('quita la tarjeta solo cuando el servidor confirmó', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.click(screen.getByRole('button', { name: /anular la receta 11/i }))

    await waitFor(() => expect(eliminarPrescripcion).toHaveBeenCalledWith(11))
    await waitFor(() => expect(screen.queryByText(/receta #11/i)).toBeNull())
  })

  it('deja la tarjeta si la anulación falla, y muestra el motivo', async () => {
    eliminarPrescripcion.mockRejectedValue(
      new ApiError(403, 'Solo el médico que la emitió puede anularla'),
    )
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.click(screen.getByRole('button', { name: /anular la receta 11/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el médico que la emitió puede anularla',
    )
    expect(screen.getByText(/receta #11/i)).toBeInTheDocument()
  })
})

describe('recetas · carga', () => {
  it('no inventa una lista cuando no hay pacientes que elegir', async () => {
    // Sin `pacienteId` no hay endpoint que pedir: el contrato solo permite
    // filtrar por consulta o por paciente. Decir «este paciente no tiene
    // recetas» ahí sería afirmar algo que nadie comprobó.
    listarPacientes.mockResolvedValue([])
    montar()

    expect(await screen.findByText(/elige un paciente para ver sus recetas/i)).toBeInTheDocument()
    expect(listarPrescripcionesDePaciente).not.toHaveBeenCalled()
  })

  it('dice qué se cayó y conserva el motivo del backend', async () => {
    listarPrescripcionesDePaciente.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    montar()

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent(/recetas del paciente/i)
    expect(aviso).toHaveTextContent(/Error del servidor \(500\)/i)
  })

  it('reintenta la carga que falló', async () => {
    listarPrescripcionesDePaciente.mockRejectedValueOnce(
      new ApiError(0, 'No se pudo contactar al servidor. ¿Está corriendo el backend?'),
    )
    const user = montar()
    await screen.findByRole('alert')

    listarPrescripcionesDePaciente.mockResolvedValue([receta()])
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(await screen.findByText(/receta #11/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
