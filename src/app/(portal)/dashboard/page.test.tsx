// Guardas del panel.
//
// EL FALLO: esta pantalla no hacía UNA SOLA llamada al backend. Las cuatro
// tarjetas estaban escritas a mano en el JSX —«48 pacientes activos / 12
// consultas hoy / 7 prescripciones hoy / 3 clínicas»— cuando la realidad era
// 6 / 2 / 1 / 1, y la gráfica y las «próximas citas» salían de
// `@/data/mockData`. Una cifra inventada es peor que un hueco porque se ve
// exactamente igual que una verdadera: el usuario no puede distinguirlas.
//
// La prueba que más importa aquí es la que se pone ROJA si alguien vuelve a
// sembrar un número fijo: cada tarjeta muestra lo que devolvió el API, y las
// cifras de la maqueta no aparecen por ninguna parte.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { User } from '@/types'
import type { PacienteDto } from '@/services/pacientes'
import type { ClinicaDto } from '@/services/clinicas'
import type { ConsultaDto } from '@/services/consultas'
import DashboardPage from './page'

const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()
const listarConsultas = vi.fn<() => Promise<ConsultaDto[]>>()
const listarMisClinicas = vi.fn<() => Promise<ClinicaDto[]>>()

vi.mock('@/services/pacientes', () => ({
  listarPacientes: () => listarPacientes(),
}))

vi.mock('@/services/consultas', async (importarOriginal) => {
  // Los formateadores y ayudas se dejan reales: son justo lo que la pantalla
  // tiene que usar bien.
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return { ...real, listarConsultas: () => listarConsultas() }
})

vi.mock('@/services/clinicas', () => ({
  listarMisClinicas: () => listarMisClinicas(),
}))

const MEDICO: User = { name: 'Naun Flores', email: 'naun@docrecord.sv', roles: ['medico'] }

