// Guardas del formulario de recetas.
//
// Lo central: UNA RECETA SIN MEDICAMENTOS NO ES UNA RECETA. El formulario
// arranca con una línea en blanco, así que «no escribir nada y darle a emitir»
// es el camino más fácil del mundo; estas pruebas exigen que ahí no salga
// ninguna petición y que se diga por qué.
//
// Lo segundo: que el cuerpo sea el del contrato —`consultaId` más la lista de
// medicamentos, cada una con dosis, vía de administración, frecuencia y
// duración (HU-22 c2: los cuatro datos son obligatorios en cada renglón)—.
//
// Lo tercero (HU-23): el medicamento se elige del catálogo con un
// autocompletado, y lo que no salió de la lista no se envía.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { ConsultaDto } from '@/services/consultas'
import type {
  AlertaDeAlergiaDto,
  CrearPrescripcionPayload,
  PrescripcionDto,
} from '@/services/prescripciones'
import {
  MENSAJE_ALERTAS_NO_COMPROBADAS,
  MENSAJE_FALTA_CONFIRMACION,
  MENSAJE_FALTA_JUSTIFICACION,
  MENSAJE_RECETA_VACIA,
  mensajeFueraDelCatalogo,
} from '@/services/prescripciones'
import type { FiltroDeMedicamentos, MedicamentoCatalogoDto } from '@/services/medicamentos'
import { PrescriptionForm } from './PrescriptionForm'

const crearPrescripcion = vi.fn<(p: CrearPrescripcionPayload) => Promise<PrescripcionDto>>()
const buscarAlertasDeAlergia =
  vi.fn<(pacienteId: number, medicamentoId: number) => Promise<AlertaDeAlergiaDto[]>>()
const registrarDesistimientoDeAlerta =
  vi.fn<(pacienteId: number, medicamentoId: number) => Promise<boolean>>()
const listarConsultas = vi.fn<(pacienteId?: number) => Promise<ConsultaDto[]>>()
const listarMedicamentos = vi.fn<(f?: FiltroDeMedicamentos) => Promise<MedicamentoCatalogoDto[]>>()

vi.mock('@/services/prescripciones', async (importarOriginal) => {
  // `normalizarMedicamentos` y el mensaje se dejan reales: son la regla que se
  // está probando.
  const real = await importarOriginal<typeof import('@/services/prescripciones')>()
  return {
    ...real,
    crearPrescripcion: (p: CrearPrescripcionPayload) => crearPrescripcion(p),
    buscarAlertasDeAlergia: (pacienteId: number, medicamentoId: number) =>
      buscarAlertasDeAlergia(pacienteId, medicamentoId),
    registrarDesistimientoDeAlerta: (pacienteId: number, medicamentoId: number) =>
      registrarDesistimientoDeAlerta(pacienteId, medicamentoId),
  }
})

vi.mock('@/services/medicamentos', async (importarOriginal) => {
  // `coincideConBusqueda` se deja real: es el filtro del autocompletado.
  const real = await importarOriginal<typeof import('@/services/medicamentos')>()
  return { ...real, listarMedicamentos: (f?: FiltroDeMedicamentos) => listarMedicamentos(f) }
})

vi.mock('@/services/consultas', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return { ...real, listarConsultas: (pacienteId?: number) => listarConsultas(pacienteId) }
})

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
    clinica: null,
    ...cambios,
  }
}

function receta(): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
    // Campo aditivo nuevo de `PrescripcionDto` (services/prescripciones.ts):
    // este formulario no lo usa, pero el tipo ya lo exige para compilar.
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', registroJunta: null },
    clinica: null,
    fechaConsulta: '2026-08-23T14:30:00',
    estado: 'EMITIDA',
    motivoAnulacion: null,
    anuladaEn: null,
    anuladaPor: null,
    medicamentos: [
      { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', viaAdministracion: 'Oral', frecuencia: 'No especificada', duracion: 'No especificada' },
    ],
  }
}

