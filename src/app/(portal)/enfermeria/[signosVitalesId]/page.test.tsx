// Detalle de una toma de constantes.
//
// HU-16 (DRS-26): criterio 3 (lo que sale de rango va en rojo) y criterio 4
// (una toma no se elimina: se anula con motivo y sigue visible, marcada).
// HU-17 (DRS-88): el IMC con su clasificación y el aviso de percentiles.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { User } from '@/types'
import type { SignosVitalesDto } from '@/services/signosVitales'
import DetalleDeTomaPage from './page'

const obtenerToma = vi.fn<(id: number) => Promise<SignosVitalesDto>>()
const anularToma = vi.fn<(id: number, motivo: string) => Promise<SignosVitalesDto>>()

vi.mock('next/navigation', () => ({
  useParams: () => ({ signosVitalesId: '11' }),
}))

vi.mock('@/services/signosVitales', async (importarOriginal) => {
  // Los ayudantes de presentación se dejan reales: son lo que la pantalla tiene
  // que usar bien.
  const real = await importarOriginal<typeof import('@/services/signosVitales')>()
  return {
    ...real,
    obtenerToma: (id: number) => obtenerToma(id),
    anularToma: (id: number, motivo: string) => anularToma(id, motivo),
  }
})

const ENFERMERA: User = { name: 'Marta', roles: ['enfermera'] }
const MEDICO: User = { name: 'Dr. Pérez', roles: ['medico'] }
const SESION: { user: User | null } = { user: ENFERMERA }

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => SESION,
}))

const PERCENTILES =
  'La clasificación de adultos no aplica en menores de 18 años; debe interpretarse por percentiles'

const TOMA: SignosVitalesDto = {
  signosVitalesId: 11,
  tomadoEn: '2026-09-02T07:45:00',
  paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
  enfermera: { personaId: 10, nombres: 'Marta Lucía', apellidos: 'Guevara Mejía' },
  consultaId: null,
  pesoKg: 68.4,
  estaturaCm: 162,
  temperaturaC: 36.8,
  presionSistolica: 120,
  presionDiastolica: 80,
  pulsoLpm: 74,
  frecuenciaRespRpm: 16,
  saturacionPct: 97,
  observaciones: null,
  imc: 26.1,
  clasificacionImc: 'Sobrepeso',
  estado: 'ACTIVA',
  motivoAnulacion: null,
  anuladaEn: null,
  anuladaPor: null,
}

const ANULADA: SignosVitalesDto = {
  ...TOMA,
  temperaturaC: 40,
  estado: 'ANULADA',
  motivoAnulacion: 'Paciente equivocado',
  anuladaEn: '2026-09-02T08:30:00',
  anuladaPor: { personaId: 10, nombres: 'Marta Lucía', apellidos: 'Guevara Mejía' },
}

function celda(etiqueta: string): HTMLElement {
  const rotulo = screen.getByText(etiqueta, { selector: 'p' })
  const celda = rotulo.parentElement
  if (!celda) throw new Error(`«${etiqueta}» no está en una celda`)
  return celda
}

async function montar(toma: SignosVitalesDto) {
  obtenerToma.mockResolvedValue(toma)
  render(<DetalleDeTomaPage />)
  await screen.findByText(/Toma de constantes del/)
  return userEvent.setup()
}

beforeEach(() => {
  SESION.user = ENFERMERA
  obtenerToma.mockReset()
  anularToma.mockReset()
})

describe('detalle de la toma · fuera de rango en rojo (HU-16 criterio 3)', () => {
  it('destaca en rojo lo que sale del rango normal y no lo demás', async () => {
    await montar({ ...TOMA, temperaturaC: 40, saturacionPct: 88 })

    expect(celda('Temperatura')).toHaveAttribute('data-fuera-de-rango', 'true')
    expect(celda('Saturación O₂')).toHaveAttribute('data-fuera-de-rango', 'true')
    expect(within(celda('Temperatura')).getByText(/fuera de rango/i)).toHaveTextContent('36–37.5 °C')

    expect(celda('Presión arterial')).not.toHaveAttribute('data-fuera-de-rango')
    expect(celda('Pulso')).not.toHaveAttribute('data-fuera-de-rango')
  })

  it('el peso nunca se destaca; el IMC es quien lo juzga', async () => {
    await montar({ ...TOMA, pesoKg: 120 })

    expect(celda('Peso')).not.toHaveAttribute('data-fuera-de-rango')
    // IMC 26.1 -> sobrepeso -> fuera de 18.5–24.9.
    expect(screen.getByTestId('imc')).toHaveAttribute('data-fuera-de-rango', 'true')
  })
})

