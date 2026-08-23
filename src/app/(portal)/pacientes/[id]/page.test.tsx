// Guardas del expediente de un paciente.
//
// Lo que vigila este archivo es el defecto más grave que ha tenido esta
// aplicación: la pantalla llevaba ESCRITA EN EL CÓDIGO una alergia a la
// Penicilina de severidad Alta, una hipertensión con su Losartán, un padre
// diabético y unos signos vitales tomados por una enfermera inexistente, y los
// pintaba idénticos para CUALQUIER paciente. Un médico que abre el expediente
// no tiene forma de distinguir eso de un antecedente real: una alergia
// inventada puede hacer que se le niegue a alguien el antibiótico que
// necesita.
//
// De ahí que aquí no baste con comprobar que se muestra lo que devuelve el
// API. Se comprueba además, con TODAS las secciones desplegadas, que NO se
// muestra nada más: si alguien vuelve a sembrar un literal, estas pruebas se
// ponen rojas. Y se comprueba el otro lado del mismo problema —la maqueta
// tapaba las consultas de verdad, que existían en la base y no se veían—
// exigiendo que la pantalla pida las consultas y las recetas del paciente.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { consultations as consultasDeMaqueta, vitals as vitalesDeMaqueta } from '@/data/mockData'
import type { Clinica, User } from '@/types'
import type { ConsultaDto, CrearConsultaPayload } from '@/services/consultas'
import type { PrescripcionDto } from '@/services/prescripciones'
import type { PacienteDto } from '@/services/pacientes'
import ExpedienteDetailPage from './page'

const obtenerPaciente = vi.fn<(personaId: number) => Promise<PacienteDto>>()
const listarConsultas = vi.fn<(pacienteId?: number) => Promise<ConsultaDto[]>>()
const listarPrescripcionesDePaciente = vi.fn<(pacienteId: number) => Promise<PrescripcionDto[]>>()
const crearConsulta = vi.fn<(p: CrearConsultaPayload) => Promise<ConsultaDto>>()

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}))

vi.mock('@/services/pacientes', () => ({
  obtenerPaciente: (personaId: number) => obtenerPaciente(personaId),
}))

vi.mock('@/services/consultas', async (importarOriginal) => {
  // `textoOpcional` y los formateadores se dejan reales: son justo lo que esta
  // pantalla tiene que usar bien al pintar el DTO.
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return {
    ...real,
    listarConsultas: (pacienteId?: number) => listarConsultas(pacienteId),
    crearConsulta: (p: CrearConsultaPayload) => crearConsulta(p),
  }
})

vi.mock('@/services/prescripciones', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/prescripciones')>()
  return {
    ...real,
    listarPrescripcionesDePaciente: (pacienteId: number) =>
      listarPrescripcionesDePaciente(pacienteId),
  }
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

/**
 * Ninguno de estos textos coincide con `@/data/mockData` a propósito: las
 * pruebas que exigen «esto no está» perderían todo su valor si el dato real y
 * el inventado se llamaran igual.
 */
function consultaRegistrada(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
  return {
    consultaId: 7,
    fecha: '2026-08-23T14:30:00',
    motivo: 'Control de presión arterial',
    diagnostico: 'Presión dentro de rango',
    estado: 'FINALIZADA',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Sofía', apellidos: 'Recinos', especialidad: null },
    clinica: null,
    ...cambios,
  }
}

function recetaEmitida(cambios: Partial<PrescripcionDto> = {}): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T14:45:00',
    consultaId: 7,
    medico: { personaId: 3, nombres: 'Sofía', apellidos: 'Recinos' },
    medicamentos: [
      {
        id: 91,
        medicamento: 'Enalapril 10mg',
        dosis: '1 tableta',
        frecuencia: 'Cada 12 horas',
        duracion: null,
      },
    ],
    ...cambios,
  }
}