function medicamento(cambios: Partial<MedicamentoCatalogoDto>): MedicamentoCatalogoDto {
  const base = {
    medicamentoId: 6,
    nombreGenerico: 'Amoxicilina',
    nombreComercial: 'Amoxil',
    principioActivo: 'Amoxicilina',
    presentacion: 'Cápsula',
    concentracion: '500 mg',
    activo: true,
    ...cambios,
  }
  return {
    ...base,
    descripcion: `${base.nombreGenerico} ${base.concentracion} (${base.nombreComercial}), ${base.presentacion}`,
  }
}

const AMOXICILINA = medicamento({})
const IBUPROFENO = medicamento({
  medicamentoId: 3,
  nombreGenerico: 'Ibuprofeno',
  nombreComercial: 'Advil',
  principioActivo: 'Ibuprofeno',
  presentacion: 'Tableta',
  concentracion: '400 mg',
})
const ACETAMINOFEN = medicamento({
  medicamentoId: 1,
  nombreGenerico: 'Acetaminofén',
  nombreComercial: 'Panadol',
  principioActivo: 'Paracetamol',
  presentacion: 'Tableta',
  concentracion: '500 mg',
})
const CATALOGO = [ACETAMINOFEN, AMOXICILINA, IBUPROFENO]

const PACIENTES = [{ personaId: 42, nombre: 'Ana María Ramírez', expediente: 'EXP-0042' }]

let onCreada: ReturnType<typeof vi.fn<(prescripcion: PrescripcionDto) => void>>
let onCancel: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  crearPrescripcion.mockReset()
  buscarAlertasDeAlergia.mockReset()
  // Por defecto el paciente no tiene alergias coincidentes (HU-24 criterio 4).
  buscarAlertasDeAlergia.mockResolvedValue([])
  registrarDesistimientoDeAlerta.mockReset()
  registrarDesistimientoDeAlerta.mockResolvedValue(true)
  listarConsultas.mockReset()
  listarMedicamentos.mockReset()
  listarMedicamentos.mockResolvedValue(CATALOGO)
  crearPrescripcion.mockResolvedValue(receta())
  listarConsultas.mockResolvedValue([consulta()])
  onCreada = vi.fn<(prescripcion: PrescripcionDto) => void>()
  onCancel = vi.fn<() => void>()
})

/**
 * Monta el formulario Y ELIGE EL PACIENTE, porque ya no viene preseleccionado.
 *
 * El desplegable arrancaba en `pacientes[0]`, y ese valor por defecto es el que
 * acaba emitiendo una receta al paciente equivocado: se abre el modal, se
 * escriben los medicamentos y se emite sin releer un campo que ya venía
 * relleno. Elegir a conciencia es ahora parte del flujo, así que también lo es
 * de estas pruebas.
 *
 * Con `consulta` fija no hay desplegable de paciente —el paciente sale de la
 * consulta—, de ahí el `queryByLabelText`.
 */
async function montar(props: Partial<React.ComponentProps<typeof PrescriptionForm>> = {}) {
  render(
    <PrescriptionForm
      pacientes={PACIENTES}
      onCreada={onCreada}
      onCancel={onCancel}
      {...props}
    />,
  )
  const user = userEvent.setup()
  const selectorDePaciente = screen.queryByLabelText(/^paciente/i)
  if (selectorDePaciente && props.pacienteIdPorDefecto === undefined) {
    await user.selectOptions(selectorDePaciente, String(PACIENTES[0].personaId))
  }
  return user
}

const botonEmitir = () => screen.getByRole('button', { name: /emitir/i })
const campoMedicamento = (n: number) => screen.getByLabelText(new RegExp(`^medicamento ${n}$`, 'i'))
const campoDosis = (n: number) => screen.getByLabelText(new RegExp(`dosis del medicamento ${n}`, 'i'))
const campoVia = (n: number) =>
  screen.getByLabelText(new RegExp(`vía de administración del medicamento ${n}`, 'i'))
const campoFrecuencia = (n: number) =>
  screen.getByLabelText(new RegExp(`frecuencia del medicamento ${n}`, 'i'))
const campoDuracion = (n: number) =>
  screen.getByLabelText(new RegExp(`duración del medicamento ${n}`, 'i'))

