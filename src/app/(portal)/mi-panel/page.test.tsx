// Portal del paciente (HU-34): el paciente ve SU expediente, con los términos
// explicados, sin un solo control que lo modifique, y lo descarga en PDF.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { MiExpedienteDto } from '@/services/portal'
import MiExpedientePage from './page'

const obtenerMiExpediente = vi.fn<() => Promise<MiExpedienteDto>>()
const descargarMiExpedientePdf = vi.fn<(expediente: string) => Promise<void>>()

vi.mock('@/services/portal', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/portal')>()
  return {
    ...real,
    // Sin argumentos a propósito: el expediente es el de la sesión (c2).
    obtenerMiExpediente: (...args: unknown[]) => {
      expect(args).toEqual([])
      return obtenerMiExpediente()
    },
    descargarMiExpedientePdf: (expediente: string) => descargarMiExpedientePdf(expediente),
  }
})

const GLOSARIO = [
  { clave: 'expediente', termino: 'Número de expediente', explicacion: 'El número con que la clínica identifica tu historia.' },
  { clave: 'tipoSangre', termino: 'Tipo de sangre', explicacion: 'Tu grupo sanguíneo y su factor Rh.' },
  { clave: 'alergia', termino: 'Alergia', explicacion: 'Una reacción de tu cuerpo ante una sustancia.' },
  { clave: 'severidad.SEVERA', termino: 'Severidad severa', explicacion: 'Puede poner en riesgo tu vida.' },
  { clave: 'presionArterial', termino: 'Presión arterial', explicacion: 'La fuerza con que la sangre empuja las arterias.' },
  { clave: 'imc', termino: 'Índice de masa corporal (IMC)', explicacion: 'Relaciona tu peso con tu estatura.' },
  { clave: 'diagnostico', termino: 'Diagnóstico', explicacion: 'Lo que el médico concluyó sobre tu salud.' },
  { clave: 'consulta.ANULADA', termino: 'Consulta anulada', explicacion: 'La consulta se invalidó.' },
  { clave: 'viaAdministracion', termino: 'Vía de administración', explicacion: 'Por dónde entra el medicamento.' },
  { clave: 'receta.EMITIDA', termino: 'Receta vigente', explicacion: 'La receta es válida.' },
  { clave: 'cita.AGENDADA', termino: 'Cita agendada', explicacion: 'La cita está reservada.' },
]

