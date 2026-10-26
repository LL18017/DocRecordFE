// Guardas de la pantalla de recetas.
//
// Lo que se protege:
//  1. Que dosis, vía, frecuencia y duración (obligatorias desde HU-22 c2) se
//     pinten tal cual, y que las recetas anteriores, que el backend dejó con
//     «No especificada», no se muestren como «null» ni como un hueco en un
//     papel que alguien va a llevar a la farmacia.
//  2. Que la anulación sea LÓGICA (HU-22 c3): pide el motivo, la tarjeta se
//     queda marcada como anulada SOLO cuando el servidor confirmó, y no
//     desaparece de la lista.
//  3. Que la pantalla muestre el histórico completo al montar, SIN exigir
//     elegir un paciente primero, y que distinga con honestidad los dos
//     estados vacíos posibles: «no hay nada registrado» (sin filtros) frente
//     a «lo que pediste no calza» (con algún filtro activo).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { PacienteDto } from '@/services/pacientes'
import type { FiltroHistoricoDeRecetas, PaginaDto, PrescripcionDto } from '@/services/prescripciones'
import PrescripcionesPage from './page'

const listarPacientes = vi.fn<() => Promise<PacienteDto[]>>()
const listarHistoricoDePrescripciones =
  vi.fn<(filtro?: FiltroHistoricoDeRecetas) => Promise<PaginaDto<PrescripcionDto>>>()
const anularPrescripcion = vi.fn<(id: number, motivo: string) => Promise<PrescripcionDto>>()
const enviarRecetaPorCorreo = vi.fn<(consultaId: number) => Promise<void>>()

vi.mock('@/services/pacientes', () => ({
  listarPacientes: () => listarPacientes(),
}))

vi.mock('@/services/prescripciones', async (importarOriginal) => {
  // `textoOpcional` y los formateadores se dejan reales: son lo que la
  // pantalla tiene que usar bien con los nulos.
  const real = await importarOriginal<typeof import('@/services/prescripciones')>()
  return {
    ...real,
    listarHistoricoDePrescripciones: (filtro?: FiltroHistoricoDeRecetas) =>
      listarHistoricoDePrescripciones(filtro),
    anularPrescripcion: (id: number, motivo: string) => anularPrescripcion(id, motivo),
    enviarRecetaPorCorreo: (consultaId: number) => enviarRecetaPorCorreo(consultaId),
  }
})

// El formulario de emisión tiene sus propias pruebas; aquí solo importa lo
// que la pantalla hace con la receta que devuelve.
const recetaEmitida = vi.hoisted(() => ({ valor: null as unknown }))
vi.mock('@/components/forms/PrescriptionForm', () => ({
  PrescriptionForm: ({ onCreada }: { onCreada: (r: unknown) => void }) => (
    <button onClick={() => onCreada(recetaEmitida.valor)}>Simular emisión</button>
  ),
}))

function paciente(): PacienteDto {
  return {
    personaId: 42,
    expediente: 'EXP-0042',
    tipoSangre: 'O+',
    creadoEn: '2026-08-22T23:09:13',
    estado: 'ACTIVO',
    persona: {
      personaId: 42,
      dui: '01234567-8',
      nombres: 'Ana María',
      apellidos: 'Ramírez',
      fechaNacimiento: '1994-06-02',
      sexo: 'F',
      telefono: null,
      direccion: null,
      email: null,
    },
  }
}

function receta(cambios: Partial<PrescripcionDto> = {}): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
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
    ...cambios,
  }
}

/**
 * Envuelve una lista en el sobre paginado que el backend usa SIEMPRE para
 * `/prescripciones`, tal como lo espera la pantalla desde que dejó de
 * tratarlo como un arreglo plano.
 */
function sobre(
  contenido: PrescripcionDto[],
  extra: Partial<Omit<PaginaDto<PrescripcionDto>, 'contenido'>> = {},
): PaginaDto<PrescripcionDto> {
  return {
    contenido,
    paginaActual: 0,
    tamanoPagina: 20,
    totalElementos: contenido.length,
    totalPaginas: contenido.length > 0 ? 1 : 0,
    ...extra,
  }
}

