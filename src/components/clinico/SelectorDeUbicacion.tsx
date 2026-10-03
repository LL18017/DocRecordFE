'use client'

// HU-26 (DRS-28), criterio 3 · marcar la clínica sobre el mapa.
//
// «Dado el formulario abierto, cuando marco un punto sobre el mapa, entonces la
//  latitud y la longitud se llenan solas.»
//
// La nota de diseño de la historia explica para qué sirve esto de verdad: evitar
// «el error clásico de invertir latitud y longitud, que coloca la clínica en
// medio del océano Índico sin que nadie lo note hasta la demostración».
//
// Tecleando dos números, ese error es invisible: los dos valores son plausibles
// y nada avisa. Marcando sobre el mapa, es imposible cometerlo —y si los números
// que ya estaban eran los equivocados, el marcador aparece fuera de vista y se
// ve al instante.

import React, { useEffect, useMemo, useRef } from 'react'
import type { Map as MapaLeaflet, Marker as MarcadorLeaflet } from 'leaflet'

/** El Salvador entero, para encuadrar el mapa cuando aún no hay punto. */
const CENTRO_EL_SALVADOR: [number, number] = [13.7942, -88.8965]
const ZOOM_PAIS = 8
const ZOOM_PUNTO = 14

/** El mismo rango que valida el backend (migración V16). */
export const LIMITES = {
  latMin: 13.0,
  latMax: 14.5,
  lngMin: -90.2,
  lngMax: -87.6,
}

export function dentroDeElSalvador(lat: number, lng: number): boolean {
  return (
    lat >= LIMITES.latMin && lat <= LIMITES.latMax &&
    lng >= LIMITES.lngMin && lng <= LIMITES.lngMax
  )
}

export interface SelectorDeUbicacionProps {
  latitud: number | null
  longitud: number | null
  onCambiar: (latitud: number, longitud: number) => void
}

export function SelectorDeUbicacion({ latitud, longitud, onCambiar }: SelectorDeUbicacionProps) {
  const contenedor = useRef<HTMLDivElement | null>(null)
  const mapa = useRef<MapaLeaflet | null>(null)
  const marcador = useRef<MarcadorLeaflet | null>(null)
  const alCambiar = useRef(onCambiar)

  useEffect(() => {
    alCambiar.current = onCambiar
  }, [onCambiar])

  const hayPunto = latitud !== null && longitud !== null
  const fueraDelPais = useMemo(
    () => (hayPunto ? !dentroDeElSalvador(latitud!, longitud!) : false),
    [hayPunto, latitud, longitud],
  )

  useEffect(() => {
    if (!contenedor.current || mapa.current) return

    let cancelado = false

    // Leaflet se carga bajo demanda y no con un import estático: toca `window`
    // al evaluarse, así que un import normal rompería el prerenderizado de
    // `next build`. Además son ~150 KB que sólo hacen falta en esta pantalla.
    void import('leaflet').then((L) => {
      if (cancelado || !contenedor.current || mapa.current) return

      const instancia = L.map(contenedor.current, {
        center: hayPunto ? [latitud!, longitud!] : CENTRO_EL_SALVADOR,
        zoom: hayPunto ? ZOOM_PUNTO : ZOOM_PAIS,
        // El teclado también mueve el mapa: marcar una clínica no puede
        // depender de tener ratón.
        keyboard: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(instancia)

      const icono = L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:9999px;background:#1E3A8A;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })

      if (hayPunto) {
        marcador.current = L.marker([latitud!, longitud!], { icon: icono, draggable: true })
          .addTo(instancia)
        marcador.current.on('dragend', () => {
          const p = marcador.current!.getLatLng()
          alCambiar.current(redondear(p.lat), redondear(p.lng))
        })
      }

      instancia.on('click', (evento) => {
        const { lat, lng } = evento.latlng
        if (!marcador.current) {
          marcador.current = L.marker([lat, lng], { icon: icono, draggable: true }).addTo(instancia)
          marcador.current.on('dragend', () => {
            const p = marcador.current!.getLatLng()
            alCambiar.current(redondear(p.lat), redondear(p.lng))
          })
        } else {
          marcador.current.setLatLng([lat, lng])
        }
        alCambiar.current(redondear(lat), redondear(lng))
      })

      mapa.current = instancia
    })

    return () => {
      cancelado = true
      mapa.current?.remove()
      mapa.current = null
      marcador.current = null
    }
    // Sólo al montar: el mapa se crea una vez y después se actualiza por su API,
    // no volviéndolo a construir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cuando las coordenadas cambian desde los campos de texto, el marcador las
  // sigue. Sin esto, teclear un número movería el formulario pero no el mapa, y
  // los dos dirían cosas distintas al mismo tiempo.
  useEffect(() => {
    if (!mapa.current || !hayPunto) return
    const punto: [number, number] = [latitud!, longitud!]
    if (marcador.current) marcador.current.setLatLng(punto)
    mapa.current.setView(punto, Math.max(mapa.current.getZoom(), ZOOM_PUNTO))
  }, [latitud, longitud, hayPunto])

  return (
    <div>
      <div
        ref={contenedor}
        role="application"
        aria-label="Mapa para marcar la ubicación de la clínica"
        className="h-56 w-full overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-100"
      />

      {fueraDelPais ? (
        // El caso que la historia quiere atrapar. Se nombra la sospecha en vez
        // de decir sólo «fuera de rango»: invertir los dos valores es de largo
        // la causa más frecuente, y decirlo ahorra el rato de mirar los números
        // sin ver qué tienen de malo.
        <p role="alert" className="mt-2 text-xs text-red-600">
          Ese punto queda fuera de El Salvador. ¿Se invirtieron la latitud y la longitud?
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          {hayPunto
            ? 'Arrastra el punto o haz clic en otro lugar para corregirlo.'
            : 'Haz clic sobre el mapa para marcar dónde está la clínica.'}
        </p>
      )}
    </div>
  )
}

/**
 * Cuatro decimales: unos 11 metros.
 *
 * Leaflet devuelve quince, y guardar esa precisión para la puerta de una
 * clínica finge una exactitud que nadie midió.
 */
function redondear(valor: number): number {
  return Number(valor.toFixed(4))
}