beforeEach(() => {
  obtenerPaciente.mockReset()
  listarConsultas.mockReset()
  listarPrescripcionesDePaciente.mockReset()
  crearConsulta.mockReset()
  obtenerPaciente.mockResolvedValue(PACIENTE)
  listarConsultas.mockResolvedValue([])
  listarPrescripcionesDePaciente.mockResolvedValue([])
  crearConsulta.mockResolvedValue(consultaRegistrada())
})

/** Monta la pantalla y espera a que el expediente termine de cargar. */
async function montar() {
  render(<ExpedienteDetailPage />)
  const user = userEvent.setup()
  // El nombre sale varias veces (cabecera, ficha lateral): basta con que
  // el expediente haya terminado de cargar.
  await screen.findAllByText('Ana María Ramírez')
  return user
}

/** Secciones plegables que no tienen endpoint detrás. */
const SECCIONES_SIN_BACKEND = [
  'Historial de Alergias',
  'Enfermedades Crónicas',
  'Condiciones Hereditarias',
  'Hábitos y Estilo de Vida',
]

/**
 * Despliega todas las secciones sin backend.
 *
 * Sin esto, las pruebas de «aquí no hay datos inventados» no morderían: las
 * secciones arrancan plegadas, así que un literal reintroducido dentro de
 * cualquiera de ellas no estaría en el DOM y la comprobación pasaría en verde
 * con el defecto puesto.
 */
async function desplegarTodo(user: ReturnType<typeof userEvent.setup>) {
  for (const titulo of SECCIONES_SIN_BACKEND) {
    await user.click(screen.getByRole('button', { name: titulo }))
  }
}

/** Fila de la tabla de consultas en la posición indicada (0 = la primera). */
function filaDeConsulta(indice = 0) {
  const encabezado = screen.getByRole('columnheader', { name: 'Motivo' })
  const tabla = encabezado.closest('table')
  if (!tabla) throw new Error('El encabezado «Motivo» no está dentro de una tabla.')
  return within(tabla).getAllByRole('row')[indice + 1]
}

describe('expediente · el historial sale del backend', () => {
  it('pide las consultas y las recetas de ESTE paciente', async () => {
    await montar()

    await waitFor(() => expect(listarConsultas).toHaveBeenCalledWith(42))
    expect(listarPrescripcionesDePaciente).toHaveBeenCalledWith(42)
  })

  it('muestra las consultas que devuelve el API', async () => {
    listarConsultas.mockResolvedValue([consultaRegistrada()])
    await montar()

    expect(await screen.findByText('Control de presión arterial')).toBeVisible()
    expect(screen.getByText('Presión dentro de rango')).toBeVisible()
    expect(screen.getByText('Finalizada')).toBeVisible()
    expect(screen.getByText('1 consulta')).toBeVisible()
  })

  it('cuelga los medicamentos de la receta real de su consulta', async () => {
    listarConsultas.mockResolvedValue([consultaRegistrada()])
    listarPrescripcionesDePaciente.mockResolvedValue([recetaEmitida()])
    await montar()

    await screen.findByText('Control de presión arterial')
    // El medicamento aparece en la fila de SU consulta, no suelto en la
    // pantalla: es lo que enlaza `PrescripcionDto.consultaId` con la consulta.
    expect(within(filaDeConsulta()).getByText('Enalapril 10mg')).toBeVisible()
  })

  it('muestra la receta con su dosificación, y un guion donde el médico no la puso', async () => {
    listarConsultas.mockResolvedValue([consultaRegistrada()])
    listarPrescripcionesDePaciente.mockResolvedValue([recetaEmitida()])
    await montar()

    const receta = (await screen.findByText('Receta #11')).closest('div')
    if (!receta) throw new Error('La receta no tiene contenedor.')
    expect(within(receta).getByText('1 tableta')).toBeVisible()
    expect(within(receta).getByText('Cada 12 horas')).toBeVisible()
    // `duracion` vino null: la receta no puede decir «null» camino a la
    // farmacia, y tampoco inventarse una duración.
    expect(within(receta).queryByText(/null/i)).toBeNull()
    expect(within(receta).getByText('—')).toBeVisible()
    expect(screen.getByText('1 receta')).toBeVisible()
  })

  it('un paciente sin consultas muestra el hueco, no dos consultas inventadas', async () => {
    await montar()

    expect(
      await screen.findByText(/todavía no tiene consultas registradas/i),
    ).toBeVisible()
    expect(screen.getByText(/todavía no tiene recetas emitidas/i)).toBeVisible()
    expect(screen.getByText('0 consultas')).toBeVisible()
    // Las dos consultas de la maqueta se sembraban en el estado inicial, así
    // que salían en el expediente de un paciente creado esa misma mañana.
    for (const inventada of consultasDeMaqueta) {
      expect(screen.queryAllByText(inventada.reason)).toHaveLength(0)
      expect(screen.queryAllByText(inventada.diagnosis)).toHaveLength(0)
      for (const medicamento of inventada.meds) {
        expect(screen.queryAllByText(medicamento)).toHaveLength(0)
      }
    }
  })
})

