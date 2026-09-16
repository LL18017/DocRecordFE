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
import userEvent from '@testing-library/user-event'
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
    estado: 'ACTIVO',
    persona: {
      personaId,
      dui: `0123456${personaId}-8`,
      nombres,
      apellidos: 'Pérez',
      fechaNacimiento: '1996-06-15',
      sexo: 'M',
      telefono: '7000-0000',
      direccion: 'San Salvador',
      email: null,
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

// ─── HU-10 criterio 1: la baja se confirma antes de aplicarse ───────────────
//
// EL FALLO: el icono de baja de la tabla llamaba al API en el mismo clic. Las
// seis acciones de una fila caben en unos pocos píxeles y se repiten idénticas
// en cada una, así que errar de fila —o de botón dentro de la fila— es cuestión
// de tiempo; y el error no se veía venir ni se podía detener.
//
// Que la baja sea lógica no lo vuelve inocuo: el paciente desaparece del
// listado de trabajo diario sin que nadie lo haya pedido, y quien lo atiende
// mañana no lo encuentra. Estas guardas fijan las dos mitades del criterio: sin
// confirmar no se da de baja a nadie, y al confirmar sí se aplica.

const abrirConfirmacion = async () => {
  const user = userEvent.setup()
  render(<PacientesPage />)
  await screen.findByText(/Carlos/)
  await user.click(screen.getAllByTitle('Desactivar paciente')[0])
  return user
}

const botonDesactivar = () => screen.getByRole('button', { name: 'Desactivar' })

/** Buscar dentro de la tabla y no en toda la pantalla: con el diálogo abierto
 *  el nombre del paciente sale dos veces, y solo una de ellas es la fila. */
const enTabla = () => within(screen.getByRole('table'))

describe('pacientes · confirmación antes de dar de baja', () => {
  it('el icono de la fila no da de baja: solo pide confirmación', async () => {
    await abrirConfirmacion()

    expect(eliminarPaciente).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // La fila sigue donde estaba mientras nadie confirme.
    expect(enTabla().getByText(/Carlos/)).toBeInTheDocument()
  })

  it('el diálogo nombra a quién se va a dar de baja', async () => {
    // Un «¿estás seguro?» anónimo no distingue entre la fila que se quiso
    // pulsar y la de al lado, así que ratifica el error en vez de atajarlo.
    await abrirConfirmacion()

    expect(within(screen.getByRole('dialog')).getByText(/Carlos/)).toBeInTheDocument()
  })

  it('dice la verdad sobre la baja: no promete un borrado que no ocurre', async () => {
    // El diálogo de clínicas advierte que la acción no se puede deshacer. Aquí
    // eso sería falso —el expediente y las consultas siguen ahí— y una
    // advertencia falsa desgasta la credibilidad del resto.
    await abrirConfirmacion()

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent(/expediente/i)
    expect(dialogo).toHaveTextContent(/incluir inactivos/i)
    expect(dialogo).not.toHaveTextContent(/no se puede deshacer/i)
  })

  it('cancelar deja al paciente como estaba', async () => {
    const user = await abrirConfirmacion()

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(eliminarPaciente).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(enTabla().getByText(/Carlos/)).toBeInTheDocument()
  })

  it('al confirmar sí se aplica la baja y la fila sale del listado', async () => {
    const user = await abrirConfirmacion()

    await user.click(botonDesactivar())

    await waitFor(() => expect(eliminarPaciente).toHaveBeenCalledWith(1))
    expect(eliminarPaciente).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(enTabla().queryByText(/Carlos/)).toBeNull())
    // Solo se va el confirmado: el de al lado no se toca.
    expect(enTabla().getByText(/Elena/)).toBeInTheDocument()
  })

  it('si el servidor rechaza la baja, se avisa y el paciente se queda', async () => {
    eliminarPaciente.mockRejectedValue(new ApiError(409, 'El paciente tiene consultas abiertas'))

    const user = await abrirConfirmacion()
    await user.click(botonDesactivar())

    expect(await screen.findByRole('alert')).toHaveTextContent(/consultas abiertas/i)
    // Nada de optimismo: la fila solo desaparece cuando el servidor confirma.
    expect(enTabla().getByText(/Carlos/)).toBeInTheDocument()
  })
})
