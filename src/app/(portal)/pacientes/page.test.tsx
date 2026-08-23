// Guardas de la columna «Consultas» de la lista de pacientes.
//
// EL FALLO: `GET /pacientes` no trae el conteo de consultas, así que el
// adaptador lo dejaba en 0 fijo y la columna mostraba un cero para TODOS. Un
// paciente con dos consultas registradas seguía apareciendo con cero.
//
// Ese cero no es un dato ausente: es una afirmación clínica —«este paciente
// nunca ha venido»— y encima falsa. Un número equivocado es peor que ninguna
// columna, porque el usuario no tiene forma de saber cuál está leyendo. El
// conteo real sale ahora de `GET /consultas`, y cuando esa petición falla la
// celda muestra un hueco en vez de volver al cero.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '@/lib/api'
import type { PacienteDto } from '@/services/pacientes'
import type { ConsultaDto } from '@/services/consultas'
import PacientesPage from './page'

const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()
const eliminarPaciente = vi.fn<(id: number) => Promise<void>>()
const obtenerPaciente = vi.fn<(id: number) => Promise<PacienteDto>>()
const listarConsultas = vi.fn<() => Promise<ConsultaDto[]>>()

vi.mock('@/services/pacientes', () => ({
  listarPacientes: () => listarPacientes(),
  eliminarPaciente: (id: number) => eliminarPaciente(id),
  obtenerPaciente: (id: number) => obtenerPaciente(id),
}))

vi.mock('@/services/consultas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return { ...real, listarConsultas: () => listarConsultas() }
})

function paciente(personaId: number, nombres: string): PacienteDto {
  return {
    personaId,
    expediente: `EXP-${personaId}`,
    tipoSangre: 'O+',
    creadoEn: '2026-01-10T09:00:00',
    persona: {
      personaId,
      dui: `0123456${personaId}-8`,
      nombres,
      apellidos: 'Pérez',
      fechaNacimiento: '1996-06-15',
      sexo: 'M',
      telefono: '7000-0000',
      direccion: 'San Salvador',
    },
  }
}

function consulta(consultaId: number, pacienteId: number): ConsultaDto {
  return {
    consultaId,
    fecha: '2026-08-20T10:00:00',
    motivo: 'Control',
    diagnostico: null,
    estado: 'FINALIZADA',
    paciente: {
      personaId: pacienteId,
      expediente: `EXP-${pacienteId}`,
      nombres: 'X',
      apellidos: 'Y',
    },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: null,
  }
}

const CON_DOS = paciente(1, 'Carlos')
const SIN_NINGUNA = paciente(2, 'Elena')

const filaDe = async (nombre: string) => {
  const celda = await screen.findByText(new RegExp(nombre))
  const fila = celda.closest('tr')
  if (!fila) throw new Error('La celda encontrada no está dentro de una fila.')
  return fila
}

beforeEach(() => {
  listarPacientes.mockReset()
  eliminarPaciente.mockReset()
  obtenerPaciente.mockReset()
  listarConsultas.mockReset()
  listarPacientes.mockResolvedValue([CON_DOS, SIN_NINGUNA])
  listarConsultas.mockResolvedValue([consulta(11, 1), consulta(12, 1)])
  eliminarPaciente.mockResolvedValue(undefined)
})

describe('pacientes · la columna de consultas', () => {
  it('muestra el conteo real de cada paciente, no un cero para todos', async () => {
    render(<PacientesPage />)

    const conDos = await filaDe('Carlos')
    expect(within(conDos).getByText('2')).toBeInTheDocument()

    const sinNinguna = await filaDe('Elena')
    expect(within(sinNinguna).getByText('0')).toBeInTheDocument()
  })

  it('cero solo cuando el paciente de verdad no tiene consultas', async () => {
    listarConsultas.mockResolvedValue([])

    render(<PacientesPage />)

    const fila = await filaDe('Carlos')
    expect(within(fila).getByText('0')).toBeInTheDocument()
  })

  it('pide el conteo al API en vez de darlo por sabido', async () => {
    render(<PacientesPage />)

    await waitFor(() => expect(listarConsultas).toHaveBeenCalledTimes(1))
    // Una sola petición para toda la tabla: nada de una por paciente.
    expect(listarPacientes).toHaveBeenCalledTimes(1)
  })

  it('muestra un hueco, y no un cero, si no se pudo contar', async () => {
    // El cero de aquí es indistinguible del cero legítimo de arriba, y afirma
    // algo clínico sobre alguien que quizá sí ha venido.
    listarConsultas.mockRejectedValue(new ApiError(500, 'Servicio caído'))

    render(<PacientesPage />)

    const fila = await filaDe('Carlos')
    expect(within(fila).getByText('—')).toBeInTheDocument()
    expect(within(fila).queryByText('0')).toBeNull()
  })

  it('avisa por qué la columna quedó en guion, sin ocultar la lista', async () => {
    listarConsultas.mockRejectedValue(new ApiError(500, 'Servicio caído'))

    render(<PacientesPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo contar las consultas/i)
    // La lista sigue estando: el fallo del conteo no puede vaciar la pantalla.
    expect(await screen.findByText(/Carlos/)).toBeInTheDocument()
  })

  it('si falla la lista de pacientes, no se pinta una tabla a medias', async () => {
    listarPacientes.mockRejectedValue(new ApiError(500, 'Base de datos caída'))

    render(<PacientesPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/base de datos caída/i)
    expect(screen.queryByText(/Carlos/)).toBeNull()
  })
})
