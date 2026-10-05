// El mapa público con Leaflet de verdad (HU-28, criterios 1 y 2).
//
// jsdom no tiene layout ni descarga teselas, pero Leaflet sí crea en él sus
// marcadores y sus globos, que son DOM corriente. Eso basta para comprobar lo
// que piden los criterios: un marcador por clínica y, al tocarlo, su ficha.
// Se usa el componente real y no un doble porque lo que se quiere atrapar es
// justo un fallo de cableado con react-leaflet (un globo que no se abre, un
// marcador que no se dibuja).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MapaDeLaRed, { EL_SALVADOR } from './MapaDeLaRed'
import type { ClinicaPublicaUbicada } from '@/lib/mapaDeLaRed'

function clinica(id: number, name: string, lat: number, lng: number): ClinicaPublicaUbicada {
  return {
    id,
    name,
    lat,
    lng,
    departamento: 'Santa Ana',
    municipio: 'Santa Ana',
    direccion: `Calle ${id}, Barrio El Centro`,
    telefono: '2440-1234',
    horario: 'Lunes a viernes, 7:00 a 16:00',
  }
}

const SANTA_ANA = clinica(1, 'Clínica Regional de Santa Ana', 13.9942, -89.5597)
const SAN_MIGUEL = clinica(2, 'Clínica Oriental', 13.4833, -88.1833)

// jsdom no calcula layout: todo mide 0 × 0, y con un contenedor de tamaño cero
// Leaflet no puede encuadrar nada (`fitBounds` divide entre el ancho y sale
// NaN). Se le da el tamaño de un teléfono corriente, 375 × 600, que además es
// el caso del criterio 5.
const medidasOriginales = {
  ancho: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  alto: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 375 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
})

afterAll(() => {
  if (medidasOriginales.ancho) Object.defineProperty(HTMLElement.prototype, 'clientWidth', medidasOriginales.ancho)
  if (medidasOriginales.alto) Object.defineProperty(HTMLElement.prototype, 'clientHeight', medidasOriginales.alto)
})

function marcadores(contenedor: HTMLElement): HTMLElement[] {
  return [...contenedor.querySelectorAll<HTMLElement>('.leaflet-marker-icon')]
}

describe('MapaDeLaRed', () => {
  it('el encuadre inicial es El Salvador entero', () => {
    const [[latMin, lngMin], [latMax, lngMax]] = EL_SALVADOR
    // San Salvador, Ahuachapán (occidente) y La Unión (oriente) quedan dentro.
    for (const [lat, lng] of [[13.6929, -89.2182], [13.9214, -89.845], [13.3369, -87.8439]]) {
      expect(lat).toBeGreaterThanOrEqual(latMin)
      expect(lat).toBeLessThanOrEqual(latMax)
      expect(lng).toBeGreaterThanOrEqual(lngMin)
      expect(lng).toBeLessThanOrEqual(lngMax)
    }
  })

  it('dibuja un marcador por clínica, con su nombre accesible', () => {
    const { container } = render(
      <MapaDeLaRed clinicas={[SANTA_ANA, SAN_MIGUEL]} departamento="" eleccion={null} />,
    )

    const dibujados = marcadores(container)
    expect(dibujados).toHaveLength(2)
    expect(dibujados.map((m) => m.getAttribute('title')).sort()).toEqual([
      'Clínica Oriental',
      'Clínica Regional de Santa Ana',
    ])
  })

  it('con 50 clínicas dibuja los 50 marcadores', () => {
    const cincuenta = Array.from({ length: 50 }, (_, i) =>
      clinica(100 + i, `Clínica ${i}`, 13.3 + i * 0.02, -89.8 + i * 0.03),
    )
    const { container } = render(<MapaDeLaRed clinicas={cincuenta} departamento="" eleccion={null} />)
    expect(marcadores(container)).toHaveLength(50)
  })

  it('al tocar un marcador abre su globo con dirección, teléfono y horario', async () => {
    const { container } = render(
      <MapaDeLaRed clinicas={[SANTA_ANA, SAN_MIGUEL]} departamento="" eleccion={null} />,
    )

    const marcador = marcadores(container).find((m) => m.title === 'Clínica Oriental')!
    fireEvent.click(marcador)

    const globo = await waitFor(() => {
      const abierto = container.querySelector<HTMLElement>('.leaflet-popup-content')
      expect(abierto).not.toBeNull()
      return abierto!
    })
    expect(globo).toHaveTextContent('Clínica Oriental')
    expect(globo).toHaveTextContent('Calle 2, Barrio El Centro')
    expect(globo).toHaveTextContent('2440-1234')
    expect(globo).toHaveTextContent('Lunes a viernes, 7:00 a 16:00')
  })

  it('elegir una clínica desde la lista abre su globo', async () => {
    const { container, rerender } = render(
      <MapaDeLaRed clinicas={[SANTA_ANA, SAN_MIGUEL]} departamento="" eleccion={null} />,
    )
    rerender(
      <MapaDeLaRed clinicas={[SANTA_ANA, SAN_MIGUEL]} departamento="" eleccion={{ id: 1, vez: 1 }} />,
    )

    await waitFor(() =>
      expect(container.querySelector('.leaflet-popup-content')).toHaveTextContent(
        'Clínica Regional de Santa Ana',
      ),
    )
  })

  it('trae los botones de acercar y alejar, además de los gestos (criterio 5)', () => {
    render(<MapaDeLaRed clinicas={[SANTA_ANA]} departamento="" eleccion={null} />)
    // Pellizcar no es lo único: los botones sirven a quien no puede o no sabe.
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument()
  })
})
