// Guardas del encuadre inicial del mapa de clínicas.
//
// El mapa real no se puede probar en jsdom (no hay layout ni teselas), pero sí
// la decisión de a dónde mira: es la que puede dejar al usuario mirando el
// océano. Los dos fallos que se protegen aquí son concretos: contar como
// (0, 0) a una clínica sin coordenadas —el golfo de Guinea— y encuadrar un
// rectángulo de área cero, que en Leaflet salta al zoom máximo y deja la
// pantalla en una cuadrícula gris.

import { describe, expect, it } from 'vitest'
import {
  CENTRO_EL_SALVADOR,
  ZOOM_CLINICA,
  ZOOM_PAIS,
  calcularVistaInicial,
  tieneUbicacion,
} from './mapaClinicas'
import type { Clinica } from '@/types'

/** Las tres sedes reales del proyecto. */
const SANTA_ANA: Clinica = { id: 1, name: 'Santa Ana', lat: 13.9942, lng: -89.5597 }
const SAN_SALVADOR: Clinica = { id: 2, name: 'San Salvador', lat: 13.7053, lng: -89.2182 }
const SOYAPANGO: Clinica = { id: 3, name: 'Soyapango', lat: 13.7079, lng: -89.1503 }

/** Sucursal registrada por su nombre, todavía sin pasar a tomar el GPS. */
const SIN_GPS: Clinica = { id: 4, name: 'Sucursal nueva', lat: null, lng: null }

/** Caso a medias: se anotó la latitud y se quedó pendiente la longitud. */
const MEDIO_GPS: Clinica = { id: 5, name: 'Sucursal a medias', lat: 13.5, lng: null }

/** Recuadro generoso alrededor del territorio salvadoreño. */
const EL_SALVADOR = { latMin: 13.1, latMax: 14.5, lngMin: -90.2, lngMax: -87.6 }

function estaEnElSalvador([lat, lng]: [number, number]): boolean {
  return (
    lat >= EL_SALVADOR.latMin &&
    lat <= EL_SALVADOR.latMax &&
    lng >= EL_SALVADOR.lngMin &&
    lng <= EL_SALVADOR.lngMax
  )
}

describe('tieneUbicacion', () => {
  it('descarta la clínica a la que le falta una sola coordenada', () => {
    // Una latitud sin longitud no ubica nada; dibujarla exigiría inventarse la
    // otra mitad del punto.
    expect(tieneUbicacion(MEDIO_GPS)).toBe(false)
    expect(tieneUbicacion({ ...MEDIO_GPS, lat: null, lng: -89.2 })).toBe(false)
    expect(tieneUbicacion(SIN_GPS)).toBe(false)
    expect(tieneUbicacion(SAN_SALVADOR)).toBe(true)
  })

  it('acepta el cero, que es una coordenada válida', () => {
    // `if (!clinica.lat)` daría falso aquí. Está en el golfo de Guinea, pero
    // es un punto real y el filtro no es quien decide si tiene sentido.
    expect(tieneUbicacion({ id: 9, name: 'Isla', lat: 0, lng: 0 })).toBe(true)
  })
})

describe('calcularVistaInicial · ninguna clínica con coordenadas', () => {
  it('abre sobre El Salvador cuando no hay ninguna clínica', () => {
    const vista = calcularVistaInicial([])

    expect(vista.centro).toEqual(CENTRO_EL_SALVADOR)
    expect(vista.zoom).toBe(ZOOM_PAIS)
    expect(vista.limites).toBeNull()
    expect(estaEnElSalvador(vista.centro)).toBe(true)
  })

  it('abre sobre El Salvador cuando ninguna clínica tiene coordenadas', () => {
    const vista = calcularVistaInicial([SIN_GPS, MEDIO_GPS])

    // El fallo que se evita: promediar nulos como ceros y acabar en (0, 0).
    expect(vista.centro).toEqual(CENTRO_EL_SALVADOR)
    expect(vista.centro).not.toEqual([0, 0])
    expect(vista.zoom).toBe(ZOOM_PAIS)
    expect(vista.limites).toBeNull()
  })
})

