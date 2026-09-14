// Guardas del formulario de consultas.
//
// Lo central: EL DIAGNÓSTICO ES EXCLUSIVO DEL MÉDICO. El backend lo impone, y
// la interfaz no debe ofrecer un campo que el servidor va a rechazar —dejar
// que una enfermera redacte un diagnóstico para responderle 403 al guardar es
// peor que no ofrecérselo—. La prueba se busca el campo por su etiqueta
// visible, que es como lo encuentra una persona.
//
// Lo segundo: que el cuerpo enviado sea EXACTAMENTE el del contrato. Un campo
// de más (o un `clinicaId: null` donde el contrato dice «opcional») es un 400
// que nadie ve hasta que el backend aterriza.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { Clinica, Role, User } from '@/types'
import type {
  ActualizarConsultaPayload,
  ConsultaDto,
  CrearConsultaPayload,
} from '@/services/consultas'
import { ConsultationForm } from './ConsultationForm'

const crearConsulta = vi.fn<(p: CrearConsultaPayload) => Promise<ConsultaDto>>()
const actualizarConsulta = vi.fn<(id: number, p: ActualizarConsultaPayload) => Promise<ConsultaDto>>()

vi.mock('@/services/consultas', async (importarOriginal) => {
  // `puedeRegistrarDiagnostico` y los formateadores se dejan reales: son la
  // regla que se está probando, no un colaborador que haya que simular.
  const real = await importarOriginal<typeof import('@/services/consultas')>()
  return {
    ...real,
    crearConsulta: (p: CrearConsultaPayload) => crearConsulta(p),
    actualizarConsulta: (id: number, p: ActualizarConsultaPayload) => actualizarConsulta(id, p),
  }
})

// La sesión se simula en vez de montar el AppProvider: lo que se prueba es qué
// hace el formulario con `user.roles` y `activeClinic`, no cómo se guarda la
// sesión (eso ya lo cubre AppContext.test.tsx).
let sesion: { user: User | null; activeClinic: Clinica | null }

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => sesion,
}))

const CLINICA: Clinica = { id: 5, name: 'Clínica Escalón', lat: 13.7, lng: -89.2 }

function usuario(role: Role): User {
  return { name: 'naun@docrecord.sv', email: 'naun@docrecord.sv', roles: [role] }
}

function consulta(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
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

const PACIENTES = [
  { personaId: 42, nombre: 'Ana María Ramírez', expediente: 'EXP-0042' },
  { personaId: 15, nombre: 'Anan Flores', expediente: 'EXP-0001' },
]

let onGuardada: ReturnType<typeof vi.fn<(consulta: ConsultaDto) => void>>
let onCancel: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  crearConsulta.mockReset()
  actualizarConsulta.mockReset()
  crearConsulta.mockResolvedValue(consulta())
  actualizarConsulta.mockResolvedValue(consulta())
  sesion = { user: usuario('medico'), activeClinic: CLINICA }
  onGuardada = vi.fn<(consulta: ConsultaDto) => void>()
  onCancel = vi.fn<() => void>()
})

/**
 * Monta el formulario Y ELIGE EL PACIENTE, porque ya no viene preseleccionado.
 *
 * El desplegable arrancaba en `pacientes[0]`, y ese valor por defecto es el que
 * acaba registrando la consulta en el expediente equivocado: se abre el modal,
 * se escribe el motivo y se guarda sin releer un campo que ya venía relleno.
 * Elegir a conciencia es ahora parte del flujo, así que también lo es de estas
 * pruebas.
 *
 * Al editar, o con `pacienteIdPorDefecto`, el paciente SÍ se conoce y no hay
 * nada que elegir: de ahí el `queryByLabelText` y la condición.
 */
async function montar(props: Partial<React.ComponentProps<typeof ConsultationForm>> = {}) {
  render(
    <ConsultationForm
      pacientes={PACIENTES}
      onGuardada={onGuardada}
      onCancel={onCancel}
      {...props}
    />,
  )
  const user = userEvent.setup()
  const selectorDePaciente = screen.queryByLabelText(/^paciente/i)
  if (
    selectorDePaciente instanceof HTMLSelectElement &&
    props.pacienteIdPorDefecto === undefined &&
    props.consulta === undefined
  ) {
    await user.selectOptions(selectorDePaciente, String(PACIENTES[0].personaId))
  }
  return user
}

