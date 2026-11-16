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
import type { ConsultaDto, CrearConsultaPayload } from '@/services/consultas'
import type { PacienteDto } from '@/services/pacientes'
import type { CitaDto } from '@/services/citas'
import ConsultasPage from './page'

const listarConsultas = vi.fn<() => Promise<ConsultaDto[]>>()
const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()
const crearConsulta = vi.fn<(p: CrearConsultaPayload) => Promise<ConsultaDto>>()
const obtenerCita = vi.fn<(id: number) => Promise<CitaDto>>()

// HU-31: la Agenda abre esta pantalla con `?citaId=…&pacienteId=…`. Sin
// parámetros (el resto de pruebas) la pantalla es la de siempre.
let parametros = new URLSearchParams()
vi.mock('next/navigation', () => ({ useSearchParams: () => parametros }))

vi.mock('@/services/citas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/citas')>()
  return { ...real, obtenerCita: (id: number) => obtenerCita(id) }
})

// El formulario de alta lee la sesión: un médico en la sede 5.
vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({
    user: { name: 'Juan Guerra', roles: ['medico'] },
    activeClinic: { id: 5, name: 'Clínica Escalón', lat: null, lng: null },
  }),
}))

vi.mock('@/services/consultas', async (importarOriginal) => {
  // Los formateadores y las ayudas de nulos se dejan reales: son justamente lo
  // que esta pantalla tiene que usar bien.
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return {
    ...real,
    listarConsultas: () => listarConsultas(),
    crearConsulta: (p: CrearConsultaPayload) => crearConsulta(p),
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
    exploracionFisica: null,
    indicaciones: null,
    estado: 'FINALIZADA',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: { clinicaId: 5, name: 'Clínica Escalón' },
    ...cambios,
  }
}

beforeEach(() => {
  parametros = new URLSearchParams()
  listarConsultas.mockReset()
  listarPacientes.mockReset()
  crearConsulta.mockReset()
  obtenerCita.mockReset()
  listarConsultas.mockResolvedValue([consulta()])
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

describe('consultas · TODOS los campos anulables nulos a la vez', () => {
  // Las pruebas de arriba anulan un campo por vez. El contrato permite que
  // `motivo`, `diagnostico`, `clinica` y `medico.especialidad` vengan null
  // JUNTOS en la misma fila —por ejemplo una consulta PENDIENTE, registrada
  // sin sede, por un administrador que atiende sin especialidad capturada—,
  // y nada garantiza que las guardas que funcionan una a una sigan
  // funcionando cuando se combinan: un `??`/`?.` que dependiera por error de
  // otro campo ya resuelto no se vería con un solo nulo a la vez.
  const TODO_NULO = consulta({
    consultaId: 99,
    motivo: null,
    diagnostico: null,
    estado: 'PENDIENTE',
    clinica: null,
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
  })

  it('pinta la fila entera sin reventar y sin ninguna palabra "null" visible', async () => {
    listarConsultas.mockResolvedValue([TODO_NULO])

    montar()

    const fila = await filaDe('Ana María Ramírez')
    // Dos guiones: uno por motivo, otro por diagnóstico.
    expect(within(fila).getAllByText('—')).toHaveLength(2)
    expect(within(fila).getByText(/sin sede registrada/i)).toBeInTheDocument()
    expect(within(fila).queryByText(/null/i)).toBeNull()
  })

  it('sigue encontrándose por paciente aunque motivo, diagnóstico y clínica sean null a la vez', async () => {
    listarConsultas.mockResolvedValue([TODO_NULO])
    const user = montar()
    await screen.findByText('Ana María Ramírez')

    // Buscar por el nombre del paciente tiene que seguir funcionando: si el
    // filtro reventara en cuanto `c.motivo` o `c.diagnostico` fueran null
    // (`c.motivo.toLowerCase()` sin el `?.`), esta búsqueda nunca llegaría a
    // comparar el nombre y la fila desaparecería con el primer carácter.
    await user.type(screen.getByPlaceholderText(/buscar por paciente/i), 'ramírez')

    expect(await screen.findByText('Ana María Ramírez')).toBeInTheDocument()
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

describe('consultas · el borrado ya no se ofrece', () => {
  it('no hay botón de eliminar en ninguna fila', async () => {
    // Lo había, y borraba de verdad: con el ON DELETE CASCADE del backend se
    // llevaba por delante las recetas emitidas. HU-21 lo prohíbe —«el sistema
    // nunca ejecuta un DELETE sobre una consulta»— porque una consulta
    // equivocada ocurrió, y hacerla desaparecer no corrige el error, lo
    // esconde.
    //
    // Esta prueba vigila que no vuelva mientras la anulación no exista.
    montar()
    await screen.findByText('Ana María Ramírez')

    expect(screen.queryByRole('button', { name: /eliminar la consulta de/i })).toBeNull()
    // Editar sí sigue estando: corregir no es lo mismo que borrar.
    expect(screen.getByRole('button', { name: /editar la consulta de/i })).toBeInTheDocument()
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

describe('consultas · iniciada desde la cita de la agenda (HU-31 c5)', () => {
  const CITA: CitaDto = {
    citaId: 15,
    fechaHora: '2026-11-15T09:00:00',
    tipoCitaId: 1,
    tipoCita: 'Consulta general',
    pacienteId: 42,
    paciente: 'Ana María Ramírez',
    expediente: 'EXP-0042',
    medicoId: 3,
    medico: 'Juan Guerra',
    clinicaId: 5,
    clinica: 'Clínica Escalón',
    estado: 'AGENDADA',
    motivoCancelacion: null,
    motivo: 'Control de presión arterial',
  }

  it('abre el alta con el paciente y el motivo de la cita, y envía el citaId', async () => {
    parametros = new URLSearchParams({ citaId: '15', pacienteId: '42' })
    obtenerCita.mockResolvedValue(CITA)
    crearConsulta.mockResolvedValue(consulta({ consultaId: 30 }))
    const user = montar()

    const motivo = await screen.findByLabelText(/motivo de consulta/i)
    expect(obtenerCita).toHaveBeenCalledWith(15)
    expect(motivo).toHaveValue('Control de presión arterial')
    expect(screen.getByLabelText(/^paciente/i)).toHaveValue('42')

    await user.type(screen.getByLabelText(/^diagnóstico/i), 'Hipertensión controlada')
    await user.click(screen.getByRole('button', { name: /guardar consulta/i }))

    await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
    expect(crearConsulta.mock.calls[0][0]).toMatchObject({
      pacienteId: 42,
      citaId: 15,
      motivo: 'Control de presión arterial',
      diagnostico: 'Hipertensión controlada',
    })
    expect(await screen.findByText(/la cita quedó atendida/i)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Volver a la agenda' })).toHaveAttribute('href', '/agenda')
  })

  it('no abre el alta si la cita ya no está agendada', async () => {
    parametros = new URLSearchParams({ citaId: '15', pacienteId: '42' })
    obtenerCita.mockResolvedValue({ ...CITA, estado: 'ATENDIDA' })
    montar()

    expect(await screen.findByText(/está atendida: ya no se inicia una consulta/i)).toBeVisible()
    expect(screen.queryByLabelText(/motivo de consulta/i)).toBeNull()
  })
})
