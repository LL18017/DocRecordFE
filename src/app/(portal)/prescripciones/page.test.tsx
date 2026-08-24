// Guardas de la pantalla de recetas.
//
// Lo que se protege:
//  1. Que dosis, frecuencia y duración nulas —el contrato las marca
//     opcionales— se pinten como «—» y no como «null» en un papel que alguien
//     va a llevar a la farmacia.
//  2. Que la tarjeta desaparezca SOLO cuando el servidor confirmó la anulación.
//  3. Que la pantalla muestre el histórico completo al montar, SIN exigir
//     elegir un paciente primero, y que distinga con honestidad los dos
//     estados vacíos posibles: «no hay nada registrado» (sin filtros) frente
//     a «lo que pediste no calza» (con algún filtro activo).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { PacienteDto } from '@/services/pacientes'
import type { FiltroHistoricoDeRecetas, PrescripcionDto } from '@/services/prescripciones'
import PrescripcionesPage from './page'

const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()
const listarHistoricoDePrescripciones =
  vi.fn<(filtro?: FiltroHistoricoDeRecetas) => Promise<PrescripcionDto[]>>()
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
    listarHistoricoDePrescripciones: (filtro?: FiltroHistoricoDeRecetas) =>
      listarHistoricoDePrescripciones(filtro),
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
      email: null,
    },
  }
}

function receta(cambios: Partial<PrescripcionDto> = {}): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra' },
    medicamentos: [
      { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', frecuencia: null, duracion: null },
    ],
    ...cambios,
  }
}

beforeEach(() => {
  listarPacientes.mockReset()
  listarHistoricoDePrescripciones.mockReset()
  eliminarPrescripcion.mockReset()
  listarPacientes.mockResolvedValue([paciente()])
  listarHistoricoDePrescripciones.mockResolvedValue([receta()])
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

  it('muestra de quién es la receta y quién la firmó', async () => {
    montar()

    const tarjeta = (await screen.findByText(/receta #11/i)).closest('div')!
    expect(within(tarjeta).getByText(/ana maría ramírez/i)).toBeInTheDocument()
    expect(within(tarjeta).getByText(/exp-0042/i)).toBeInTheDocument()
    expect(within(tarjeta).getByText(/juan guerra/i)).toBeInTheDocument()
  })
})

describe('recetas · histórico al montar', () => {
  it('pide el histórico completo sin exigir elegir un paciente primero', async () => {
    montar()

    // Sin filtros: el filtro que viaja al servicio no trae ningún valor
    // definido (equivale a `{}` — `toHaveBeenCalledWith` ignora las claves en
    // `undefined`, igual que hace el propio servicio al construir el query).
    await waitFor(() => expect(listarHistoricoDePrescripciones).toHaveBeenCalledWith({}))
    expect(await screen.findByText(/receta #11/i)).toBeInTheDocument()
  })

  it('combina los filtros activos en una sola llamada', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Paciente'), '42')
    await user.type(screen.getByLabelText('Desde'), '2026-01-01')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({
        pacienteId: 42,
        desde: '2026-01-01',
      }),
    )
  })

  it('filtra por médico solo', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Médico'), '3')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ medicoId: 3 }),
    )
  })

  it('filtra por hasta solo', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.type(screen.getByLabelText('Hasta'), '2026-12-31')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ hasta: '2026-12-31' }),
    )
  })

  it('combina los cuatro filtros a la vez', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Paciente'), '42')
    await user.selectOptions(screen.getByLabelText('Médico'), '3')
    await user.type(screen.getByLabelText('Desde'), '2026-01-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-12-31')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({
        pacienteId: 42,
        medicoId: 3,
        desde: '2026-01-01',
        hasta: '2026-12-31',
      }),
    )
  })

  it('limpiar filtros vuelve a pedir el histórico completo', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Paciente'), '42')
    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ pacienteId: 42 }),
    )

    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))

    await waitFor(() => expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({}))
  })
})

describe('recetas · el filtro de médico no es un catálogo completo del personal', () => {
  it('solo ofrece médicos que ya aparecen en el histórico cargado', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue([
      receta(),
      receta({
        prescripcionId: 12,
        medico: { personaId: 9, nombres: 'Carla', apellidos: 'Sosa' },
      }),
    ])
    montar()
    await screen.findByText(/receta #11/i)

    const selectorDeMedico = screen.getByLabelText('Médico')
    const opciones = within(selectorDeMedico)
      .getAllByRole('option')
      .map((o) => o.textContent)

    expect(opciones).toEqual(['Todos los médicos', 'Juan Guerra', 'Carla Sosa'])
  })

  it('no repite un médico que firmó varias recetas en el histórico', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue([receta(), receta({ prescripcionId: 12 })])
    montar()
    await screen.findByText(/receta #11/i)

    const selectorDeMedico = screen.getByLabelText('Médico')
    expect(within(selectorDeMedico).getAllByRole('option')).toHaveLength(2) // «Todos» + Juan Guerra, una sola vez
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

describe('recetas · estados vacíos', () => {
  it('sin filtros y sin recetas, dice que no hay ninguna registrada', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue([])
    montar()

    expect(
      await screen.findByText(/todavía no hay recetas registradas en el sistema/i),
    ).toBeInTheDocument()
  })

  it('con un filtro activo y sin resultados, dice que no calzan con el filtro', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    listarHistoricoDePrescripciones.mockResolvedValueOnce([])
    await user.selectOptions(screen.getByLabelText('Paciente'), '42')

    expect(await screen.findByText(/no hay recetas con estos filtros/i)).toBeInTheDocument()
  })
})

describe('recetas · carga', () => {
  it('dice qué se cayó y conserva el motivo del backend', async () => {
    listarHistoricoDePrescripciones.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    montar()

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent(/recetas/i)
    expect(aviso).toHaveTextContent(/Error del servidor \(500\)/i)
  })

  it('reintenta la carga que falló', async () => {
    listarHistoricoDePrescripciones.mockRejectedValueOnce(
      new ApiError(0, 'No se pudo contactar al servidor. ¿Está corriendo el backend?'),
    )
    const user = montar()
    await screen.findByRole('alert')

    listarHistoricoDePrescripciones.mockResolvedValue([receta()])
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(await screen.findByText(/receta #11/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