const campoMotivo = () => screen.getByLabelText(/motivo de consulta/i)
const campoDiagnostico = () => screen.queryByLabelText(/^diagnóstico/i)
const botonGuardar = () => screen.getByRole('button', { name: /guardar/i })

describe('ConsultationForm · el diagnóstico es exclusivo del médico', () => {
  it('no le ofrece el campo a una enfermera', async () => {
    sesion = { user: usuario('enfermera'), activeClinic: CLINICA }

    await montar()

    expect(campoDiagnostico()).toBeNull()
    // Y se explica por qué falta, en vez de dejar un hueco sin motivo.
    expect(screen.getByText(/lo registra el médico responsable/i)).toBeInTheDocument()
  })

  it('tampoco manda diagnóstico en el cuerpo cuando registra una enfermera', async () => {
    sesion = { user: usuario('enfermera'), activeClinic: CLINICA }
    const user = await montar()

    await user.type(campoMotivo(), 'Control de presión')
    await user.click(botonGuardar())

    await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
    expect(crearConsulta.mock.calls[0][0]).toEqual({
      pacienteId: 42,
      clinicaId: 5,
      motivo: 'Control de presión',
    })
  })

  it('sí se lo ofrece al médico', async () => {
    await montar()

    expect(campoDiagnostico()).toBeInTheDocument()
  })

  it('no envía el diagnóstico al editar si quien edita no puede escribirlo', async () => {
    // La consulta ya trae diagnóstico del médico; la enfermera solo cambia el
    // motivo. Mandar `diagnostico` aquí —aunque fuera el mismo texto— sería
    // pedirle al backend una escritura que su rol tiene prohibida.
    sesion = { user: usuario('enfermera'), activeClinic: CLINICA }
    const user = await montar({ consulta: consulta({ diagnostico: 'Faringitis aguda' }) })

    await user.clear(campoMotivo())
    await user.type(campoMotivo(), 'Dolor de garganta y fiebre')
    await user.click(botonGuardar())

    await waitFor(() => expect(actualizarConsulta).toHaveBeenCalled())
    expect(actualizarConsulta.mock.calls[0][1]).toEqual({
      motivo: 'Dolor de garganta y fiebre',
    })
  })
})

describe('ConsultationForm · el cuerpo que viaja al backend', () => {
  it('manda exactamente los campos del contrato', async () => {
    const user = await montar()

    await user.selectOptions(screen.getByLabelText(/paciente/i), '15')
    await user.type(campoMotivo(), '  Dolor de garganta  ')
    await user.type(campoDiagnostico()!, 'Faringitis aguda')
    await user.click(botonGuardar())

    await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
    expect(crearConsulta.mock.calls[0][0]).toEqual({
      pacienteId: 15,
      clinicaId: 5,
      motivo: 'Dolor de garganta',
      diagnostico: 'Faringitis aguda',
    })
  })

  it('omite clinicaId cuando no hay sede activa, en vez de mandar null', async () => {
    // `clinicaId` es opcional en el contrato. Mandar null (o un 0 inventado)
    // no es lo mismo que omitirlo: es un 400 o una clínica equivocada.
    sesion = { user: usuario('medico'), activeClinic: null }
    const user = await montar()

    await user.type(campoMotivo(), 'Control')
    await user.click(botonGuardar())

    await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
    expect(crearConsulta.mock.calls[0][0]).toEqual({ pacienteId: 42, motivo: 'Control' })
  })

  it('omite el diagnóstico cuando el médico lo deja en blanco', async () => {
    const user = await montar()

    await user.type(campoMotivo(), 'Control')
    await user.type(campoDiagnostico()!, '   ')
    await user.click(botonGuardar())

    await waitFor(() => expect(crearConsulta).toHaveBeenCalled())
    expect(crearConsulta.mock.calls[0][0]).toEqual({
      pacienteId: 42,
      clinicaId: 5,
      motivo: 'Control',
    })
  })

  it('no envía nada si el motivo está en blanco', async () => {
    const user = await montar()

    await user.type(campoMotivo(), '    ')
    await user.click(botonGuardar())

    expect(crearConsulta).not.toHaveBeenCalled()
  })
})

