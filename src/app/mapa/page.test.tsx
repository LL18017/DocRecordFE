// La página pública /mapa (HU-28, DRS-96).
//
// El mapa de Leaflet se sustituye por un doble que solo enumera los marcadores
// que recibe: lo que se prueba aquí es la página —qué le pasa al mapa, qué
// lista aparte, qué hace el filtro—. El mapa real tiene su propia prueba en
// components/mapa/MapaDeLaRed.test.tsx.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { MapaDeLaRedProps } from '@/components/mapa/MapaDeLaRed'
import type { ClinicaPublicaDto } from '@/services/mapaDeClinicas'
import MapaPage from './page'

const listarClinicasDeLaRed = vi.hoisted(() => vi.fn<() => Promise<ClinicaPublicaDto[]>>())

vi.mock('@/services/mapaDeClinicas', () => ({
  listarClinicasDeLaRed: () => listarClinicasDeLaRed(),
}))

/** Lo último que la página le pasó al mapa. */
const ultimasProps = vi.hoisted(() => ({ actual: null as MapaDeLaRedProps | null }))

vi.mock('@/components/mapa/MapaDeLaRed', () => ({
  default: (props: MapaDeLaRedProps) => {
    ultimasProps.actual = props
    return (
      <ul aria-label="marcadores">
        {props.clinicas.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
    )
  },
}))

function dto(cambios: Partial<ClinicaPublicaDto> & { clinicaId: number; name: string }): ClinicaPublicaDto {
  return {
    latitud: 13.9942,
    longitud: -89.5597,
    departamento: 'Santa Ana',
    municipio: 'Santa Ana',
    direccion: 'Avenida Independencia Sur',
    telefono: '2440-1234',
    horario: 'Lunes a viernes, 7:00 a 16:00',
    ...cambios,
  }
}

const RED: ClinicaPublicaDto[] = [
  dto({ clinicaId: 1, name: 'Clínica Regional de Santa Ana' }),
  dto({ clinicaId: 2, name: 'Clínica Oriental', departamento: 'San Miguel', municipio: 'San Miguel', latitud: 13.4833, longitud: -88.1833 }),
  dto({ clinicaId: 3, name: 'Clínica Jiquilisco', departamento: 'Usulután', municipio: 'Jiquilisco', latitud: 13.3167, longitud: -88.5833 }),
  // Registrada por su nombre y su dirección, todavía sin GPS.
  dto({ clinicaId: 4, name: 'Sucursal Ciudad Barrios', departamento: 'San Miguel', municipio: 'Ciudad Barrios', latitud: null, longitud: null, direccion: 'Barrio El Centro, frente al parque' }),
]

function marcadoresDibujados(): string[] {
  return within(screen.getByRole('list', { name: 'marcadores' }))
    .queryAllByRole('listitem')
    .map((li) => li.textContent ?? '')
}

beforeEach(() => {
  listarClinicasDeLaRed.mockReset()
  listarClinicasDeLaRed.mockResolvedValue(RED)
  ultimasProps.actual = null
})

async function abrir() {
  const user = userEvent.setup()
  render(<MapaPage />)
  await screen.findByText(/4 clínicas en la red/)
  return user
}

describe('/mapa · criterio 1: un marcador por cada clínica activa', () => {
  it('se abre sin sesión y pide la lista una sola vez', async () => {
    await abrir()
    expect(listarClinicasDeLaRed).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Clínicas de la red' })).toBeInTheDocument()
  })

  it('le pasa al mapa una chinche por cada clínica con coordenadas', async () => {
    await abrir()
    await waitFor(() =>
      expect(marcadoresDibujados()).toEqual([
        'Clínica Regional de Santa Ana',
        'Clínica Oriental',
        'Clínica Jiquilisco',
      ]),
    )
  })

  it('el mapa abre sin filtro, que es El Salvador entero', async () => {
    await abrir()
    await waitFor(() => expect(ultimasProps.actual?.departamento).toBe(''))
  })

  it('con 50 clínicas termina de cargar enseguida y las dibuja todas (criterio 4)', async () => {
    const cincuenta = Array.from({ length: 50 }, (_, i) =>
      dto({ clinicaId: 100 + i, name: `Clínica ${i}`, latitud: 13.3 + i * 0.02, longitud: -89.8 + i * 0.03 }),
    )
    listarClinicasDeLaRed.mockResolvedValue(cincuenta)

    const inicio = performance.now()
    render(<MapaPage />)
    await screen.findByText('50 clínicas en la red')
    await waitFor(() => expect(marcadoresDibujados()).toHaveLength(50))
    // Muy holgado a propósito: en jsdom no hay red ni teselas, así que esto
    // mide solo lo que la página añade, y eso tiene que ser una fracción de
    // los 3 segundos del criterio.
    expect(performance.now() - inicio).toBeLessThan(1500)
    expect(listarClinicasDeLaRed).toHaveBeenCalledTimes(1)
  })
})

describe('/mapa · las clínicas sin coordenadas', () => {
  it('se listan aparte con su dirección, sin inventarles un punto', async () => {
    await abrir()

    expect(marcadoresDibujados()).not.toContain('Sucursal Ciudad Barrios')

    const aparte = screen.getByRole('heading', { name: /sin ubicación en el mapa \(1\)/i }).closest('section')!
    expect(within(aparte).getByText('Sucursal Ciudad Barrios')).toBeInTheDocument()
    expect(within(aparte).getByText('Barrio El Centro, frente al parque')).toBeInTheDocument()
  })
})

describe('/mapa · criterio 3: filtrar por departamento', () => {
  it('el selector ofrece los departamentos de la red, con cuántas clínicas tiene cada uno', async () => {
    await abrir()
    const selector = screen.getByLabelText('Departamento')
    const opciones = within(selector).getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual([
      'Todos los departamentos (4)',
      'San Miguel (2)',
      'Santa Ana (1)',
      'Usulután (1)',
    ])
  })

  it('elegir un departamento deja solo sus marcadores, sin volver a pedir nada', async () => {
    const user = await abrir()

    await user.selectOptions(screen.getByLabelText('Departamento'), 'San Miguel (2)')

    expect(marcadoresDibujados()).toEqual(['Clínica Oriental'])
    // La de Ciudad Barrios es de San Miguel: sigue apareciendo, en su lista.
    expect(screen.getByText('Sucursal Ciudad Barrios')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 clínicas en San Miguel')
    // Filtrar es en memoria: ni una segunda petición ni recarga.
    expect(listarClinicasDeLaRed).toHaveBeenCalledTimes(1)
    expect(ultimasProps.actual?.departamento).toBe('san miguel')
  })

  it('un departamento sin clínicas sin GPS no muestra la lista aparte', async () => {
    const user = await abrir()
    await user.selectOptions(screen.getByLabelText('Departamento'), 'Usulután (1)')

    expect(marcadoresDibujados()).toEqual(['Clínica Jiquilisco'])
    expect(screen.queryByRole('heading', { name: /sin ubicación/i })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('1 clínica en Usulután')
  })

  it('volver a «Todos» recupera la red entera', async () => {
    const user = await abrir()
    const selector = screen.getByLabelText('Departamento')
    await user.selectOptions(selector, 'Santa Ana (1)')
    await user.selectOptions(selector, 'Todos los departamentos (4)')

    expect(marcadoresDibujados()).toHaveLength(3)
  })
})

describe('/mapa · elegir desde la lista', () => {
  it('«Ver en el mapa» le dice al mapa qué clínica abrir, también la segunda vez', async () => {
    const user = await abrir()

    const boton = screen.getByRole('button', { name: 'Ver Clínica Oriental en el mapa' })
    await user.click(boton)
    expect(ultimasProps.actual?.eleccion).toEqual({ id: 2, vez: 1 })

    // Repetir la misma clínica cambia la elección: si no, el segundo clic no
    // volvería a abrir el globo que el usuario cerró.
    await user.click(boton)
    expect(ultimasProps.actual?.eleccion).toEqual({ id: 2, vez: 2 })
  })
})

describe('/mapa · cuando el servidor falla', () => {
  it('lo dice y deja reintentar', async () => {
    listarClinicasDeLaRed.mockRejectedValueOnce(new ApiError(0, 'sin red'))
    const user = userEvent.setup()
    render(<MapaPage />)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/no se pudo cargar el mapa de clínicas/i)

    await user.click(within(alerta).getByRole('button', { name: 'Reintentar' }))
    await screen.findByText(/4 clínicas en la red/)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(listarClinicasDeLaRed).toHaveBeenCalledTimes(2)
  })

  it('una red sin clínicas activas lo dice en vez de dejar un mapa vacío sin explicación', async () => {
    listarClinicasDeLaRed.mockResolvedValue([])
    render(<MapaPage />)
    expect(await screen.findByText('Todavía no hay clínicas activas en la red.')).toBeInTheDocument()
  })
})