/** Los cuatro datos del tratamiento que HU-22 c2 exige en cada renglón. */
const TRATAMIENTO = {
  dosis: '500 mg',
  viaAdministracion: 'Oral',
  frecuencia: 'Cada 8 horas',
  duracion: '7 días',
}

/** Llena dosis, vía, frecuencia y duración del renglón `n`. */
async function completar(
  user: ReturnType<typeof userEvent.setup>,
  n: number,
  datos: typeof TRATAMIENTO = TRATAMIENTO,
) {
  await user.type(campoDosis(n), datos.dosis)
  await user.type(campoVia(n), datos.viaAdministracion)
  await user.type(campoFrecuencia(n), datos.frecuencia)
  await user.type(campoDuracion(n), datos.duracion)
}

/**
 * Elige un medicamento como lo haría el médico: teclea en la casilla y pulsa
 * la opción del catálogo. `opcion` es el texto de la opción; por defecto, el
 * mismo que se tecleó.
 */
async function elegir(
  user: ReturnType<typeof userEvent.setup>,
  n: number,
  tecleado: string,
  opcion: RegExp = new RegExp(tecleado, 'i'),
) {
  await waitFor(() => expect(campoMedicamento(n)).toBeEnabled())
  await user.type(campoMedicamento(n), tecleado)
  await user.click(await screen.findByRole('option', { name: opcion }))
}

/** Espera a que la lista de consultas del paciente esté cargada. */
async function esperarConsultas() {
  await waitFor(() => expect(listarConsultas).toHaveBeenCalled())
  await screen.findByRole('option', { name: /dolor de garganta/i })
}

describe('PrescriptionForm · una receta sin medicamentos no es una receta', () => {
  it('no emite nada si no se escribió ningún medicamento', async () => {
    const user = await montar()
    await esperarConsultas()

    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_RECETA_VACIA)
    expect(crearPrescripcion).not.toHaveBeenCalled()
    expect(onCreada).not.toHaveBeenCalled()
  })

  it('tampoco cuenta como receta un par de líneas en blanco', async () => {
    // «Agregar medicamento» tres veces y no llenar ninguna sigue siendo cero
    // medicamentos, por mucho que la pantalla muestre tres filas.
    const user = await montar()
    await esperarConsultas()

    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.type(campoDosis(1), '500 mg')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJE_RECETA_VACIA)
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })
})

describe('PrescriptionForm · el cuerpo que viaja al backend', () => {
  it('manda consultaId y los medicamentos con dosis, vía, frecuencia y duración', async () => {
    const user = await montar()
    await esperarConsultas()

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await elegir(user, 2, 'Ibuprofeno')
    await completar(user, 2, {
      dosis: '400 mg',
      viaAdministracion: 'Oral',
      frecuencia: 'Cada 12 horas',
      duracion: '5 días',
    })
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0]).toEqual({
      consultaId: 7,
      // Ids del catálogo, no nombres: el nombre de la receta lo pone el backend.
      medicamentos: [
        { medicamentoId: AMOXICILINA.medicamentoId, ...TRATAMIENTO },
        {
          medicamentoId: IBUPROFENO.medicamentoId,
          dosis: '400 mg',
          viaAdministracion: 'Oral',
          frecuencia: 'Cada 12 horas',
          duracion: '5 días',
        },
      ],
    })
  })

  it('no emite si a un medicamento le falta un dato del tratamiento, y dice cuál', async () => {
    // HU-22 c2: dosis, vía, frecuencia y duración son obligatorias en cada
    // renglón; sin la vía no sale ninguna petición.
    const user = await montar()
    await esperarConsultas()

    await elegir(user, 1, 'Amoxicilina')
    await user.type(campoDosis(1), '500 mg')
    await user.type(campoFrecuencia(1), 'Cada 8 horas')
    await user.type(campoDuracion(1), '7 días')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(/la vía de administración/i)
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })

  it('descarta la línea que quedó vacía entre dos llenas', async () => {
    const user = await montar()
    await esperarConsultas()

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await elegir(user, 3, 'Ibuprofeno')
    await completar(user, 3)
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].medicamentos).toEqual([
      { medicamentoId: AMOXICILINA.medicamentoId, ...TRATAMIENTO },
      { medicamentoId: IBUPROFENO.medicamentoId, ...TRATAMIENTO },
    ])
  })

  it('usa la consulta fija cuando se receta desde una consulta concreta', async () => {
    const user = await montar({ consulta: consulta({ consultaId: 99 }) })

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].consultaId).toBe(99)
    // Con la consulta ya decidida no hay por qué pedir la lista del paciente.
    expect(listarConsultas).not.toHaveBeenCalled()
  })
})