describe('ConsultationForm · edición', () => {
  it('manda solo lo que cambió y nunca la clínica', async () => {
    // El PUT completa sin destruir: «campo ausente = no lo toco». Reenviar el
    // motivo sin cambios es ruido; reenviar `clinicaId` con la sede activa de
    // quien edita movería la consulta de clínica sin que nadie lo pidiera.
    const user = await montar({ consulta: consulta({ motivo: 'Dolor de garganta' }) })

    await user.type(campoDiagnostico()!, 'Faringitis aguda')
    await user.click(botonGuardar())

    await waitFor(() => expect(actualizarConsulta).toHaveBeenCalled())
    expect(actualizarConsulta.mock.calls[0][0]).toBe(7)
    expect(actualizarConsulta.mock.calls[0][1]).toEqual({ diagnostico: 'Faringitis aguda' })
  })

  it('muestra al paciente pero no deja cambiarlo', async () => {
    await montar({ consulta: consulta() })

    expect(screen.getByText('Ana María Ramírez')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('parte del diagnóstico existente sin reventar cuando viene null', async () => {
    // `diagnostico` llega null mientras la consulta sigue PENDIENTE; el
    // textarea necesita una cadena.
    await montar({ consulta: consulta({ diagnostico: null }) })

    expect(campoDiagnostico()).toHaveValue('')
  })

  it('abre con el campo VACÍO, no con «null», si la consulta no traía motivo', async () => {
    // `motivo` también puede venir null (la columna no lo exige). Sin el
    // `?? ''`, el textarea arrancaría con la palabra «null» dentro y quien
    // editara la consulta la guardaría como motivo de verdad.
    const user = await montar({ consulta: consulta({ motivo: null }) })

    expect(campoMotivo()).toHaveValue('')

    await user.type(campoMotivo(), 'Control de seguimiento')
    await user.click(botonGuardar())

    await waitFor(() => expect(actualizarConsulta).toHaveBeenCalled())
    expect(actualizarConsulta.mock.calls[0][1]).toEqual({ motivo: 'Control de seguimiento' })
  })
})

describe('ConsultationForm · errores', () => {
  it('muestra el motivo que dio el backend, sin sustituirlo', async () => {
    crearConsulta.mockRejectedValue(new ApiError(400, 'El motivo es obligatorio.'))
    const user = await montar()

    await user.type(campoMotivo(), 'Control')
    await user.click(botonGuardar())

    expect(await screen.findByRole('alert')).toHaveTextContent('El motivo es obligatorio.')
    expect(onGuardada).not.toHaveBeenCalled()
  })

  it('avisa a la pantalla solo cuando el servidor confirmó', async () => {
    const guardada = consulta({ consultaId: 99 })
    crearConsulta.mockResolvedValue(guardada)
    const user = await montar()

    await user.type(campoMotivo(), 'Control')
    await user.click(botonGuardar())

    await waitFor(() => expect(onGuardada).toHaveBeenCalledWith(guardada))
  })
})

describe('ConsultationForm · etiquetas que apuntan a un control de verdad', () => {
  it('al registrar, «Paciente» nombra al selector', async () => {
    await montar()

    // El nombre accesible tiene que resolver a un control: si el `htmlFor`
    // señalara otra cosa, aquí no habría un <select>.
    expect(screen.getByLabelText(/^paciente/i).tagName).toBe('SELECT')
  })

  it('al editar, el paciente se muestra sin fingir que es un campo', async () => {
    await montar({ consulta: consulta() })

    // Al editar no hay selector: el paciente solo se muestra. Un
    // `<label htmlFor>` apuntando a ese <p> es una etiqueta rota —el navegador
    // no la asocia a nada, el clic no enfoca— y además hacía que buscar el
    // campo «Paciente» devolviera un párrafo en vez de nada.
    const etiquetado = screen.queryByLabelText(/^paciente$/i)
    if (etiquetado !== null) expect(etiquetado.tagName).toMatch(/^(INPUT|SELECT|TEXTAREA)$/)

    expect(document.querySelector('label[for$="-paciente"]')).toBeNull()
    expect(screen.getByText('Ana María Ramírez')).toBeInTheDocument()
  })
})
