// ─── Encuadre inicial del mapa de clínicas ───────────────────────────────────
// Se separa del componente a propósito: el mapa (Leaflet) necesita `window` y
// solo se puede montar en el navegador, pero decidir DÓNDE mira la cámara es
// aritmética pura sobre la lista de clínicas y se puede probar sin DOM.

import type { Clinica } from '@/types'

/**
 * Clínica que sí tiene ubicación. El backend admite `latitud`/`longitud`
 * nulas —una sucursal se registra por su nombre antes de que alguien vaya a
 * tomar el GPS—, así que el mapa solo sabe dibujar este subconjunto.
 */
export type ClinicaUbicada = Clinica & { lat: number; lng: number }

/**
 * Una sola coordenada no ubica nada: basta con que falte una para que la
 * clínica no se pueda dibujar. Misma regla que `formatearCoordenadas`.
 */
export function tieneUbicacion(clinica: Clinica): clinica is ClinicaUbicada {
  return clinica.lat !== null && clinica.lng !== null
}

/** Centro aproximado del territorio salvadoreño. */
export const CENTRO_EL_SALVADOR: [number, number] = [13.7942, -88.8965]

/** Zoom que deja el país entero a la vista. */
export const ZOOM_PAIS = 9

/** Zoom de calle: se ve la manzana donde está la clínica. */
export const ZOOM_CLINICA = 15

/**
 * Dos coordenadas separadas por menos de esto son, a efectos del mapa, el
 * mismo punto: 1e-6 grados son unos 11 cm.
 */
const EPSILON_GRADOS = 1e-6

export interface VistaMapa {
  /** Punto al que mira la cámara. */
  centro: [number, number]
  /**
   * Zoom inicial. Cuando `limites` no es nulo, Leaflet calcula el zoom real a
   * partir del rectángulo y del tamaño del contenedor; este valor queda como
   * respaldo (y es el que se usa si el encuadre no se puede aplicar).
   */
  zoom: number
  /**
   * Rectángulo `[[latMin, lngMin], [latMax, lngMax]]` que contiene a todas las
   * clínicas ubicadas, o `null` cuando no hay nada que encuadrar (ninguna
   * clínica ubicada, o todas en el mismo punto). Un rectángulo de área cero
   * haría que `fitBounds` saltara al zoom máximo, así que ese caso se resuelve
   * con centro y zoom fijos en lugar de con límites.
   */
  limites: [[number, number], [number, number]] | null
}

/**
 * Decide el encuadre inicial del mapa a partir de las clínicas del usuario.
 *
 * Las clínicas sin coordenadas no cuentan: si contaran como (0, 0) el mapa
 * abriría en medio del golfo de Guinea. Y si NINGUNA tiene coordenadas, en vez
 * de quedarse en blanco o en el océano, el mapa abre sobre El Salvador, que es
 * donde el usuario va a buscar sus sedes.
 */
export function calcularVistaInicial(clinicas: readonly Clinica[]): VistaMapa {
  const ubicadas = clinicas.filter(tieneUbicacion)

  if (ubicadas.length === 0) {
    return { centro: CENTRO_EL_SALVADOR, zoom: ZOOM_PAIS, limites: null }
  }

  const latitudes = ubicadas.map((c) => c.lat)
  const longitudes = ubicadas.map((c) => c.lng)
  const latMin = Math.min(...latitudes)
  const latMax = Math.max(...latitudes)
  const lngMin = Math.min(...longitudes)
  const lngMax = Math.max(...longitudes)

  const centro: [number, number] = [(latMin + latMax) / 2, (lngMin + lngMax) / 2]

  const esUnSoloPunto =
    latMax - latMin < EPSILON_GRADOS && lngMax - lngMin < EPSILON_GRADOS
  if (esUnSoloPunto) {
    return { centro, zoom: ZOOM_CLINICA, limites: null }
  }

  return {
    centro,
    zoom: ZOOM_PAIS,
    limites: [
      [latMin, lngMin],
      [latMax, lngMax],
    ],
  }
}