describe('expediente · ninguna sección inventa datos del paciente', () => {
  /**
   * Los literales que estaban escritos en el componente. Si alguien los
   * reintroduce —o vuelve a sembrar el estado con la maqueta—, esta prueba se
   * pone roja.
   */
  const DATOS_INVENTADOS = [
    'Penicilina',
    'Sulfonamidas',
    'Urticaria, angioedema',
    'Erupción cutánea',
    'Hipertensión arterial',
    'Losartán 50mg',
    'Diabetes tipo 2',
    'Diagnosticado a los 55 años',
    'Actividad física',
    '3 veces por semana, 30 min',
  ]

  it('con todas las secciones desplegadas no queda ni un dato de relleno', async () => {
    const user = await montar()
    await desplegarTodo(user)

    // Guarda de la guarda: si `desplegarTodo` dejara de desplegar, el resto de
    // la prueba pasaría en verde con la Penicilina puesta, escondida dentro de
    // una sección plegada.
    expect(screen.getByText('No hay alergias registradas.')).toBeVisible()

    for (const inventado of DATOS_INVENTADOS) {
      expect(screen.queryAllByText(inventado)).toHaveLength(0)
    }
    // Y los signos vitales de la maqueta, incluida la enfermera que no existe.
    for (const toma of vitalesDeMaqueta) {
      for (const valor of Object.values(toma)) {
        expect(screen.queryAllByText(valor)).toHaveLength(0)
      }
    }
  })

  it('cada sección vacía avisa de que el vacío no significa «no tiene»', async () => {
    const user = await montar()
    await desplegarTodo(user)

    for (const vacio of [
      'No hay alergias registradas.',
      'No hay enfermedades crónicas registradas.',
      'No hay antecedentes hereditarios registrados.',
      'No hay hábitos registrados.',
      'No hay signos vitales registrados.',
    ]) {
      expect(screen.getByText(vacio)).toBeVisible()
    }

    // Cinco avisos: los cuatro plegables más el de signos vitales. Un «No hay
    // alergias registradas» a secas se lee como «esta paciente no tiene
    // alergias», que es otra afirmación que nadie ha comprobado.
    expect(screen.getAllByText(/no lo lea como «no tiene»/i)).toHaveLength(5)
  })

  it('ninguna sección sin backend ofrece un botón que no guardaría nada', async () => {
    const user = await montar()
    await desplegarTodo(user)

    for (const titulo of SECCIONES_SIN_BACKEND) {
      const seccion = screen.getByRole('button', { name: titulo }).closest('div')?.parentElement
      if (!seccion) throw new Error(`La sección «${titulo}» no tiene contenedor.`)
      expect(within(seccion).queryByRole('button', { name: /agregar/i })).toBeNull()
    }
    // Signos vitales tenía un «Actualizar» que solo movía el estado de React.
    expect(screen.queryByRole('button', { name: /actualizar/i })).toBeNull()

    // Y el contraste: el «Agregar» de Consultas sí se queda, porque POST
    // /consultas existe. Si se fuera, esta prueba avisaría de que se retiró de
    // más.
    const cabecera = screen.getByRole('heading', { name: 'Consultas Médicas' }).closest('div')
    if (!cabecera) throw new Error('La cabecera de Consultas Médicas no tiene contenedor.')
    expect(within(cabecera).getByRole('button', { name: 'Agregar' })).toBeVisible()
  })
})