beforeEach(() => {
  listarPacientes.mockReset()
  listarHistoricoDePrescripciones.mockReset()
  anularPrescripcion.mockReset()
  enviarRecetaPorCorreo.mockReset()
  enviarRecetaPorCorreo.mockResolvedValue(undefined)
  listarPacientes.mockResolvedValue([paciente()])
  listarHistoricoDePrescripciones.mockResolvedValue(sobre([receta()]))
  anularPrescripcion.mockImplementation(async (id, motivo) =>
    receta({
      prescripcionId: id,
      estado: 'ANULADA',
      motivoAnulacion: motivo,
      anuladaEn: '2026-08-24T09:00:00',
      anuladaPor: 'Juan Guerra',
    }),
  )
})

function montar() {
  render(<PrescripcionesPage />)
  return userEvent.setup()
}

describe('recetas · datos del tratamiento', () => {
  it('pinta dosis, vía, frecuencia y duración de cada medicamento', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([
        receta({
          medicamentos: [
            { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', viaAdministracion: 'Oral', frecuencia: 'Cada 8 horas', duracion: '7 días' },
          ],
        }),
      ]),
    )
    montar()

    const fila = (await screen.findByText('Amoxicilina')).closest('tr')!
    expect(within(fila).getByText('500 mg')).toBeInTheDocument()
    expect(within(fila).getByText('Oral')).toBeInTheDocument()
    expect(within(fila).getByText('Cada 8 horas')).toBeInTheDocument()
    expect(within(fila).getByText('7 días')).toBeInTheDocument()
  })

  it('una receta anterior a HU-22 se lee «No especificada», sin «null» ni huecos', async () => {
    // La migración dejó «No especificada» en lo que antes era opcional. La
    // pantalla lo pinta tal cual: ya no hay nulos que traducir a un guion.
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([
        receta({
          medicamentos: [
            { id: 1, medicamento: 'Paracetamol', dosis: 'No especificada', viaAdministracion: 'Oral', frecuencia: 'No especificada', duracion: 'No especificada' },
          ],
        }),
      ]),
    )

    montar()

    const fila = (await screen.findByText('Paracetamol')).closest('tr')!
    expect(within(fila).getAllByText('No especificada')).toHaveLength(3)
    expect(within(fila).queryByText(/null/i)).toBeNull()
  })

  it('muestra de quién es la receta y quién la firmó', async () => {
    montar()

    const tarjeta = (await screen.findByText(/receta #11/i)).closest('div')!
    expect(within(tarjeta).getByText(/ana maría ramírez/i)).toBeInTheDocument()
    expect(within(tarjeta).getByText(/exp-0042/i)).toBeInTheDocument()
    expect(within(tarjeta).getByText(/juan guerra/i)).toBeInTheDocument()
  })
})

describe('recetas · HU-24 justificación de alergia', () => {
  it('muestra la justificación junto a la receta emitida pese a una alergia', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([receta({ justificacionAlergia: 'Beneficio mayor al riesgo' })]),
    )

    montar()

    expect(await screen.findByText(/recetado pese a una alergia registrada/i)).toBeInTheDocument()
    expect(screen.getByText(/beneficio mayor al riesgo/i)).toBeInTheDocument()
  })

  it('no pinta nada de alergia en una receta normal', async () => {
    montar()

    await screen.findByText('Amoxicilina')
    expect(screen.queryByText(/pese a una alergia/i)).not.toBeInTheDocument()
  })
})