describe('PrescriptionForm · la consulta de la que cuelga la receta', () => {
  it('pide las consultas del paciente elegido y preselecciona la más reciente', async () => {
    listarConsultas.mockResolvedValue([
      consulta({ consultaId: 20, motivo: 'Control post operatorio' }),
      consulta({ consultaId: 7 }),
    ])
    const user = await montar()
    await waitFor(() => expect(listarConsultas).toHaveBeenCalledWith(42))
    await screen.findByRole('option', { name: /control post operatorio/i })

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].consultaId).toBe(20)
  })

  it('avisa cuando el paciente no tiene consultas, en vez de dejar emitir a ciegas', async () => {
    listarConsultas.mockResolvedValue([])
    const user = await montar()
    await waitFor(() => expect(listarConsultas).toHaveBeenCalled())
    await screen.findByRole('option', { name: /no tiene consultas registradas/i })

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(/elige la consulta/i)
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })

  it('no escribe «null» en el selector cuando la consulta llegó sin motivo', async () => {
    // `motivo` PUEDE SER NULL, y una plantilla de cadena no perdona:
    // `${c.motivo}` ponía literalmente la palabra «null» entre las opciones
    // de un formulario de recetas. Se comprueba sobre el desplegable de
    // consultas y no sobre la pantalla entera para que la prueba no dependa
    // de que ninguna otra parte diga «null» por su cuenta.
    listarConsultas.mockResolvedValue([consulta({ consultaId: 20, motivo: null })])
    await montar()
    await waitFor(() => expect(listarConsultas).toHaveBeenCalled())

    const selector = await screen.findByLabelText(/^consulta/i)
    const etiquetas = within(selector)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '')

    expect(etiquetas).toHaveLength(1)
    expect(etiquetas[0]).not.toMatch(/null/i)
    // Y el hueco se ve: la fecha sola no distingue «sin motivo» de «aquí se
    // perdió el texto», que es lo que dejaba una etiqueta cortada en el «·».
    expect(etiquetas[0]).toContain('—')
  })

  it('muestra el error de carga de consultas con el motivo del backend', async () => {
    listarConsultas.mockRejectedValue(new ApiError(403, 'No tiene acceso a este paciente'))
    await montar()

    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso a este paciente')
  })
})

describe('PrescriptionForm · errores al emitir', () => {
  it('muestra el motivo del backend y no avisa de una receta que no se emitió', async () => {
    crearPrescripcion.mockRejectedValue(
      new ApiError(403, 'Solo el médico que atendió la consulta puede recetar'),
    )
    const user = await montar()
    await esperarConsultas()

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el médico que atendió la consulta puede recetar',
    )
    expect(onCreada).not.toHaveBeenCalled()
  })

  it('avisa a la pantalla con la receta que devolvió el servidor', async () => {
    const emitida = receta()
    crearPrescripcion.mockResolvedValue(emitida)
    const user = await montar()
    await esperarConsultas()

    await elegir(user, 1, 'Amoxicilina')
    await completar(user, 1)
    await user.click(botonEmitir())

    await waitFor(() => expect(onCreada).toHaveBeenCalledWith(emitida))
  })
})