describe('expediente · cuando el historial no se puede cargar', () => {
  it('avisa con el motivo del servidor y deja reintentar', async () => {
    listarConsultas.mockRejectedValueOnce(new ApiError(500, 'Error del servidor (500).'))
    const user = await montar()

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('No se pudieron cargar las consultas: Error del servidor (500).')

    listarConsultas.mockResolvedValue([consultaRegistrada()])
    await user.click(within(aviso).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Control de presión arterial')).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('no afirma «0 consultas» cuando la petición falló', async () => {
    // El contador es una afirmación sobre el paciente. Con la petición caída
    // no se sabe cuántas consultas tiene, y «0» diría que ninguna.
    listarConsultas.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    await montar()

    await screen.findByRole('alert')
    expect(screen.queryByText('0 consultas')).toBeNull()
    expect(screen.queryByText(/todavía no tiene consultas registradas/i)).toBeNull()
  })

  it('un fallo de las recetas no borra las consultas que sí llegaron', async () => {
    listarConsultas.mockResolvedValue([consultaRegistrada()])
    listarPrescripcionesDePaciente.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    await montar()

    expect(await screen.findByText('Control de presión arterial')).toBeVisible()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar las recetas/i)
  })
})

describe('expediente · la consulta recién registrada', () => {
  /** Registra una consulta desde el expediente y devuelve lo que quedó pintado. */
  async function registrarConsulta(devuelve: ConsultaDto) {
    crearConsulta.mockResolvedValue(devuelve)
    const user = await montar()

    const cabecera = screen.getByRole('heading', { name: 'Consultas Médicas' }).closest('div')
    if (!cabecera) throw new Error('La cabecera de Consultas Médicas no tiene contenedor.')
    await user.click(within(cabecera).getByRole('button', { name: 'Agregar' }))
    await user.type(screen.getByLabelText(/motivo de consulta/i), 'Control de seguimiento')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
    return user
  }

  it('pinta un guion, no «null», cuando el servidor la devuelve sin motivo', async () => {
    await registrarConsulta(consultaRegistrada({ motivo: null, diagnostico: null }))

    await waitFor(() => expect(within(filaDeConsulta()).queryByText(/null/i)).toBeNull())
    // Se comprueba celda por celda: contar guiones esconde cuál de las dos
    // columnas se pintó cruda.
    const celdas = within(filaDeConsulta()).getAllByRole('cell')
    expect(celdas[1]).toHaveTextContent(/^—$/)
    expect(celdas[2]).toHaveTextContent(/^—$/)
  })

  it('pinta el motivo tal cual cuando sí viene', async () => {
    // La otra mitad de la guarda: el guion no puede acabar tapando el texto
    // real, que es lo que pasaría con un `textoOpcional` mal aplicado.
    await registrarConsulta(consultaRegistrada({ motivo: 'Control de presión' }))

    await waitFor(() =>
      expect(within(filaDeConsulta()).getByText('Control de presión')).toBeInTheDocument(),
    )
  })

  it('se suma a las que ya venían del API en vez de reemplazarlas', async () => {
    listarConsultas.mockResolvedValue([consultaRegistrada({ consultaId: 5, motivo: 'Consulta previa' })])
    await registrarConsulta(consultaRegistrada({ consultaId: 8, motivo: 'Consulta nueva' }))

    await waitFor(() => expect(screen.getByText('2 consultas')).toBeVisible())
    expect(within(filaDeConsulta(0)).getByText('Consulta nueva')).toBeVisible()
    expect(within(filaDeConsulta(1)).getByText('Consulta previa')).toBeVisible()
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
    const user = await montar()

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