vi.mock('@/context/AppContext', () => ({
  useUsuarioAutenticado: () => MEDICO,
}))

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Instante local de hoy desplazado `atras` días. El panel usa el reloj real. */
function instante(atras: number, hora = '10:00:00'): string {
  const ahora = new Date()
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - atras)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`
}

function paciente(personaId: number): PacienteDto {
  return {
    personaId,
    expediente: `EXP-${personaId}`,
    tipoSangre: 'O+',
    creadoEn: '2026-01-10T09:00:00',
    persona: {
      personaId,
      dui: null,
      nombres: `Paciente ${personaId}`,
      apellidos: 'De Prueba',
      fechaNacimiento: '1996-06-15',
      sexo: 'M',
      telefono: null,
      direccion: null,
      email: null,
    },
  }
}

function consulta(cambios: Partial<ConsultaDto> & { pacienteId?: number } = {}): ConsultaDto {
  const { pacienteId = 42, ...resto } = cambios
  return {
    consultaId: 1,
    fecha: instante(0),
    motivo: 'Dolor de garganta',
    diagnostico: null,
    estado: 'FINALIZADA',
    paciente: {
      personaId: pacienteId,
      expediente: `EXP-${pacienteId}`,
      nombres: 'Ana',
      apellidos: 'Ramírez',
    },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: null,
    ...resto,
  }
}

function clinica(clinicaId: number): ClinicaDto {
  return { clinicaId, name: `Clínica ${clinicaId}`, latitud: null, longitud: null }
}

/**
 * Valor de una tarjeta, buscado a partir de su etiqueta. Se lee el DOM como lo
 * lee el usuario: la etiqueta y el número viven en el mismo bloque.
 */
function valorDeTarjeta(etiqueta: string): string {
  const rotulo = screen.getByText(etiqueta)
  const bloque = rotulo.parentElement
  if (!bloque) throw new Error(`La etiqueta "${etiqueta}" no tiene contenedor.`)
  const valor = bloque.firstElementChild
  if (!valor) throw new Error(`La tarjeta "${etiqueta}" no muestra ningún valor.`)
  return valor.textContent ?? ''
}

beforeEach(() => {
  listarPacientes.mockReset()
  listarConsultas.mockReset()
  listarMisClinicas.mockReset()
  listarPacientes.mockResolvedValue([])
  listarConsultas.mockResolvedValue([])
  listarMisClinicas.mockResolvedValue([])
})

describe('panel · las cifras salen del API', () => {
  it('muestra lo que devolvió el backend y ninguna de las cifras de la maqueta', async () => {
    // Exactamente el escenario real que destapó el fallo: 6 pacientes,
    // 2 consultas hoy, 1 clínica. El panel presumía 48 / 12 / 7 / 3.
    listarPacientes.mockResolvedValue([1, 2, 3, 4, 5, 6].map(paciente))
    listarConsultas.mockResolvedValue([
      consulta({ consultaId: 1, pacienteId: 1, fecha: instante(0, '08:00:00') }),
      consulta({ consultaId: 2, pacienteId: 2, fecha: instante(0, '16:00:00') }),
      consulta({ consultaId: 3, pacienteId: 3, fecha: instante(5) }),
      consulta({ consultaId: 4, pacienteId: 4, fecha: instante(9) }),
    ])
    listarMisClinicas.mockResolvedValue([clinica(1)])

    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('6'))
    expect(valorDeTarjeta('Consultas hoy')).toBe('2')
    expect(valorDeTarjeta('Consultas registradas')).toBe('4')
    expect(valorDeTarjeta('Mis clínicas')).toBe('1')

    // Las cifras sembradas a mano no pueden reaparecer por ninguna vía.
    // Ninguna de las cuatro es un valor legítimo en este escenario, así que
    // encontrarla solo puede significar que volvió a escribirse en el JSX.
    for (const inventada of ['48', '12', '7']) {
      expect(
        screen.queryByText(inventada, { selector: 'p.text-2xl' }),
        `la cifra ${inventada} de la maqueta sigue en el panel`,
      ).toBeNull()
    }

    // Y tampoco los rótulos que prometían más de lo que el API sabe:
    // «activos» no existe como estado, y `/clinics/mias` no da un total.
    expect(screen.queryByText(/pacientes activos/i)).toBeNull()
    expect(screen.queryByText(/total de clínicas/i)).toBeNull()
  })

  it('sigue las cifras del API cuando cambian, sin quedarse en un número fijo', async () => {
    listarPacientes.mockResolvedValue([paciente(1), paciente(2)])
    listarConsultas.mockResolvedValue([consulta({ consultaId: 1 })])
    listarMisClinicas.mockResolvedValue([clinica(1), clinica(2), clinica(3)])

    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('2'))
    expect(valorDeTarjeta('Consultas hoy')).toBe('1')
    expect(valorDeTarjeta('Mis clínicas')).toBe('3')
  })

  it('con el sistema vacío muestra ceros de verdad, no cifras de relleno', async () => {
    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('0'))
    expect(valorDeTarjeta('Consultas hoy')).toBe('0')
    expect(valorDeTarjeta('Consultas registradas')).toBe('0')
    expect(valorDeTarjeta('Mis clínicas')).toBe('0')
    expect(screen.getByText(/todavía no hay ninguna consulta registrada/i)).toBeInTheDocument()
  })

  it('«Consultas hoy» no cuenta las de otros días', async () => {
    listarConsultas.mockResolvedValue([
      consulta({ consultaId: 1, fecha: instante(0, '09:00:00') }),
      consulta({ consultaId: 2, fecha: instante(1) }),
      consulta({ consultaId: 3, fecha: instante(2) }),
      consulta({ consultaId: 4, fecha: instante(3) }),
    ])

    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Consultas hoy')).toBe('1'))
    expect(valorDeTarjeta('Consultas registradas')).toBe('4')
  })

  it('pide de verdad a los tres servicios al montar', async () => {
    render(<DashboardPage />)

    await waitFor(() => expect(listarPacientes).toHaveBeenCalledTimes(1))
    expect(listarConsultas).toHaveBeenCalledTimes(1)
    expect(listarMisClinicas).toHaveBeenCalledTimes(1)
  })
})

describe('panel · lo que no se puede saber', () => {
  it('muestra un guion, y no un cero, cuando la petición falla', async () => {
    // Un 0 aquí sería indistinguible de «no hay ninguno», que es una
    // afirmación que el panel no puede hacer si nunca recibió la lista.
    listarPacientes.mockRejectedValue(new ApiError(500, 'Se cayó la base de datos'))
    listarConsultas.mockResolvedValue([consulta()])
    listarMisClinicas.mockResolvedValue([clinica(1)])

    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('—'))
    expect(valorDeTarjeta('Consultas hoy')).toBe('1')
    expect(await screen.findByRole('alert')).toHaveTextContent(/se cayó la base de datos/i)
  })

  it('sin consultas cargadas no dibuja la gráfica ni la rellena con nada', async () => {
    listarConsultas.mockRejectedValue(new ApiError(403, 'No autorizado'))

    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Consultas hoy')).toBe('—'))
    expect(valorDeTarjeta('Consultas registradas')).toBe('—')
    expect(screen.getByText(/no se puede dibujar esta curva/i)).toBeInTheDocument()
  })

  it('que fallen las clínicas no deja sin cifras al resto del panel', async () => {
    // A una enfermera `/clinics/mias` le responde 403. Eso no puede vaciar el
    // panel entero: cada tarjeta enseña lo suyo o su hueco.
    listarPacientes.mockResolvedValue([paciente(1), paciente(2), paciente(3)])
    listarMisClinicas.mockRejectedValue(new ApiError(403, 'Acceso denegado'))

    render(<DashboardPage />)

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('3'))
    expect(valorDeTarjeta('Mis clínicas')).toBe('—')
  })

  it('reintentar vuelve a pedirlo todo y las cifras se recuperan', async () => {
    listarPacientes.mockRejectedValueOnce(new ApiError(500, 'Fallo temporal'))
    listarPacientes.mockResolvedValue([paciente(1), paciente(2)])

    render(<DashboardPage />)
    const user = userEvent.setup()

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('—'))

    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    await waitFor(() => expect(valorDeTarjeta('Pacientes registrados')).toBe('2'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('panel · lo que ya no promete', () => {
  it('no muestra citas inventadas ni el médico que no existe', async () => {
    render(<DashboardPage />)

    await waitFor(() => expect(listarPacientes).toHaveBeenCalled())

    expect(screen.queryByText(/próximas citas/i)).toBeNull()
    expect(screen.queryByText(/juan guerra/i)).toBeNull()
    expect(screen.queryByText(/confirmada/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /ver agenda completa/i })).toBeNull()
  })

  it('no ofrece una cifra de prescripciones que el API no permite calcular', async () => {
    // `GET /prescripciones` exige consultaId o pacienteId: no hay forma de
    // contar las del día sin una petición por paciente. La tarjeta se retira
    // en vez de estimarse.
    render(<DashboardPage />)

    await waitFor(() => expect(listarPacientes).toHaveBeenCalled())

    expect(screen.queryByText(/prescripciones hoy/i)).toBeNull()
  })
})