describe('PrescriptionForm · HU-23 criterio 3: el medicamento sale del catálogo', () => {
  it('autocompleta desde el catálogo, sin distinguir tildes ni mayúsculas', async () => {
    const user = await montar()
    await esperarConsultas()
    await waitFor(() => expect(campoMedicamento(1)).toBeEnabled())

    // «acetaminofen» sin tilde encuentra «Acetaminofén»; y por el principio
    // activo también, que es como lo piensa más de un médico.
    await user.type(campoMedicamento(1), 'acetaminofen')
    expect(await screen.findByRole('option', { name: /acetaminofén 500 mg \(panadol\)/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /amoxicilina/i })).not.toBeInTheDocument()

    await user.clear(campoMedicamento(1))
    await user.type(campoMedicamento(1), 'PARACETAMOL')
    await user.click(await screen.findByRole('option', { name: /panadol/i }))

    expect(campoMedicamento(1)).toHaveValue(ACETAMINOFEN.descripcion)
    // Se muestra el principio activo del elegido: es el dato estructurado.
    expect(screen.getByText('Principio activo: Paracetamol')).toBeInTheDocument()
  })

  it('no envía un valor escrito que no se eligió de la lista', async () => {
    const user = await montar()
    await esperarConsultas()
    await waitFor(() => expect(campoMedicamento(1)).toBeEnabled())

    await user.type(campoMedicamento(1), 'Aspirina de la casa')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      mensajeFueraDelCatalogo('Aspirina de la casa'),
    )
    expect(campoMedicamento(1)).toHaveAttribute('aria-invalid', 'true')
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })

  it('tampoco cuela una opción elegida y luego retocada a mano', async () => {
    // Elegir «Amoxicilina» y después borrarle letras deja en la casilla un
    // texto que ya no es esa opción: la elección se pierde y no se envía.
    const user = await montar()
    await esperarConsultas()
    await elegir(user, 1, 'Amoxicilina')
    await user.type(campoMedicamento(1), '{Backspace}{Backspace}')
    await user.click(botonEmitir())

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está en el catálogo/i)
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })

  it('se elige también con el teclado: flechas y Enter', async () => {
    const user = await montar()
    await esperarConsultas()
    await waitFor(() => expect(campoMedicamento(1)).toBeEnabled())

    await user.type(campoMedicamento(1), 'ibu')
    await user.keyboard('{Enter}')
    expect(campoMedicamento(1)).toHaveValue(IBUPROFENO.descripcion)

    await completar(user, 1)
    await user.click(botonEmitir())
    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].medicamentos).toEqual([
      { medicamentoId: IBUPROFENO.medicamentoId, ...TRATAMIENTO },
    ])
  })

  it('escribir la descripción completa de un medicamento cuenta como elegirlo', async () => {
    const user = await montar()
    await esperarConsultas()
    await waitFor(() => expect(campoMedicamento(1)).toBeEnabled())

    await user.type(campoMedicamento(1), 'amoxicilina 500 mg (amoxil), capsula')
    await completar(user, 1)
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalled())
    expect(crearPrescripcion.mock.calls[0][0].medicamentos).toEqual([
      { medicamentoId: AMOXICILINA.medicamentoId, ...TRATAMIENTO },
    ])
  })

  it('dice por qué no se puede recetar si el catálogo no cargó', async () => {
    listarMedicamentos.mockRejectedValue(new ApiError(500, 'El catálogo no responde'))
    await montar({ consulta: consulta() })

    expect(await screen.findByRole('alert')).toHaveTextContent('El catálogo no responde')
    expect(campoMedicamento(1)).toBeDisabled()
  })
})

describe('PrescriptionForm · HU-23 criterio 4: un medicamento desactivado no se ofrece', () => {
  it('pide solo los activos y no ofrece uno desactivado aunque llegara en la lista', async () => {
    listarMedicamentos.mockResolvedValue([
      ...CATALOGO,
      medicamento({ medicamentoId: 99, nombreGenerico: 'Ranitidina', nombreComercial: 'Zantac', activo: false }),
    ])
    const user = await montar()
    await esperarConsultas()
    await waitFor(() => expect(campoMedicamento(1)).toBeEnabled())

    // Sin `incluirInactivos`: esa lista es la del administrador, no la de recetar.
    expect(listarMedicamentos).toHaveBeenCalledWith(undefined)

    await user.type(campoMedicamento(1), 'ranitidina')
    expect(screen.queryByRole('option', { name: /ranitidina/i })).not.toBeInTheDocument()
    expect(screen.getByText(/ningún medicamento del catálogo coincide/i)).toBeInTheDocument()
  })
})

