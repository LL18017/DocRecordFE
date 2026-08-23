'use client'

// ─── Mapa real de clínicas ───────────────────────────────────────────────────
// Leaflet + teselas de OpenStreetMap. Se eligió así por la restricción que
// manda sobre todo: sin clave de API ni tarjeta. Google Maps y Mapbox exigen
// una clave que acabaría en un repositorio público (o el mapa se apagaría el
// día de la demostración); OSM no pide ninguna, solo la atribución que su
// licencia exige y que se declara en el `TileLayer` de abajo.
//
// ESTE MÓDULO SOLO PUEDE EJECUTARSE EN EL NAVEGADOR: al importar `leaflet` se
// toca `document`/`window`, y en el App Router las páginas se prerenderizan en
// Node aunque lleven 'use client'. Por eso la página lo carga con
// `next/dynamic` y `ssr: false`; no lo importes de forma estática.

import 'leaflet/dist/leaflet.css'

import { divIcon } from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  type MapContainerProps,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { Icon } from '@/components/ui/Icon'
import {
  ZOOM_CLINICA,
  calcularVistaInicial,
  tieneUbicacion,
} from '@/lib/mapaClinicas'
import type { Clinica } from '@/types'

/** Teselas de OpenStreetMap: sin cuenta, sin clave, sin tarjeta. */
const TESELAS_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/**
 * Atribución exigida por la licencia de OpenStreetMap (ODbL). No es
 * decorativa: quitarla incumple los términos de uso de las teselas.
 */
const ATRIBUCION_OSM =
  '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

/** Hasta donde llega el detalle de las teselas de OSM. */
const ZOOM_MAXIMO = 19

// Identidad de la aplicación (ver globals.css). El verde es el mismo que la
// lista usa para la clínica activa.
const AZUL_MARINO = '#1E3A5F'
const AMBAR = '#E8A838'
const VERDE_ACTIVA = '#059669'

/**
 * Los iconos por defecto de Leaflet apuntan a `marker-icon.png` por una ruta
 * relativa que el empaquetador no reescribe: con Turbopack los marcadores
 * salen invisibles. En vez de parchear esas rutas se dibuja la chinche con
 * HTML (`divIcon`), que además no descarga ninguna imagen y permite usar los
 * colores de la aplicación.
 *
 * `className: ''` es intencionado: el valor por defecto (`leaflet-div-icon`)
 * pinta un recuadro blanco con borde alrededor de la chinche.
 */
function crearChinche(color: string, destacada: boolean) {
  const ancho = destacada ? 34 : 26
  const alto = Math.round(ancho * 1.32)
  return divIcon({
    className: '',
    html: `<svg width="${ancho}" height="${alto}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 3px rgba(15,36,68,.45))">
        <path d="M12 .8C6.04.8 1.2 5.64 1.2 11.6c0 7.9 9.13 18.3 9.52 18.74a1.72 1.72 0 0 0 2.56 0c.39-.44 9.52-10.84 9.52-18.74C22.8 5.64 17.96.8 12 .8z" fill="${color}" stroke="#ffffff" stroke-width="1.6"/>
        <circle cx="12" cy="11.6" r="4.2" fill="#ffffff"/>
      </svg>`,
    iconSize: [ancho, alto],
    // La punta de la gota es la que señala la coordenada, no el centro.
    iconAnchor: [ancho / 2, alto],
    popupAnchor: [0, -alto + 2],
  })
}

// Se crean una sola vez: `divIcon` devuelve un objeto nuevo en cada llamada y
// Leaflet reconstruiría el marcador entero en cada render.
const CHINCHE_ACTIVA = crearChinche(VERDE_ACTIVA, true)
const CHINCHE_SELECCIONADA = crearChinche(AZUL_MARINO, true)
const CHINCHE_NORMAL = crearChinche(AMBAR, false)

interface MapaClinicasProps {
  /** Lista completa; las que no tienen coordenadas simplemente no se dibujan. */
  clinicas: Clinica[]
  /** Clínica enfocada en la ficha de la derecha. */
  seleccionadaId: number | null
  /** Clínica en la que se está operando (`activeClinic`). */
  activaId: number | null
  onSeleccionar: (clinica: Clinica) => void
  onTrabajarAqui: (clinica: Clinica) => void
}

