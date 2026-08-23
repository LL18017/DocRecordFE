// Guardas de la pantalla de consultas.
//
// Dos cosas que ya fallaron en este proyecto y que aquí no pueden volver a
// pasar en silencio:
//
//  1. Una consulta con `clinica: null` —el contrato avisa de que PUEDE SER
//     NULL— tiene que pintarse sin reventar. El fallo gemelo («Cannot read
//     properties of null») ya tumbó la búsqueda de pacientes.
//  2. La fila desaparece SOLO cuando el servidor confirmó la baja. Un borrado
//     optimista en un expediente clínico deja al médico creyendo que borró
//     algo que sigue ahí.
//  3. `motivo` PUEDE SER NULL —la columna no lo exige y `ConsultaRequestDto`
//     tampoco—, y aquí se buscaba con `c.motivo.toLowerCase()`. Teclear una
//     letra en la caja de búsqueda con una sola consulta sin motivo en la
//     lista tumbaba la pantalla entera, calcado del fallo de `dui`.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { ConsultaDto } from '@/services/consultas'
import type { PacienteDto } from '@/services/pacientes'
import ConsultasPage from './page'

const listarConsultas = vi.fn<() => Promise<ConsultaDto[]>>()
const eliminarConsulta = vi.fn<(id: number) => Promise<void>>()
const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()

vi.mock('@/services/consultas', async (importarOriginal) => {
  // Los formateadores y las ayudas de nulos se dejan reales: son justamente lo
  // que esta pantalla tiene que usar bien.
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return {
    ...real,
    listarConsultas: () => listarConsultas(),
    eliminarConsulta: (id: number) => eliminarConsulta(id),
  }
})

vi.mock('@/services/pacientes', () => ({
  listarPacientes: () => listarPacientes(),
}))

function consulta(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
  return {
    consultaId: 7,
    fecha: '2026-08-23T14:30:00',
    motivo: 'Dolor de garganta',
    diagnostico: 'Faringitis aguda',
    estado: 'FINALIZADA',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: { clinicaId: 5, name: 'Clínica Escalón' },
    ...cambios,
  }
}

beforeEach(() => {
  listarConsultas.mockReset()
  eliminarConsulta.mockReset()
  listarPacientes.mockReset()
  listarConsultas.mockResolvedValue([consulta()])
  eliminarConsulta.mockResolvedValue(undefined)
  listarPacientes.mockResolvedValue([])
})

function montar() {
  render(<ConsultasPage />)
  return userEvent.setup()
}

const filaDe = async (texto: RegExp | string) => {
  const celda = await screen.findByText(texto)
  const fila = celda.closest('tr')
  if (!fila) throw new Error('La celda encontrada no está dentro de una fila.')
  return fila
}

describe('consultas · lo que puede venir nulo', () => {
  it('muestra una consulta sin clínica sin romperse', async () => {
    listarConsultas.mockResolvedValue([consulta({ clinica: null })])

    montar()

    expect(await screen.findByText('Ana María Ramírez')).toBeInTheDocument()
    expect(screen.getByText(/sin sede registrada/i)).toBeInTheDocument()
  })

  it('muestra un guion donde todavía no hay diagnóstico', async () => {
    listarConsultas.mockResolvedValue([consulta({ diagnostico: null, estado: 'PENDIENTE' })])

    montar()

    const fila = await filaDe('Ana María Ramírez')
    expect(within(fila).getByText('—')).toBeInTheDocument()
    expect(within(fila).getByText('PENDIENTE')).toBeInTheDocument()
  })

  it('muestra una consulta sin motivo con un guion, ni «null» ni un hueco', async () => {
    // La fila trae diagnóstico y clínica, así que el ÚNICO guion posible es el
    // del motivo: si la celda se quedara en blanco —que es lo que hacía
    // `accessorKey`, con `String(null ?? '')`— aquí no habría ninguno.
    listarConsultas.mockResolvedValue([consulta({ motivo: null })])

    montar()

    const fila = await filaDe('Ana María Ramírez')
    expect(within(fila).getByText('—')).toBeInTheDocument()
    expect(within(fila).queryByText(/null/i)).toBeNull()
  })
})