describe('calcularVistaInicial · una sola clínica ubicada', () => {
  it('centra en la clínica con zoom de calle y sin encuadre', () => {
    const vista = calcularVistaInicial([SAN_SALVADOR])

    expect(vista.centro).toEqual([13.7053, -89.2182])
    expect(vista.zoom).toBe(ZOOM_CLINICA)
    // Sin límites: un rectángulo de un solo punto haría que Leaflet saltara al
    // zoom máximo.
    expect(vista.limites).toBeNull()
  })

  it('ignora a las clínicas sin coordenadas al centrar', () => {
    const conRelleno = calcularVistaInicial([SIN_GPS, SAN_SALVADOR, MEDIO_GPS])
    const sola = calcularVistaInicial([SAN_SALVADOR])

    expect(conRelleno).toEqual(sola)
  })

  it('trata como un solo punto a varias clínicas en la misma dirección', () => {
    // Dos consultorios en el mismo edificio: el rectángulo tendría área cero.
    const vista = calcularVistaInicial([
      SAN_SALVADOR,
      { ...SAN_SALVADOR, id: 99, name: 'Consultorio 2' },
    ])

    expect(vista.centro).toEqual([13.7053, -89.2182])
    expect(vista.zoom).toBe(ZOOM_CLINICA)
    expect(vista.limites).toBeNull()
  })
})

describe('calcularVistaInicial · varias clínicas ubicadas', () => {
  it('encuadra un rectángulo que contiene a todas', () => {
    const clinicas = [SANTA_ANA, SAN_SALVADOR, SOYAPANGO]
    const vista = calcularVistaInicial(clinicas)

    expect(vista.limites).not.toBeNull()
    const [[latMin, lngMin], [latMax, lngMax]] = vista.limites!

    for (const clinica of clinicas) {
      expect(clinica.lat!).toBeGreaterThanOrEqual(latMin)
      expect(clinica.lat!).toBeLessThanOrEqual(latMax)
      expect(clinica.lng!).toBeGreaterThanOrEqual(lngMin)
      expect(clinica.lng!).toBeLessThanOrEqual(lngMax)
    }

    // Y ajustado: los bordes son las clínicas extremas, no un margen inventado.
    expect(latMin).toBe(13.7053)
    expect(latMax).toBe(13.9942)
    expect(lngMin).toBe(-89.5597)
    expect(lngMax).toBe(-89.1503)
  })

  it('centra en el medio del rectángulo, no en la primera de la lista', () => {
    const vista = calcularVistaInicial([SANTA_ANA, SAN_SALVADOR, SOYAPANGO])

    expect(vista.centro[0]).toBeCloseTo((13.7053 + 13.9942) / 2, 10)
    expect(vista.centro[1]).toBeCloseTo((-89.5597 + -89.1503) / 2, 10)
    expect(estaEnElSalvador(vista.centro)).toBe(true)
  })

  it('no cambia el encuadre por el orden de la lista', () => {
    const enOrden = calcularVistaInicial([SANTA_ANA, SAN_SALVADOR, SOYAPANGO])
    const alReves = calcularVistaInicial([SOYAPANGO, SAN_SALVADOR, SANTA_ANA])

    expect(alReves).toEqual(enOrden)
  })

  it('deja fuera del encuadre a las clínicas sin coordenadas', () => {
    const soloUbicadas = calcularVistaInicial([SANTA_ANA, SOYAPANGO])
    const conHuecos = calcularVistaInicial([SIN_GPS, SANTA_ANA, MEDIO_GPS, SOYAPANGO])

    // Si una sin coordenadas colara un (0, 0), el rectángulo se estiraría
    // desde África y el mapa abriría en el Atlántico.
    expect(conHuecos).toEqual(soloUbicadas)
    expect(conHuecos.limites![0][1]).toBeLessThan(-80)
  })
})