function expediente(cambios: Partial<MiExpedienteDto> = {}): MiExpedienteDto {
  return {
    paciente: {
      personaId: 42,
      expediente: 'P-000042',
      nombres: 'Ana',
      apellidos: 'Pérez',
      dui: '01234567-8',
      fechaNacimiento: '1990-05-20',
      sexo: 'F',
      tipoSangre: 'O+',
      telefono: null,
      direccion: null,
      email: 'ana@correo.sv',
    },
    alergias: [
      {
        alergiaId: 1,
        pacienteId: 42,
        sustancia: 'Penicilina',
        reaccion: 'Urticaria',
        severidad: 'SEVERA',
        fechaDeteccion: '2020-03-15',
        registradaPor: 'Enfermera De Turno',
        registradaEn: '2026-10-01T09:00:00',
        eliminadaPor: null,
        eliminadaEn: null,
      },
    ],
    ultimosSignosVitales: {
      signosVitalesId: 5,
      tomadoEn: '2026-11-01T08:30:00',
      paciente: { personaId: 42, expediente: 'P-000042', nombres: 'Ana', apellidos: 'Pérez' },
      enfermera: { personaId: 3, nombres: 'Enfermera', apellidos: 'De Turno' },
      consultaId: 7,
      pesoKg: 60,
      estaturaCm: 160,
      temperaturaC: null,
      presionSistolica: 120,
      presionDiastolica: 80,
      pulsoLpm: 72,
      frecuenciaRespRpm: null,
      saturacionPct: null,
      observaciones: null,
      imc: 23.4,
      clasificacionImc: 'Normal',
      estado: 'ACTIVA',
      motivoAnulacion: null,
      anuladaEn: null,
      anuladaPor: null,
    },
    consultas: [
      {
        consultaId: 7,
        fecha: '2026-11-01T09:00:00',
        motivo: 'Dolor de garganta',
        diagnostico: 'Faringitis aguda',
        exploracionFisica: 'Amígdalas inflamadas',
        indicaciones: 'Reposo y líquidos',
        estado: 'FINALIZADA',
        paciente: { personaId: 42, expediente: 'P-000042', nombres: 'Ana', apellidos: 'Pérez' },
        medico: { personaId: 9, nombres: 'Carlos', apellidos: 'Menjívar', especialidad: 'Medicina General' },
        clinica: { clinicaId: 1, name: 'Unidad de Salud Escalón' },
        motivoAnulacion: null,
        anuladaEn: null,
        anuladaPor: null,
      },
      {
        consultaId: 6,
        fecha: '2026-10-20T10:00:00',
        motivo: 'Control',
        diagnostico: 'Sin hallazgos',
        exploracionFisica: null,
        indicaciones: null,
        estado: 'ANULADA',
        paciente: { personaId: 42, expediente: 'P-000042', nombres: 'Ana', apellidos: 'Pérez' },
        medico: { personaId: 9, nombres: 'Carlos', apellidos: 'Menjívar', especialidad: 'Medicina General' },
        clinica: null,
        motivoAnulacion: 'Se registró al paciente equivocado',
        anuladaEn: '2026-10-20T10:05:00',
        anuladaPor: 'Carlos Menjívar',
      },
    ],
    recetas: [
      {
        prescripcionId: 3,
        fecha: '2026-11-01T09:15:00',
        consultaId: 7,
        paciente: { personaId: 42, expediente: 'P-000042', nombres: 'Ana', apellidos: 'Pérez' },
        medico: { personaId: 9, nombres: 'Carlos', apellidos: 'Menjívar', registroJunta: 'JVPM-4471' },
        clinica: { clinicaId: 1, name: 'Unidad de Salud Escalón' },
        fechaConsulta: '2026-11-01T09:00:00',
        medicamentos: [
          {
            id: 1,
            medicamentoId: 6,
            medicamento: 'Amoxicilina 500 mg',
            dosis: '1 cápsula',
            viaAdministracion: 'Oral',
            frecuencia: 'Cada 8 horas',
            duracion: '7 días',
          },
        ],
        estado: 'EMITIDA',
        motivoAnulacion: null,
        anuladaEn: null,
        anuladaPor: null,
      },
    ],
    proximasCitas: [
      {
        citaId: 11,
        fechaHora: '2026-11-10T10:00:00',
        tipoCitaId: 1,
        tipoCita: 'Control',
        pacienteId: 42,
        paciente: 'Ana Pérez',
        expediente: 'P-000042',
        medicoId: 9,
        medico: 'Carlos Menjívar',
        clinicaId: 1,
        clinica: 'Unidad de Salud Escalón',
        estado: 'AGENDADA',
        motivoCancelacion: null,
      },
    ],
    glosario: GLOSARIO,
    consultadoEn: '2026-11-03T12:00:00',
    ...cambios,
  } as MiExpedienteDto
}

beforeEach(() => {
  obtenerMiExpediente.mockReset()
  descargarMiExpedientePdf.mockReset()
  obtenerMiExpediente.mockResolvedValue(expediente())
  descargarMiExpedientePdf.mockResolvedValue()
})

async function montar() {
  const user = userEvent.setup()
  render(<MiExpedientePage />)
  await screen.findByText('Mis alergias', { selector: 'h2' })
  return user
}

// Por el título y no con getByRole('region'): las consultas por rol recorren
// el árbol de accesibilidad entero y, con un expediente completo en pantalla,
// cada una cuesta lo bastante como para rozar el tiempo límite de la prueba.
function seccion(nombre: string) {
  const seccion = screen.getByText(nombre, { selector: 'h2' }).closest('section')
  if (!seccion) throw new Error(`no hay sección «${nombre}»`)
  return within(seccion)
}