describe('recetas · histórico al montar', () => {
  it('pide el histórico completo sin exigir elegir un paciente primero', async () => {
    montar()

    // Sin filtros: el filtro que viaja al servicio no trae ningún valor
    // definido salvo `pagina` (equivale a `{ pagina: 0 }` —
    // `toHaveBeenCalledWith` ignora las claves en `undefined`, igual que hace
    // el propio servicio al construir el query).
    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenCalledWith({ pagina: 0 }),
    )
    expect(await screen.findByText(/receta #11/i)).toBeInTheDocument()
  })

  it('combina los filtros activos en una sola llamada', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Paciente'), '42')
    await user.type(screen.getByLabelText('Desde'), '2026-01-01')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({
        pacienteId: 42,
        desde: '2026-01-01',
        pagina: 0,
      }),
    )
  })

  it('filtra por médico solo', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Médico'), '3')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ medicoId: 3, pagina: 0 }),
    )
  })

  it('filtra por hasta solo', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.type(screen.getByLabelText('Hasta'), '2026-12-31')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({
        hasta: '2026-12-31',
        pagina: 0,
      }),
    )
  })

  it('combina los cuatro filtros a la vez', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Paciente'), '42')
    await user.selectOptions(screen.getByLabelText('Médico'), '3')
    await user.type(screen.getByLabelText('Desde'), '2026-01-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-12-31')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({
        pacienteId: 42,
        medicoId: 3,
        desde: '2026-01-01',
        hasta: '2026-12-31',
        pagina: 0,
      }),
    )
  })

  it('limpiar filtros vuelve a pedir el histórico completo', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.selectOptions(screen.getByLabelText('Paciente'), '42')
    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({
        pacienteId: 42,
        pagina: 0,
      }),
    )

    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ pagina: 0 }),
    )
  })
})

describe('recetas · el filtro de médico no es un catálogo completo del personal', () => {
  it('solo ofrece médicos que ya aparecen en el histórico cargado', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([
        receta(),
        receta({
          prescripcionId: 12,
          medico: { personaId: 9, nombres: 'Carla', apellidos: 'Sosa', registroJunta: null },
        }),
      ]),
    )
    montar()
    await screen.findByText(/receta #11/i)

    const selectorDeMedico = screen.getByLabelText('Médico')
    const opciones = within(selectorDeMedico)
      .getAllByRole('option')
      .map((o) => o.textContent)

    expect(opciones).toEqual(['Todos los médicos', 'Juan Guerra', 'Carla Sosa'])
  })

  it('no repite un médico que firmó varias recetas en el histórico', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([receta(), receta({ prescripcionId: 12 })]),
    )
    montar()
    await screen.findByText(/receta #11/i)

    const selectorDeMedico = screen.getByLabelText('Médico')
    expect(within(selectorDeMedico).getAllByRole('option')).toHaveLength(2) // «Todos» + Juan Guerra, una sola vez
  })
})