export default function MapaClinicas({
  clinicas,
  seleccionadaId,
  activaId,
  onSeleccionar,
  onTrabajarAqui,
}: MapaClinicasProps) {
  const ubicadas = useMemo(() => clinicas.filter(tieneUbicacion), [clinicas])

  // El encuadre inicial se calcula una sola vez, al montar: recalcularlo en
  // cada render devolvería la cámara a su sitio en cuanto el usuario arrastra.
  // MapContainer, de hecho, solo lee estas props al crear el mapa.
  //
  // O centro+zoom, O límites, nunca ambos: `MapContainer` comprueba primero
  // `center`/`zoom` y, si están, ignora `bounds` por completo. Pasar los tres
  // dejaría el encuadre de varias sedes sin efecto.
  const [encuadre] = useState<MapContainerProps>(() => {
    const vista = calcularVistaInicial(clinicas)
    return vista.limites
      ? {
          bounds: vista.limites,
          // Margen para que las chinches de los extremos no queden pegadas al
          // borde, y tope de zoom por si todas las sedes están en la misma calle.
          boundsOptions: { padding: [48, 48], maxZoom: ZOOM_CLINICA },
        }
      : { center: vista.centro, zoom: vista.zoom }
  })

  const seleccionada = ubicadas.find((c) => c.id === seleccionadaId) ?? null

  return (
    <MapContainer
      {...encuadre}
      scrollWheelZoom
      className="absolute inset-0 h-full w-full"
      // El fondo se ve un instante, mientras bajan las teselas.
      style={{ background: '#e8eef4' }}
    >
      <TileLayer
        url={TESELAS_OSM}
        attribution={ATRIBUCION_OSM}
        maxZoom={ZOOM_MAXIMO}
      />

      <EnfocarSeleccionada lat={seleccionada?.lat ?? null} lng={seleccionada?.lng ?? null} />

      {ubicadas.map((clinica) => {
        const esActiva = clinica.id === activaId
        const esSeleccionada = clinica.id === seleccionadaId
        return (
          <Marker
            key={clinica.id}
            position={[clinica.lat, clinica.lng]}
            icon={
              esActiva ? CHINCHE_ACTIVA : esSeleccionada ? CHINCHE_SELECCIONADA : CHINCHE_NORMAL
            }
            // La seleccionada por encima: con dos clínicas cercanas —Soyapango
            // y San Salvador están a 7 km— las chinches se solapan al alejar.
            zIndexOffset={esSeleccionada || esActiva ? 1000 : 0}
            title={clinica.name}
            eventHandlers={{ click: () => onSeleccionar(clinica) }}
          >
            <Popup>
              <span className="block font-semibold text-slate-800">{clinica.name}</span>
              <span className="block font-mono text-[11px] text-slate-400">
                {clinica.lat.toFixed(4)}, {clinica.lng.toFixed(4)}
              </span>
              <button
                type="button"
                onClick={() => onTrabajarAqui(clinica)}
                className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all cursor-pointer ${
                  esActiva ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-doc-blue hover:opacity-90'
                }`}
              >
                <Icon name="clinicas" size={13} color="white" />
                {esActiva ? 'Clínica activa' : 'Trabajar aquí'}
              </button>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}

/**
 * Lleva la cámara a la clínica que se acaba de elegir en la lista.
 *
 * Vive dentro del `MapContainer` porque `useMap()` necesita su contexto.
 *
 * No vuela hacia la clínica que ya estaba seleccionada al montar: de ese
 * encuadre se ocupa `calcularVistaInicial`, que enseña todas las sedes a la
 * vez, y volar a la primera de la lista lo desharía antes de que el usuario lo
 * viera. Se lleva la cuenta del último destino aplicado en lugar de «saltarse
 * el primer render» porque el modo estricto de React monta, desmonta y vuelve
 * a montar en desarrollo: con un simple interruptor de primera vez, la segunda
 * ejecución del efecto ya lo encontraba apagado y el vuelo salía igual —el
 * mapa abría pegado a una sola clínica—. Comparando destinos, repetir el
 * efecto no hace nada.
 *
 * Recibe números y no la clínica entera para que un objeto nuevo con las
 * mismas coordenadas no dispare otro vuelo.
 */
function EnfocarSeleccionada({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap()
  const ultimoDestino = useRef(comoDestino(lat, lng))

  useEffect(() => {
    // Una clínica sin coordenadas no mueve la cámara: no hay a dónde ir, y la
    // ficha de la derecha ya avisa de que no tiene ubicación registrada.
    if (lat === null || lng === null) return
    const destino = comoDestino(lat, lng)
    if (destino === ultimoDestino.current) return
    ultimoDestino.current = destino
    // `max`: si el usuario ya estaba mirando de cerca, acercar la nueva sede
    // al mismo detalle en vez de alejarse.
    map.flyTo([lat, lng], Math.max(map.getZoom(), ZOOM_CLINICA), { duration: 0.8 })
  }, [lat, lng, map])

  return null
}

/** Identidad del punto al que mira la cámara, o `null` si no hay ninguno. */
function comoDestino(lat: number | null, lng: number | null): string | null {
  return lat === null || lng === null ? null : `${lat},${lng}`
}