// ─── HU-24 · Alerta de alergia al prescribir ───────────────────────────────

function alerta(cambios: Partial<AlertaDeAlergiaDto> = {}): AlertaDeAlergiaDto {
  return {
    alergiaId: 4,
    sustancia: 'Amoxicilina',
    severidad: 'MODERADA',
    reaccion: 'Urticaria',
    medicamentoId: AMOXICILINA.medicamentoId,
    medicamento: AMOXICILINA.descripcion,
    ...cambios,
  }
}

const campoJustificacion = () => screen.getByLabelText(/justificación para recetarlo/i)

describe('PrescriptionForm · HU-24 criterio 1: la alerta muestra sustancia, severidad y reacción', () => {
  it('al elegir un medicamento con coincidencia pide las alertas del paciente y las muestra', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })

    await elegir(user, 1, 'amoxi')

    // El paciente es el de la consulta (personaId 42), no un id cualquiera.
    expect(buscarAlertasDeAlergia).toHaveBeenCalledWith(42, AMOXICILINA.medicamentoId)
    const bloque = await screen.findByRole('alert', { name: /alergia registrada/i })
    expect(bloque).toHaveTextContent('Amoxicilina')
    expect(bloque).toHaveTextContent('Moderada')
    expect(bloque).toHaveTextContent('Urticaria')
  })

  it('quitar el medicamento hace desaparecer su alerta', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })

    // Teclear de nuevo deshace la elección (ver SelectorDeMedicamento).
    await user.type(campoMedicamento(1), 'x')

    expect(screen.queryByRole('alert', { name: /alergia registrada/i })).not.toBeInTheDocument()
  })
})

describe('PrescriptionForm · HU-24 criterio 2: la justificación es obligatoria', () => {
  it('no emite sin justificación y dice qué falta', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await completar(user, 1)

    await user.click(botonEmitir())
    expect(await screen.findByText(MENSAJE_FALTA_JUSTIFICACION)).toBeInTheDocument()

    // Una justificación en blanco tampoco cuenta.
    await user.type(campoJustificacion(), '   ')
    await user.click(botonEmitir())
    expect(await screen.findByText(MENSAJE_FALTA_JUSTIFICACION)).toBeInTheDocument()
    expect(crearPrescripcion).not.toHaveBeenCalled()
  })

  it('con la justificación escrita la envía junto a la receta', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await completar(user, 1)

    await user.type(campoJustificacion(), 'Beneficio mayor al riesgo')
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalledTimes(1))
    const enviado = crearPrescripcion.mock.calls[0][0]
    expect(enviado.justificacionAlergia).toBe('Beneficio mayor al riesgo')
    // No es severa: no hay segunda confirmación que mandar.
    expect(enviado.confirmaAlergiaSevera).toBe(false)
    expect(onCreada).toHaveBeenCalled()
  })

  it('si el backend igual responde 409, muestra su mensaje', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    crearPrescripcion.mockRejectedValue(
      new ApiError(409, 'El paciente es alergico a una sustancia de esta receta'),
    )
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await completar(user, 1)
    await user.type(campoJustificacion(), 'Motivo')

    await user.click(botonEmitir())

    expect(await screen.findByText(/alergico a una sustancia/i)).toBeInTheDocument()
    expect(onCreada).not.toHaveBeenCalled()
  })
})

