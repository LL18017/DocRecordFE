// Guarda del expediente: la consulta que acaba de confirmar el servidor se
// pinta en la tabla del paciente, y `motivo` PUEDE VENIR NULL.
//
// El tipo `Consultation` de la maqueta declara `reason: string`, así que aquí
// no hay nada que obligue a mirar el nulo: `reason: c.motivo` compilaba en
// verde y ponía la palabra «null» en la columna «Motivo» del expediente de un
// paciente. Es el mismo defecto que la búsqueda de consultas, pero más
// callado: no revienta, miente.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Clinica, User } from '@/types'
import type { ConsultaDto, CrearConsultaPayload } from '@/services/consultas'
import type { PacienteDto } from '@/services/pacientes'
import ExpedienteDetailPage from './page'

const obtenerPaciente = vi.fn<(personaId: number) => Promise<PacienteDto>>()
const crearConsulta = vi.fn<(p: CrearConsultaPayload) => Promise<ConsultaDto>>()

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}))

vi.mock('@/services/pacientes', () => ({
  obtenerPaciente: (personaId: number) => obtenerPaciente(personaId),
}))

vi.mock('@/services/consultas', async (importarOriginal) => {
  // `textoOpcional` y los formateadores se dejan reales: son justo lo que esta
  // pantalla tiene que usar bien al adaptar el DTO a la fila de la tabla.
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return { ...real, crearConsulta: (p: CrearConsultaPayload) => crearConsulta(p) }
})

const SESION: { user: User | null; activeClinic: Clinica | null } = {
  user: { name: 'naun@docrecord.sv', email: 'naun@docrecord.sv', role: 'medico' },
  activeClinic: null,
}

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => SESION,
}))

const PACIENTE: PacienteDto = {
  personaId: 42,
  expediente: 'EXP-0042',
  tipoSangre: 'O+',
  creadoEn: '2026-01-10T08:00:00',
  persona: {
    personaId: 42,
    dui: '01234567-8',
    nombres: 'Ana María',
    apellidos: 'Ramírez',
    fechaNacimiento: '1996-06-15',
    sexo: 'F',
    telefono: '7000-0000',
    direccion: 'San Salvador',
  },
}

function consultaRegistrada(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
  return {
    consultaId: 7,
    fecha: '2026-08-23T14:30:00',
    motivo: 'Dolor de garganta',
    diagnostico: null,
    estado: 'PENDIENTE',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: null,
    ...cambios,
  }
}

beforeEach(() => {
  obtenerPaciente.mockReset()
  crearConsulta.mockReset()
  obtenerPaciente.mockResolvedValue(PACIENTE)
  crearConsulta.mockResolvedValue(consultaRegistrada())
})

/** Primera fila de la tabla de consultas, que es donde se prepone la nueva. */
function primeraConsulta() {
  const encabezado = screen.getByRole('columnheader', { name: 'Motivo' })
  const tabla = encabezado.closest('table')
  if (!tabla) throw new Error('El encabezado «Motivo» no está dentro de una tabla.')
  const filas = within(tabla).getAllByRole('row')
  return filas[1]
}

/** Registra una consulta desde el expediente y devuelve lo que quedó pintado. */
async function registrarConsulta(devuelve: ConsultaDto) {
  crearConsulta.mockResolvedValue(devuelve)
  render(<ExpedienteDetailPage />)
  const user = userEvent.setup()

  // El nombre sale varias veces (cabecera, ficha lateral): basta con que
  // el expediente haya terminado de cargar.
  await screen.findAllByText('Ana María Ramírez')
  // Hay cinco botones «Agregar» en el expediente (alergias, enfermedades,
  // hereditarias, hábitos y consultas) y ninguno se distingue por su nombre
  // accesible, así que se busca dentro de la cabecera de Consultas Médicas.
  const cabecera = screen.getByRole('heading', { name: 'Consultas Médicas' }).closest('div')
  if (!cabecera) throw new Error('La cabecera de Consultas Médicas no tiene contenedor.')
  await user.click(within(cabecera).getByRole('button', { name: 'Agregar' }))
  await user.type(screen.getByLabelText(/motivo de consulta/i), 'Control de seguimiento')
  await user.click(screen.getByRole('button', { name: /guardar/i }))

  await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
  return user
}

describe('expediente · la consulta recién registrada', () => {
  it('pinta un guion, no «null», cuando el servidor la devuelve sin motivo', async () => {
    await registrarConsulta(consultaRegistrada({ motivo: null, diagnostico: null }))

    await waitFor(() => expect(within(primeraConsulta()).queryByText(/null/i)).toBeNull())
    // Dos guiones: el motivo y el diagnóstico, que tampoco vino. Si alguno se
    // pintara crudo, aquí habría uno solo —o la palabra «null» de arriba—.
    expect(within(primeraConsulta()).getAllByText('—')).toHaveLength(2)
  })

  it('pinta el motivo tal cual cuando sí viene', async () => {
    // La otra mitad de la guarda: el guion no puede acabar tapando el texto
    // real, que es lo que pasaría con un `textoOpcional` mal aplicado.
    await registrarConsulta(consultaRegistrada({ motivo: 'Control de presión' }))

    await waitFor(() =>
      expect(within(primeraConsulta()).getByText('Control de presión')).toBeInTheDocument(),
    )
  })
})

describe('expediente · nombre accesible de los datos personales', () => {
  /**
   * El bloque «Datos Personales» pinta siete campos editables cuyos `<label>`
   * no apuntaban a ninguno: un lector de pantalla anunciaba siete «cuadros de
   * edición» sin decir cuál era el teléfono y cuál el tipo sanguíneo. En un
   * expediente clínico, capturar el dato en la casilla equivocada no es un
   * detalle estético.
   */
  async function abrirEdicionDeDatos() {
    render(<ExpedienteDetailPage />)
    const user = userEvent.setup()
    await screen.findAllByText('Ana María Ramírez')

    const cabecera = screen.getByText('Datos Personales').closest('div')
    if (!cabecera) throw new Error('La cabecera de Datos Personales no tiene contenedor.')
    await user.click(within(cabecera).getByRole('button', { name: 'Editar' }))
    return user
  }

  it('localiza todos los campos por su etiqueta visible', async () => {
    await abrirEdicionDeDatos()

    for (const etiqueta of [
      /^nombre completo$/i,
      /^fecha de nacimiento$/i,
      /^teléfono$/i,
      /^identificación$/i,
      /^tipo sanguíneo$/i,
      /^email$/i,
      /^dirección$/i,
    ]) {
      expect(screen.getByLabelText(etiqueta).tagName).toBe('INPUT')
    }
  })

  it('cada etiqueta señala el campo que lleva su dato', async () => {
    await abrirEdicionDeDatos()

    // La comprobación que de verdad ata las etiquetas a los campos: si un
    // `htmlFor` apuntara al de al lado, el teléfono saldría bajo «Tipo
    // sanguíneo».
    expect(screen.getByLabelText(/^teléfono$/i)).toHaveValue('7000-0000')
    expect(screen.getByLabelText(/^tipo sanguíneo$/i)).toHaveValue('O+')
    expect(screen.getByLabelText(/^identificación$/i)).toHaveValue('01234567-8')
    expect(screen.getByLabelText(/^dirección$/i)).toHaveValue('San Salvador')
  })

  it('enfoca el campo al hacer clic en su etiqueta', async () => {
    const user = await abrirEdicionDeDatos()

    await user.click(screen.getByText(/^tipo sanguíneo$/i))

    expect(screen.getByLabelText(/^tipo sanguíneo$/i)).toHaveFocus()
  })
})