describe('recetas · el sobre paginado real (no un arreglo pelado)', () => {
  // Estas son justo las pruebas que faltaban: el backend SIEMPRE envuelve
  // /prescripciones en un sobre paginado (contenido/paginaActual/
  // totalElementos/totalPaginas), y la pantalla reventó en producción porque
  // trataba la respuesta como si fuera el arreglo directo. Un simulacro que
  // devuelve un arreglo pelado no habría detectado eso; estas usan el sobre
  // real, con más de una página, y comprueban que la pantalla lo pinta de
  // verdad -el total, el botón de cargar más y lo que pasa al usarlo-.

  it('muestra cuántas recetas hay en total, no solo cuántas se cargaron', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([receta()], { totalElementos: 57, totalPaginas: 3 }),
    )
    montar()

    expect(await screen.findByText(/mostrando 1 de 57 recetas/i)).toBeInTheDocument()
  })

  it('ofrece «Cargar más» cuando quedan páginas, y pide la siguiente sumándola a la lista', async () => {
    listarHistoricoDePrescripciones.mockResolvedValueOnce(
      sobre([receta()], { paginaActual: 0, totalElementos: 2, totalPaginas: 2 }),
    )
    const user = montar()
    await screen.findByText(/receta #11/i)

    const segundaReceta = receta({ prescripcionId: 99 })
    listarHistoricoDePrescripciones.mockResolvedValueOnce(
      sobre([segundaReceta], { paginaActual: 1, totalElementos: 2, totalPaginas: 2 }),
    )
    await user.click(screen.getByRole('button', { name: /^cargar más$/i }))

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ pagina: 1 }),
    )
    // SUMA, no reemplaza: la primera receta sigue visible junto a la nueva.
    expect(await screen.findByText(/receta #99/i)).toBeInTheDocument()
    expect(screen.getByText(/receta #11/i)).toBeInTheDocument()
    expect(await screen.findByText(/mostrando 2 de 2 recetas/i)).toBeInTheDocument()
  })

  it('no ofrece «Cargar más» cuando ya se cargó la última página', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([receta()], { paginaActual: 0, totalElementos: 1, totalPaginas: 1 }),
    )
    montar()

    await screen.findByText(/receta #11/i)
    expect(screen.queryByRole('button', { name: /^cargar más$/i })).toBeNull()
  })

  it('cambiar un filtro tras cargar más de una página reemplaza la lista, no la suma', async () => {
    listarHistoricoDePrescripciones.mockResolvedValueOnce(
      sobre([receta()], { paginaActual: 0, totalElementos: 2, totalPaginas: 2 }),
    )
    const user = montar()
    await screen.findByText(/receta #11/i)

    listarHistoricoDePrescripciones.mockResolvedValueOnce(
      sobre([receta({ prescripcionId: 99 })], { paginaActual: 1, totalElementos: 2, totalPaginas: 2 }),
    )
    await user.click(screen.getByRole('button', { name: /^cargar más$/i }))
    await screen.findByText(/receta #99/i)

    // Ahora hay dos recetas acumuladas (páginas 0 y 1). Cambiar el filtro de
    // médico debe volver a pedir desde la página 0 y REEMPLAZAR, no sumar
    // una tercera receta a las dos que ya había.
    const soloUnaReceta = receta({ prescripcionId: 5 })
    listarHistoricoDePrescripciones.mockResolvedValueOnce(
      sobre([soloUnaReceta], { paginaActual: 0, totalElementos: 1, totalPaginas: 1 }),
    )
    await user.selectOptions(screen.getByLabelText('Médico'), '3')

    await waitFor(() =>
      expect(listarHistoricoDePrescripciones).toHaveBeenLastCalledWith({ medicoId: 3, pagina: 0 }),
    )
    expect(await screen.findByText(/receta #5/i)).toBeInTheDocument()
    expect(screen.queryByText(/receta #11/i)).toBeNull()
    expect(screen.queryByText(/receta #99/i)).toBeNull()
  })
})

describe('recetas · anulación', () => {
  const motivoValido = 'Error al elegir el medicamento'

  /** Abre el cuadro de anulación de la receta 11 y escribe el motivo. */
  async function anularConMotivo(user: ReturnType<typeof userEvent.setup>, motivo: string) {
    await screen.findByText(/receta #11/i)
    await user.click(screen.getByRole('button', { name: /anular la receta 11/i }))
    await user.type(await screen.findByLabelText(/motivo de la anulación/i), motivo)
    await user.click(screen.getByRole('button', { name: /^anular receta$/i }))
  }

  it('no envía nada si el motivo es más corto que el mínimo', async () => {
    const user = montar()

    await anularConMotivo(user, 'Error')

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 10 caracteres/i)
    expect(anularPrescripcion).not.toHaveBeenCalled()
  })

  it('deja la receta en la lista, marcada como anulada, solo cuando el servidor confirmó', async () => {
    const user = montar()

    await anularConMotivo(user, motivoValido)

    await waitFor(() => expect(anularPrescripcion).toHaveBeenCalledWith(11, motivoValido))
    // La anulación es lógica: la tarjeta NO desaparece, queda marcada con el
    // motivo y ya no ofrece anularla otra vez.
    expect(await screen.findByText(/receta anulada/i)).toBeInTheDocument()
    expect(screen.getByText(/receta #11/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(motivoValido))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /anular la receta 11/i })).toBeNull()
  })

  it('deja la tarjeta vigente si la anulación falla, y muestra el motivo', async () => {
    anularPrescripcion.mockRejectedValue(
      new ApiError(403, 'Solo el médico que la emitió puede anularla'),
    )
    const user = montar()

    await anularConMotivo(user, motivoValido)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo el médico que la emitió puede anularla',
    )
    // El cuadro sigue abierto con su propio título; la tarjeta se identifica
    // por su encabezado.
    expect(screen.getByRole('heading', { name: /^receta #11/i })).toBeInTheDocument()
    expect(screen.queryByText(/receta anulada/i)).toBeNull()
  })
})

describe('recetas · estados vacíos', () => {
  it('sin filtros y sin recetas, dice que no hay ninguna registrada', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(sobre([]))
    montar()

    expect(
      await screen.findByText(/todavía no hay recetas registradas en el sistema/i),
    ).toBeInTheDocument()
  })

  it('con un filtro activo y sin resultados, dice que no calzan con el filtro', async () => {
    const user = montar()
    await screen.findByText(/receta #11/i)

    listarHistoricoDePrescripciones.mockResolvedValueOnce(sobre([]))
    await user.selectOptions(screen.getByLabelText('Paciente'), '42')

    expect(await screen.findByText(/no hay recetas con estos filtros/i)).toBeInTheDocument()
  })
})

describe('recetas · carga', () => {
  it('dice qué se cayó y conserva el motivo del backend', async () => {
    listarHistoricoDePrescripciones.mockRejectedValue(new ApiError(500, 'Error del servidor (500).'))
    montar()

    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent(/recetas/i)
    expect(aviso).toHaveTextContent(/Error del servidor \(500\)/i)
  })

  it('reintenta la carga que falló', async () => {
    listarHistoricoDePrescripciones.mockRejectedValueOnce(
      new ApiError(0, 'No se pudo contactar al servidor. ¿Está corriendo el backend?'),
    )
    const user = montar()
    await screen.findByRole('alert')

    listarHistoricoDePrescripciones.mockResolvedValue(sobre([receta()]))
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(await screen.findByText(/receta #11/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('recetas · HU-25 envío por correo', () => {
  it('muestra el estado del último envío junto al botón de reenviar', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([receta({ envioPorCorreo: 'ENVIADO', envioPorCorreoFecha: '2026-08-23T15:02:00' })]),
    )
    montar()

    expect(await screen.findByText(/enviada por correo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reenviar por correo la receta 11/i })).toBeInTheDocument()
  })

  it('un envío fallido se ve como fallido y se puede reenviar', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(
      sobre([receta({ envioPorCorreo: 'FALLIDO', envioPorCorreoFecha: '2026-08-23T15:02:00' })]),
    )
    const user = montar()

    expect(await screen.findByText(/el envío por correo falló/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reenviar por correo la receta 11/i }))

    await waitFor(() => expect(enviarRecetaPorCorreo).toHaveBeenCalledWith(7))
    expect(await screen.findByText(/envío por correo pendiente/i)).toBeInTheDocument()
  })

  it('si el reenvío no lo acepta el servidor, muestra el motivo y no cambia el estado', async () => {
    enviarRecetaPorCorreo.mockRejectedValue(new ApiError(422, 'El paciente no tiene un correo registrado'))
    listarHistoricoDePrescripciones.mockResolvedValue(sobre([receta({ envioPorCorreo: 'FALLIDO' })]))
    const user = montar()

    await user.click(await screen.findByRole('button', { name: /reenviar por correo la receta 11/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El paciente no tiene un correo registrado')
    expect(screen.getByText(/el envío por correo falló/i)).toBeInTheDocument()
  })

  it('un paciente sin correo no se puede enviar: se dice y se ofrece imprimir', async () => {
    listarHistoricoDePrescripciones.mockResolvedValue(sobre([receta({ envioPorCorreo: 'SIN_CORREO' })]))
    montar()

    expect(await screen.findByText(/el paciente no tiene correo registrado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar por correo la receta 11/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /imprimir la receta 11/i })).toBeEnabled()
  })

  it('al emitir la receta de un paciente sin correo avisa y ofrece imprimirla', async () => {
    recetaEmitida.valor = receta({ prescripcionId: 12, envioPorCorreo: 'SIN_CORREO' })
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.click(screen.getByRole('button', { name: /nueva prescripción/i }))
    await user.click(await screen.findByRole('button', { name: /simular emisión/i }))

    const aviso = await screen.findByText(/la receta #12 se emitió, pero el paciente no tiene un correo/i)
    expect(aviso).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /imprimir receta/i })).toBeInTheDocument()
  })

  it('al emitir la receta de un paciente con correo no muestra el aviso de impresión', async () => {
    recetaEmitida.valor = receta({ prescripcionId: 12, envioPorCorreo: 'PENDIENTE' })
    const user = montar()
    await screen.findByText(/receta #11/i)

    await user.click(screen.getByRole('button', { name: /nueva prescripción/i }))
    await user.click(await screen.findByRole('button', { name: /simular emisión/i }))

    await waitFor(() => expect(listarHistoricoDePrescripciones).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/no tiene un correo/i)).toBeNull()
  })
})