describe('PrescriptionForm · HU-24 criterio 3: la alergia severa pide segunda confirmación', () => {
  const severa = () => alerta({ severidad: 'SEVERA', reaccion: 'Anafilaxia' })

  it('la justificación sola no basta: hay que marcar la casilla de confirmación', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([severa()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await completar(user, 1)

    await user.type(campoJustificacion(), 'No hay alternativa')
    await user.click(botonEmitir())

    expect(await screen.findByText(MENSAJE_FALTA_CONFIRMACION)).toBeInTheDocument()
    expect(crearPrescripcion).not.toHaveBeenCalled()

    const casilla = screen.getByRole('checkbox', {
      name: /confirmo que receto .*amoxicilina.* pese a la alergia severa a amoxicilina/i,
    })
    await user.click(casilla)
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalledTimes(1))
    expect(crearPrescripcion.mock.calls[0][0]).toMatchObject({
      justificacionAlergia: 'No hay alternativa',
      confirmaAlergiaSevera: true,
    })
  })

  it('una alergia que no es severa no muestra la casilla', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('PrescriptionForm · HU-24 criterio 4: sin coincidencias nada cambia', () => {
  it('no muestra alerta ni campos extra, y el cuerpo no lleva justificación', async () => {
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'ibuprofeno')
    await completar(user, 1)

    await waitFor(() => expect(buscarAlertasDeAlergia).toHaveBeenCalled())
    expect(screen.queryByRole('alert', { name: /alergia registrada/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/justificación para recetarlo/i)).not.toBeInTheDocument()

    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalledTimes(1))
    const enviado = crearPrescripcion.mock.calls[0][0]
    expect(enviado).not.toHaveProperty('justificacionAlergia')
    expect(enviado).not.toHaveProperty('confirmaAlergiaSevera')
  })

  it('si no se pudo pedir la alerta lo dice, en vez de parecer que no hay alergias', async () => {
    buscarAlertasDeAlergia.mockRejectedValue(new ApiError(500, 'Error interno'))
    const user = await montar({ consulta: consulta() })

    await elegir(user, 1, 'amoxi')

    expect(await screen.findByText(MENSAJE_ALERTAS_NO_COMPROBADAS)).toBeInTheDocument()
  })
})

describe('PrescriptionForm · HU-24 criterio 5: el médico que desiste queda en la bitácora', () => {
  it('quitar la línea del medicamento con alerta registra que desistió', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))

    await user.click(screen.getByRole('button', { name: /quitar el medicamento 1/i }))

    expect(registrarDesistimientoDeAlerta).toHaveBeenCalledTimes(1)
    expect(registrarDesistimientoDeAlerta).toHaveBeenCalledWith(42, AMOXICILINA.medicamentoId)
  })

  it('cambiar el medicamento por otro (teclear sobre el elegido) registra que desistió del primero', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })

    await user.type(campoMedicamento(1), 'x')
    await user.type(campoMedicamento(1), 'y')

    expect(registrarDesistimientoDeAlerta).toHaveBeenCalledTimes(1)
    expect(registrarDesistimientoDeAlerta).toHaveBeenCalledWith(42, AMOXICILINA.medicamentoId)
  })

  it('cancelar la receta con la alerta a la vista registra el desistimiento y cierra', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })

    await user.click(screen.getByRole('button', { name: /^cancelar$/i }))

    expect(registrarDesistimientoDeAlerta).toHaveBeenCalledWith(42, AMOXICILINA.medicamentoId)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('quitar la línea y luego cancelar es una sola decisión: se registra una vez', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await user.click(screen.getByRole('button', { name: /quitar el medicamento 1/i }))
    await user.click(screen.getByRole('button', { name: /^cancelar$/i }))

    expect(registrarDesistimientoDeAlerta).toHaveBeenCalledTimes(1)
  })

  it('cancelar sin alertas no registra nada', async () => {
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'ibuprofeno')
    await waitFor(() => expect(buscarAlertasDeAlergia).toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: /^cancelar$/i }))

    expect(registrarDesistimientoDeAlerta).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('si recetó pese a la alerta no registra desistimiento (esa decisión la anota el backend al emitir)', async () => {
    buscarAlertasDeAlergia.mockResolvedValue([alerta()])
    const user = await montar({ consulta: consulta() })
    await elegir(user, 1, 'amoxi')
    await screen.findByRole('alert', { name: /alergia registrada/i })
    await user.type(campoJustificacion(), 'No hay alternativa')
    await user.click(botonEmitir())

    await waitFor(() => expect(crearPrescripcion).toHaveBeenCalledTimes(1))
    expect(registrarDesistimientoDeAlerta).not.toHaveBeenCalled()
  })
})
