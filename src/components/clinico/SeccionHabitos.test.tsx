import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { HabitoDto, HabitoHistorialDto, HabitoPayload, TipoDeHabitoDto } from '@/services/habitos'
import { SeccionHabitos } from './SeccionHabitos'

const listarHabitos = vi.fn<(pacienteId: number) => Promise<HabitoDto[]>>()
const listarTiposDeHabito = vi.fn<() => Promise<TipoDeHabitoDto[]>>()
const registrarHabito = vi.fn<(p: HabitoPayload) => Promise<HabitoDto>>()
const listarHistorialDeHabito = vi.fn<(id: number) => Promise<HabitoHistorialDto[]>>()
const anularHabito = vi.fn<(id: number, motivo: string) => Promise<HabitoDto>>()

vi.mock('@/services/habitos', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/habitos')>()
  return {
    ...real,
    listarHabitos: (id: number) => listarHabitos(id),
    listarTiposDeHabito: () => listarTiposDeHabito(),
    registrarHabito: (p: HabitoPayload) => registrarHabito(p),
    listarHistorialDeHabito: (id: number) => listarHistorialDeHabito(id),
    anularHabito: (id: number, motivo: string) => anularHabito(id, motivo),
  }
})

const TABACO = { id: 1, descripcion: 'Tabaquismo' }
const EJERCICIO = { id: 2, descripcion: 'Actividad física' }

function habito(parcial: Partial<HabitoDto>): HabitoDto {
  return {
    id: 1,
    descripcion: 'Camina 30 minutos',
    nivel: 'BAJO',
    frecuencia: 'Diaria',
    observaciones: null,
    actualizadoEn: '2026-08-23T14:30:00',
    actualizadoPor: 'Juan Guerra',
    pacienteId: 7,
    tipoHabito: EJERCICIO,
    estado: 'ACTIVO',
    motivoAnulacion: null,
    anuladoEn: null,
    anuladoPor: null,
    ...parcial,
  }
}

function version(parcial: Partial<HabitoHistorialDto>): HabitoHistorialDto {
  return {
    historialId: 1,
    habitoId: 1,
    tipoHabito: TABACO,
    descripcion: 'Fuma cigarrillos',
    nivel: 'ALTO',
    frecuencia: 'A diario',
    observaciones: null,
    actualizadoEn: '2026-03-02T09:15:00',
    actualizadoPor: 'Juan Guerra',
    reemplazadoEn: '2026-08-23T14:30:00',
    reemplazadoPor: 'Ana Pérez',
    ...parcial,
  }
}

function montar(props: Partial<React.ComponentProps<typeof SeccionHabitos>> = {}) {
  return render(
    <SeccionHabitos pacienteId={7} puedeEditar puedeAnular expanded onToggle={() => {}} {...props} />,
  )
}

beforeEach(() => {
  listarHabitos.mockReset()
  listarTiposDeHabito.mockReset()
  registrarHabito.mockReset()
  listarHistorialDeHabito.mockReset()
  anularHabito.mockReset()
  listarHistorialDeHabito.mockResolvedValue([])
  listarHabitos.mockResolvedValue([])
  listarTiposDeHabito.mockResolvedValue([TABACO, EJERCICIO])
})