describe('HU-34 c1 · el paciente ve su expediente', () => {
  it('muestra sus alergias, consultas, recetas y próximas citas', async () => {
    await montar()
    expect(screen.getByText('Ana Pérez · Expediente P-000042')).toBeVisible()

    expect(seccion('Mis alergias').getByText('Penicilina')).toBeVisible()
    expect(seccion('Mis alergias').getByText(/reacción: urticaria/i)).toBeVisible()

    const consultas = seccion('Mis consultas')
    // A él no se le recorta el diagnóstico.
    expect(consultas.getByText('Faringitis aguda')).toBeVisible()
    expect(consultas.getByText('Amígdalas inflamadas')).toBeVisible()

    const recetas = seccion('Mis recetas')
    expect(recetas.getByText('Amoxicilina 500 mg')).toBeVisible()
    expect(recetas.getByText('Cada 8 horas')).toBeVisible()

    const citas = seccion('Mis próximas citas')
    expect(citas.getByText(/control · con carlos menjívar · unidad de salud escalón/i)).toBeVisible()

    expect(seccion('Mis últimos signos vitales').getByText('120/80 mmHg')).toBeVisible()
  })

  it('la consulta anulada se ve, marcada y con su motivo', async () => {
    await montar()
    const anulada = screen.getByLabelText(/^consulta del 20 /i)
    expect(within(anulada).getByText('Anulada')).toBeVisible()
    expect(within(anulada).getByRole('note')).toHaveTextContent('Motivo: Se registró al paciente equivocado')
  })

  it('dice con palabras cuando una sección está vacía', async () => {
    obtenerMiExpediente.mockResolvedValue(
      expediente({ alergias: [], consultas: [], recetas: [], proximasCitas: [], ultimosSignosVitales: null }),
    )
    await montar()
    expect(screen.getByText('No tienes alergias registradas.')).toBeVisible()
    expect(screen.getByText('No tienes consultas registradas.')).toBeVisible()
    expect(screen.getByText('No tienes recetas registradas.')).toBeVisible()
    expect(screen.getByText('No tienes citas próximas.')).toBeVisible()
    expect(screen.getByText('Todavía no se te han tomado signos vitales.')).toBeVisible()
  })

  it('si el expediente no se puede abrir lo dice y deja reintentar', async () => {
    obtenerMiExpediente.mockRejectedValueOnce(
      new ApiError(403, 'Su cuenta no está vinculada a un expediente de paciente'),
    )
    const user = userEvent.setup()
    render(<MiExpedientePage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('no está vinculada a un expediente')

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Mis alergias', { selector: 'h2' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('HU-34 c3 · los términos técnicos vienen explicados', () => {
  it('cada término lleva su explicación a la vista, sin tener que pasar el ratón', async () => {
    await montar()
    const signos = seccion('Mis últimos signos vitales')
    expect(signos.getByText('Presión arterial')).toBeVisible()
    expect(signos.getByText('La fuerza con que la sangre empuja las arterias.')).toBeVisible()
    expect(signos.getByText('Relaciona tu peso con tu estatura.')).toBeVisible()

    expect(seccion('Mis alergias').getByText('Puede poner en riesgo tu vida.')).toBeVisible()
    expect(seccion('Mis datos').getByText('Tu grupo sanguíneo y su factor Rh.')).toBeVisible()
    expect(seccion('Mis consultas').getByText('Lo que el médico concluyó sobre tu salud.')).toBeVisible()
    expect(seccion('Mis consultas').getByText('La consulta se invalidó.')).toBeVisible()
    expect(seccion('Mis recetas').getByText('Por dónde entra el medicamento.')).toBeVisible()
  })

  it('una clave que el glosario no trae no rompe la pantalla', async () => {
    obtenerMiExpediente.mockResolvedValue(expediente({ glosario: [] }))
    await montar()
    expect(seccion('Mis últimos signos vitales').getByText('Presión arterial')).toBeVisible()
    expect(screen.queryByText('La fuerza con que la sangre empuja las arterias.')).not.toBeInTheDocument()
  })
})

describe('HU-34 c4 · el portal es de solo lectura', () => {
  it('no ofrece ningún control para modificar datos', async () => {
    await montar()
    // El único botón es la descarga del PDF: nada de editar, anular, borrar
    // ni registrar, y ningún campo donde escribir.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Descargar mi expediente (PDF)'])
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.getByText('Solo lectura.')).toBeVisible()
  })
})

describe('HU-34 c5 · descargar el expediente en PDF', () => {
  it('el botón baja el PDF de su expediente', async () => {
    const user = await montar()
    await user.click(screen.getByRole('button', { name: 'Descargar mi expediente (PDF)' }))
    await waitFor(() => expect(descargarMiExpedientePdf).toHaveBeenCalledWith('P-000042'))
  })

  it('si el PDF falla lo dice junto al botón', async () => {
    descargarMiExpedientePdf.mockRejectedValue(new Error('No fue posible generar el PDF del expediente'))
    const user = await montar()
    await user.click(screen.getByRole('button', { name: 'Descargar mi expediente (PDF)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible generar el PDF')
  })
})