describe('detalle de la toma · IMC (HU-17)', () => {
  it('muestra el IMC con un decimal y su clasificación', async () => {
    await montar(TOMA)

    const imc = screen.getByTestId('imc')
    expect(imc).toHaveTextContent('26.1')
    expect(within(imc).getByText('Sobrepeso')).toBeInTheDocument()
  })

  it('en un menor muestra el aviso de percentiles', async () => {
    await montar({ ...TOMA, imc: 16, clasificacionImc: PERCENTILES })

    expect(within(screen.getByTestId('imc')).getByRole('note')).toHaveTextContent(PERCENTILES)
  })
})

describe('detalle de la toma · anulación (HU-16 criterio 4)', () => {
  it('la enfermera ve el botón «Anular toma» en una toma activa', async () => {
    await montar(TOMA)

    expect(screen.getByRole('button', { name: 'Anular toma' })).toBeInTheDocument()
  })

  it('el médico lee la toma pero no ve el botón', async () => {
    SESION.user = MEDICO
    await montar(TOMA)

    expect(screen.queryByRole('button', { name: 'Anular toma' })).not.toBeInTheDocument()
  })

  it('no hay forma de eliminarla: ningún botón de borrar', async () => {
    await montar(TOMA)

    expect(screen.queryByRole('button', { name: /eliminar|borrar/i })).not.toBeInTheDocument()
  })

  it('exige el motivo: sin escribirlo no se puede confirmar', async () => {
    const user = await montar(TOMA)

    await user.click(screen.getByRole('button', { name: 'Anular toma' }))

    const confirmar = screen.getByRole('button', { name: 'Confirmar anulación' })
    expect(confirmar).toBeDisabled()

    await user.type(screen.getByLabelText('Motivo de la anulación'), '   ')
    expect(confirmar).toBeDisabled()
    expect(anularToma).not.toHaveBeenCalled()
  })

  it('anula con motivo y la toma pasa a verse marcada, con motivo, quién y cuándo', async () => {
    anularToma.mockResolvedValue(ANULADA)
    const user = await montar(TOMA)

    await user.click(screen.getByRole('button', { name: 'Anular toma' }))
    await user.type(screen.getByLabelText('Motivo de la anulación'), '  Paciente equivocado ')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    await waitFor(() => expect(anularToma).toHaveBeenCalledWith(11, 'Paciente equivocado'))

    const aviso = await screen.findByText(/Toma ANULADA/)
    const banner = aviso.closest('[role="status"]') as HTMLElement
    expect(banner).toHaveTextContent('Paciente equivocado')
    expect(banner).toHaveTextContent('Marta Lucía Guevara Mejía')
    expect(banner).toHaveTextContent('08:30')
    // El botón desaparece: no se anula dos veces.
    expect(screen.queryByRole('button', { name: 'Anular toma' })).not.toBeInTheDocument()
  })

  it('una toma anulada sigue visible y no destaca en rojo sus valores', async () => {
    await montar(ANULADA)

    // Se ve la toma entera, con su 40 °C...
    expect(within(celda('Temperatura')).getByText('40')).toBeInTheDocument()
    // ...pero no alarma por una medida que enfermería declaró errónea.
    expect(celda('Temperatura')).not.toHaveAttribute('data-fuera-de-rango')
    expect(screen.getByText(/Toma ANULADA/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Anular toma' })).not.toBeInTheDocument()
  })

  it('si el servidor lo rechaza (otra enfermera, 403) lo dice dentro del diálogo y no anula', async () => {
    anularToma.mockRejectedValue(
      new ApiError(403, 'Solo la enfermera que registro la toma puede anularla'),
    )
    const user = await montar(TOMA)

    await user.click(screen.getByRole('button', { name: 'Anular toma' }))
    await user.type(screen.getByLabelText('Motivo de la anulación'), 'No es mía')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo la enfermera que registro la toma puede anularla',
    )
    // La pantalla no cambió y lo escrito sigue ahí para corregirlo.
    expect(screen.queryByText(/Toma ANULADA/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Motivo de la anulación')).toHaveValue('No es mía')
  })
})