describe('hábitos (HU-14)', () => {
  it('c1: pide los hábitos de ESTE paciente y registra uno con tipo, nivel, descripción, frecuencia y observaciones', async () => {
    const user = userEvent.setup()
    registrarHabito.mockImplementation(async (p) =>
      habito({
        id: 9,
        tipoHabito: TABACO,
        nivel: p.nivel,
        descripcion: p.descripcion,
        frecuencia: p.frecuencia,
        observaciones: p.observaciones ?? null,
      }),
    )
    montar()

    await user.click(await screen.findByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nuevo hábito' })
    await user.selectOptions(within(form).getByLabelText(/Tipo de hábito/), '1')
    await user.selectOptions(within(form).getByLabelText(/Nivel de riesgo/), 'ALTO')
    await user.type(within(form).getByLabelText(/Descripción/), 'Fuma cigarrillos')
    await user.type(within(form).getByLabelText(/Frecuencia/), '10 al día')
    await user.type(within(form).getByLabelText(/Observaciones/), 'Desde hace 5 años')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(listarHabitos).toHaveBeenCalledWith(7)
    expect(registrarHabito).toHaveBeenCalledWith({
      pacienteId: 7,
      tipoHabitoId: 1,
      nivel: 'ALTO',
      descripcion: 'Fuma cigarrillos',
      frecuencia: '10 al día',
      observaciones: 'Desde hace 5 años',
    })
    expect(await screen.findByText('Fuma cigarrillos')).toBeVisible()
    expect(screen.getByText('Desde hace 5 años')).toBeVisible()
  })

  it('c1: la frecuencia es obligatoria y las observaciones no viajan si están en blanco', async () => {
    const user = userEvent.setup()
    registrarHabito.mockImplementation(async (p) => habito({ id: 9, frecuencia: p.frecuencia }))
    montar()

    await user.click(await screen.findByRole('button', { name: '+ Agregar' }))
    const form = screen.getByRole('form', { name: 'Nuevo hábito' })
    await user.selectOptions(within(form).getByLabelText(/Tipo de hábito/), '2')
    await user.selectOptions(within(form).getByLabelText(/Nivel de riesgo/), 'BAJO')
    await user.type(within(form).getByLabelText(/Descripción/), 'Camina')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent(/frecuencia/)
    expect(registrarHabito).not.toHaveBeenCalled()

    await user.type(within(form).getByLabelText(/Frecuencia/), '  3 veces por semana ')
    await user.click(within(form).getByRole('button', { name: 'Guardar hábito' }))

    expect(registrarHabito).toHaveBeenCalledTimes(1)
    const enviado = registrarHabito.mock.calls[0][0]
    expect(enviado.frecuencia).toBe('3 veces por semana')
    expect(enviado).not.toHaveProperty('observaciones')
  })

  it('c1: cada hábito muestra su frecuencia, sus observaciones y cuándo y quién lo actualizó', async () => {
    listarHabitos.mockResolvedValue([
      habito({ frecuencia: '3 veces por semana', observaciones: 'Trota en el parque' }),
      habito({ id: 2, descripcion: 'Dieta', actualizadoPor: null }),
    ])
    montar()

    const filas = await screen.findAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Frecuencia: 3 veces por semana')
    expect(filas[0]).toHaveTextContent('Observaciones: Trota en el parque')
    expect(filas[0]).toHaveTextContent(/Actualizado el .*2026.* por Juan Guerra/)
    // Un hábito anterior a que se guardara el autor no inventa uno.
    expect(filas[1]).toHaveTextContent(/Actualizado el .*2026/)
    expect(filas[1]).not.toHaveTextContent(/ por /)
    expect(filas[1]).not.toHaveTextContent('Observaciones:')
  })

  it('c2: «Ver historial» muestra las versiones anteriores con sus fechas, la más reciente primero', async () => {
    const user = userEvent.setup()
    listarHabitos.mockResolvedValue([habito({ id: 4, tipoHabito: TABACO, nivel: 'BAJO', descripcion: 'Dejó de fumar', frecuencia: 'Nunca' })])
    listarHistorialDeHabito.mockResolvedValue([
      version({ historialId: 2, nivel: 'MODERADO', frecuencia: '3 veces por semana', actualizadoEn: '2026-06-10T10:00:00' }),
      version({ historialId: 1, nivel: 'ALTO', frecuencia: 'A diario', actualizadoEn: '2026-03-02T09:15:00' }),
    ])
    montar()

    await user.click(await screen.findByRole('button', { name: /Ver historial del hábito: Tabaquismo/ }))

    expect(listarHistorialDeHabito).toHaveBeenCalledWith(4)
    const historial = await screen.findByLabelText('Historial de Tabaquismo')
    const versiones = await within(historial).findAllByRole('listitem')
    expect(versiones).toHaveLength(2)
    expect(versiones[0]).toHaveTextContent('Frecuencia: 3 veces por semana')
    expect(versiones[0]).toHaveTextContent('Riesgo moderado')
    expect(versiones[1]).toHaveTextContent('Frecuencia: A diario')
    expect(versiones[1]).toHaveTextContent('Riesgo alto')
    expect(versiones[1]).toHaveTextContent(/2026/)
    expect(versiones[1]).toHaveTextContent('Reemplazado el')
    expect(versiones[1]).toHaveTextContent('por Ana Pérez')

    // Se cierra con el mismo botón.
    await user.click(screen.getByRole('button', { name: /Ocultar historial del hábito: Tabaquismo/ }))
    expect(screen.queryByLabelText('Historial de Tabaquismo')).toBeNull()
  })

  it('c2: un hábito que nunca se editó lo dice, y quien solo consulta también puede ver el historial', async () => {
    const user = userEvent.setup()
    listarHabitos.mockResolvedValue([habito({})])
    montar({ puedeEditar: false, puedeAnular: false })

    await user.click(await screen.findByRole('button', { name: /Ver historial del hábito/ }))

    expect(await screen.findByText(/no hay versiones anteriores/)).toBeVisible()
  })

  it('c2: si el historial no carga, lo dice', async () => {
    const user = userEvent.setup()
    listarHabitos.mockResolvedValue([habito({})])
    listarHistorialDeHabito.mockRejectedValue(new Error('Sin conexión'))
    montar()

    await user.click(await screen.findByRole('button', { name: /Ver historial del hábito/ }))

    expect(await screen.findByText('Sin conexión')).toBeVisible()
  })

  it('c3: los de riesgo alto salen primero y destacados', async () => {
    listarHabitos.mockResolvedValue([
      habito({ id: 1 }),
      habito({ id: 2, tipoHabito: TABACO, nivel: 'ALTO', descripcion: 'Fuma a diario' }),
    ])
    montar()

    const filas = await screen.findAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Tabaquismo')
    expect(within(filas[0]).getByText('Riesgo alto')).toBeVisible()
    expect(filas[0].className).toMatch(/red/)
  })

  it('el administrador consulta, pero no ve botones para cambiar nada', async () => {
    listarHabitos.mockResolvedValue([habito({})])
    montar({ puedeEditar: false, puedeAnular: false })

    expect(await screen.findByText('Camina 30 minutos')).toBeVisible()
    expect(screen.queryByRole('button', { name: '+ Agregar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Anular/ })).toBeNull()
  })

  it('sin tipos en el catálogo no ofrece un formulario que no se puede llenar', async () => {
    listarTiposDeHabito.mockResolvedValue([])
    montar()

    expect(await screen.findByText(/No hay tipos de hábito en el catálogo/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '+ Agregar' })).toBeNull()
  })

  // ── DEF-03: anular en vez de borrar ──────────────────────────────────────
  describe('anular un hábito (DEF-03)', () => {
    const MOTIVO = 'Se registró en el paciente equivocado'

    it('ya no ofrece «Eliminar»: ofrece «Anular»', async () => {
      listarHabitos.mockResolvedValue([habito({})])
      montar()

      expect(await screen.findByRole('button', { name: /Anular hábito: Actividad física/ })).toBeVisible()
      expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull()
    })

    it('con un motivo de menos de 10 caracteres avisa en línea y no deja confirmar', async () => {
      const user = userEvent.setup()
      listarHabitos.mockResolvedValue([habito({})])
      montar()

      await user.click(await screen.findByRole('button', { name: /Anular hábito: Actividad física/ }))
      const dialogo = screen.getByRole('form', { name: /Anular hábito: Actividad física/ })
      const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar anulación' })
      expect(confirmar).toBeDisabled()

      await user.type(within(dialogo).getByLabelText(/Motivo de la anulación/), 'Error')

      expect(within(dialogo).getByText(/entre 10 y 500 caracteres/)).toBeVisible()
      expect(within(dialogo).getByText(/5\/500/)).toBeVisible()
      expect(confirmar).toBeDisabled()
      await user.click(confirmar)
      expect(anularHabito).not.toHaveBeenCalled()
    })

    it('con un motivo válido llama al servicio y el hábito queda marcado, con motivo, quién y cuándo, y sin acciones', async () => {
      const user = userEvent.setup()
      listarHabitos.mockResolvedValue([habito({ id: 4 })])
      anularHabito.mockImplementation(async (id, motivo) =>
        habito({
          id,
          estado: 'ANULADO',
          motivoAnulacion: motivo,
          anuladoEn: '2026-11-15T11:00:00',
          anuladoPor: 'Ana Pérez',
        }),
      )
      montar()

      await user.click(await screen.findByRole('button', { name: /Anular hábito: Actividad física/ }))
      const dialogo = screen.getByRole('form', { name: /Anular hábito: Actividad física/ })
      await user.type(within(dialogo).getByLabelText(/Motivo de la anulación/), `  ${MOTIVO} `)
      expect(within(dialogo).getByRole('button', { name: 'Confirmar anulación' })).toBeEnabled()
      await user.click(within(dialogo).getByRole('button', { name: 'Confirmar anulación' }))

      expect(anularHabito).toHaveBeenCalledWith(4, MOTIVO)
      const fila = await screen.findByRole('listitem', { name: 'Hábito anulado: Actividad física' })
      // «Anulado» aparece dos veces: el distintivo junto al tipo y el inicio de la
      // línea «Anulado el … por …». Se comprueba el distintivo, que es el primero.
      const marcas = within(fila).getAllByText('Anulado')
      expect(marcas).toHaveLength(2)
      expect(marcas[0]).toBeVisible()
      expect(fila).toHaveTextContent(`Motivo: ${MOTIVO}`)
      expect(fila).toHaveTextContent(/Anulado el .*2026.* por Ana Pérez/)
      expect(within(fila).getByText('Camina 30 minutos').className).toMatch(/line-through/)
      expect(within(fila).queryByRole('button', { name: /Editar/ })).toBeNull()
      expect(within(fila).queryByRole('button', { name: /Anular/ })).toBeNull()
      await waitFor(() => expect(screen.queryByRole('form', { name: /Anular hábito/ })).toBeNull())
    })

    it('un hábito que ya viene anulado del backend se muestra marcado y sin Editar ni Anular', async () => {
      listarHabitos.mockResolvedValue([
        habito({
          estado: 'ANULADO',
          motivoAnulacion: 'Registrado por duplicado',
          anuladoEn: '2026-11-10T08:00:00',
          anuladoPor: 'Juan Guerra',
        }),
      ])
      montar()

      const fila = await screen.findByRole('listitem', { name: 'Hábito anulado: Actividad física' })
      expect(fila).toHaveTextContent('Motivo: Registrado por duplicado')
      expect(fila).toHaveTextContent('por Juan Guerra')
      expect(within(fila).queryByRole('button', { name: /Editar/ })).toBeNull()
      expect(within(fila).queryByRole('button', { name: /Anular/ })).toBeNull()
    })

    it.each([
      [400, 'El motivo debe tener entre 10 y 500 caracteres'],
      [403, 'Solo quien registró el hábito o un administrador puede anularlo'],
      [409, 'El hábito ya estaba anulado'],
    ])('si el backend responde %i, su mensaje se ve dentro del diálogo y el hábito sigue vigente', async (estado, mensaje) => {
      const user = userEvent.setup()
      listarHabitos.mockResolvedValue([habito({})])
      anularHabito.mockRejectedValue(new ApiError(estado, mensaje))
      montar()

      await user.click(await screen.findByRole('button', { name: /Anular hábito: Actividad física/ }))
      const dialogo = screen.getByRole('form', { name: /Anular hábito: Actividad física/ })
      await user.type(within(dialogo).getByLabelText(/Motivo de la anulación/), MOTIVO)
      await user.click(within(dialogo).getByRole('button', { name: 'Confirmar anulación' }))

      expect(await within(dialogo).findByRole('alert')).toHaveTextContent(mensaje)
      // El motivo escrito no se pierde y la lista no cambió.
      expect(within(dialogo).getByLabelText(/Motivo de la anulación/)).toHaveValue(MOTIVO)
      expect(screen.queryByRole('listitem', { name: /Hábito anulado/ })).toBeNull()
    })
  })
})