describe('consultas · buscar con una consulta sin motivo en la lista', () => {
  const SIN_MOTIVO = consulta({
    consultaId: 7,
    motivo: null,
    diagnostico: null,
    estado: 'PENDIENTE',
    paciente: {
      personaId: 42,
      expediente: 'EXP-0042',
      nombres: 'Ana María',
      apellidos: 'Ramírez',
    },
  })
  const CON_MOTIVO = consulta({
    consultaId: 8,
    motivo: 'Dolor de garganta',
    paciente: {
      personaId: 51,
      expediente: 'EXP-0051',
      nombres: 'Carlos',
      apellidos: 'Mejía',
    },
  })

  it('no revienta al teclear, y la consulta sin motivo no coincide', async () => {
    listarConsultas.mockResolvedValue([SIN_MOTIVO, CON_MOTIVO])
    const user = montar()
    await screen.findByText('Ana María Ramírez')

    await user.type(screen.getByPlaceholderText(/buscar por paciente/i), 'dolor')

    // Que la pantalla siga en pie ya es media prueba: con
    // `c.motivo.toLowerCase()` el filtro lanza en el primer carácter y no
    // queda tabla que consultar.
    expect(await screen.findByText('Carlos Mejía')).toBeInTheDocument()
    // Y no coincide: sin motivo no hay texto donde buscar. Un filtro que
    // devolviera `true` ante el nulo dejaría la fila puesta y el médico
    // creería que esa consulta sí habla de dolor.
    await waitFor(() => expect(screen.queryByText('Ana María Ramírez')).toBeNull())
  })

  it('sigue encontrando por paciente y por diagnóstico con el nulo presente', async () => {
    // El nulo no puede acabar apagando el resto de la búsqueda: el riesgo de
    // «arreglarlo» con un `return false` de más es dejar la caja inservible.
    listarConsultas.mockResolvedValue([SIN_MOTIVO, CON_MOTIVO])
    const user = montar()
    await screen.findByText('Ana María Ramírez')

    const caja = screen.getByPlaceholderText(/buscar por paciente/i)
    await user.type(caja, 'ramírez')
    expect(await screen.findByText('Ana María Ramírez')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Carlos Mejía')).toBeNull())

    await user.clear(caja)
    await user.type(caja, 'faringitis')
    expect(await screen.findByText('Carlos Mejía')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Ana María Ramírez')).toBeNull())
  })
})

describe('consultas · borrado', () => {
  it('quita la fila solo cuando el servidor confirmó', async () => {
    const user = montar()
    await screen.findByText('Ana María Ramírez')

    await user.click(screen.getByRole('button', { name: /eliminar la consulta de/i }))

    await waitFor(() => expect(eliminarConsulta).toHaveBeenCalledWith(7))
    await waitFor(() => expect(screen.queryByText('Ana María Ramírez')).toBeNull())
  })

  it('deja la fila donde está si el borrado falla, y dice por qué', async () => {
    // El texto es el que ya redactó `services/consultas.ts` a partir del 409
    // en crudo del backend; lo que esta prueba defiende es que la pantalla lo
    // muestre tal cual y no lo cambie por un «no se pudo eliminar» genérico.
    eliminarConsulta.mockRejectedValue(
      new ApiError(
        409,
        'No se puede eliminar la consulta porque tiene prescripciones u otra información asociada.',
      ),
    )
    const user = montar()
    await screen.findByText('Ana María Ramírez')

    await user.click(screen.getByRole('button', { name: /eliminar la consulta de/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no se puede eliminar la consulta porque tiene prescripciones/i,
    )
    expect(screen.getByText('Ana María Ramírez')).toBeInTheDocument()
  })
})

describe('consultas · carga', () => {
  it('muestra el motivo del backend y reintenta cuando se le pide', async () => {
    listarConsultas.mockRejectedValueOnce(
      new ApiError(0, 'No se pudo contactar al servidor. ¿Está corriendo el backend?'),
    )
    const user = montar()

    expect(await screen.findByRole('alert')).toHaveTextContent(/¿está corriendo el backend\?/i)

    listarConsultas.mockResolvedValue([consulta()])
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(await screen.findByText('Ana María Ramírez')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sigue mostrando las consultas aunque falle el catálogo de pacientes', async () => {
    // Leer las consultas es lo principal de esta pantalla; que el desplegable
    // del formulario no se pueda llenar no justifica esconderlas.
    listarPacientes.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))

    montar()

    expect(await screen.findByText('Ana María Ramírez')).toBeInTheDocument()
    // El aviso dice QUÉ se cayó y conserva el motivo del backend: sin el
    // contexto, «Error del servidor (500).» no deja saber si la tabla que se
    // está viendo está completa.
    expect(screen.getByRole('alert')).toHaveTextContent(/catálogo de pacientes/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/Error del servidor \(500\)/i)
  })
})
