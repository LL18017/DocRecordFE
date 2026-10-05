'use client'

// ─── Mapa público de la red de clínicas (HU-28, DRS-96) ──────────────────────
// Mismo Leaflet + OpenStreetMap que el mapa del portal (ver MapaClinicas.tsx
// para el porqué: sin clave de API ni tarjeta).
//
// ESTE MÓDULO SOLO PUEDE EJECUTARSE EN EL NAVEGADOR: `leaflet` toca `window` al
// importarse. La página lo carga con `next/dynamic` y `ssr: false`; no lo
// importes de forma estática.
//
// Criterio 5, el teléfono: Leaflet ya trae pellizcar para acercar y arrastrar
// con un dedo, y `leaflet.css` le pone `touch-action: none` al contenedor para
// que esos gestos los reciba el mapa y no el navegador —sin eso, pellizcar
// ampliaría la página entera y la rompería—. Aquí solo se añaden los botones de
// zoom (no todo el mundo pellizca) y un límite para no perderse en el océano.

import 'leaflet/dist/leaflet.css'

import type { LatLngBoundsExpression, Marker as MarcadorLeaflet } from 'leaflet'
import { type RefObject, useEffect, useRef } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { FichaDeClinica } from '@/components/mapa/FichaDeClinica'
import { crearChinche } from '@/components/mapa/MapaClinicas'
import { LIMITES } from '@/components/clinico/SelectorDeUbicacion'
import { calcularVistaInicial } from '@/lib/mapaClinicas'
import type { ClinicaPublicaUbicada } from '@/lib/mapaDeLaRed'

const TESELAS_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Exigida por la licencia ODbL de OpenStreetMap; no es decorativa. */
const ATRIBUCION_OSM =
  '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

/**
 * El Salvador entero (criterio 1: «centrado en El Salvador»).
 *
 * Se encuadra con un rectángulo y no con centro + zoom fijo porque el zoom que
 * deja ver el país depende del ancho de la pantalla: el 9 que le sirve a un
 * monitor deja fuera Ahuachapán y La Unión en un teléfono. Con límites, Leaflet
 * calcula el zoom para el contenedor que de verdad tiene. Es el mismo rango que
 * valida el backend (V16), así que ninguna clínica cae fuera.
 */
export const EL_SALVADOR: [[number, number], [number, number]] = [
  [LIMITES.latMin, LIMITES.lngMin],
  [LIMITES.latMax, LIMITES.lngMax],
]

/**
 * Hasta dónde se puede arrastrar: el país con un margen. Sin tope, un dedo
 * nervioso en el teléfono deja el mapa en mitad del Pacífico y no hay forma
 * evidente de volver.
 */
const LIMITE_DE_ARRASTRE: LatLngBoundsExpression = [
  [LIMITES.latMin - 1.5, LIMITES.lngMin - 2],
  [LIMITES.latMax + 1.5, LIMITES.lngMax + 2],
]

const ZOOM_MINIMO = 7
const ZOOM_MAXIMO = 19
/** Al elegir una clínica de la lista: se ve la calle. */
const ZOOM_AL_ELEGIR = 15

const CHINCHE = crearChinche('#E8A838', false)
const CHINCHE_ELEGIDA = crearChinche('#1E3A5F', true)

export interface MapaDeLaRedProps {
  /** Solo las que tienen coordenadas; las demás las lista la página aparte. */
  clinicas: ClinicaPublicaUbicada[]
  /**
   * Cambia cuando cambia el filtro. Se usa para reencuadrar: al elegir un
   * departamento el mapa va a sus clínicas, y al volver a «Todos», al país.
   */
  departamento: string
  /**
   * Clínica elegida desde la lista: el mapa va a ella y abre su globo.
   *
   * Lleva un contador (`vez`) además del id para que elegir OTRA VEZ la misma
   * clínica —después de cerrar su globo o de alejarse arrastrando— vuelva a
   * llevar el mapa hasta ella. Con el id a secas, el segundo clic no cambiaría
   * nada y parecería que el botón no funciona.
   */
  eleccion: { id: number; vez: number } | null
}

export default function MapaDeLaRed({ clinicas, departamento, eleccion }: MapaDeLaRedProps) {
  const elegidaId = eleccion?.id ?? null
  // Un marcador por clínica, para poder abrir su globo desde la lista.
  const marcadores = useRef(new Map<number, MarcadorLeaflet>())

  return (
    <MapContainer
      bounds={EL_SALVADOR}
      boundsOptions={{ padding: [12, 12] }}
      minZoom={ZOOM_MINIMO}
      maxBounds={LIMITE_DE_ARRASTRE}
      maxBoundsViscosity={0.8}
      // La rueda del ratón no hace zoom: la página sigue debajo del mapa, y
      // un mapa que se traga la rueda atrapa a quien solo quería bajar. Se
      // acerca con los botones, con doble clic o pellizcando.
      scrollWheelZoom={false}
      className="h-full w-full"
      style={{ background: '#e8eef4' }}
    >
      <TileLayer url={TESELAS_OSM} attribution={ATRIBUCION_OSM} maxZoom={ZOOM_MAXIMO} />

      <Reencuadrar clinicas={clinicas} departamento={departamento} />
      <IrALaElegida clinicas={clinicas} elegidaId={elegidaId} marcadores={marcadores} vez={eleccion?.vez ?? 0} />

      {clinicas.map((clinica) => (
        <Marker
          key={clinica.id}
          position={[clinica.lat, clinica.lng]}
          icon={clinica.id === elegidaId ? CHINCHE_ELEGIDA : CHINCHE}
          zIndexOffset={clinica.id === elegidaId ? 1000 : 0}
          title={clinica.name}
          alt={clinica.name}
          ref={(marcador) => {
            if (marcador) marcadores.current.set(clinica.id, marcador)
            else marcadores.current.delete(clinica.id)
          }}
        >
          {/* 220 px de contenido: con el marco del globo (~40 px) cabe en el
              mapa de un teléfono de 320 px, que tras los márgenes de la página
              mide 288. Con 260 el globo tocaba el borde y quedaba debajo de los
              botones de zoom. El margen izquierdo de `autoPan` es mayor por esos
              mismos botones: el mapa se desplaza para no tapar el nombre. */}
          <Popup
            maxWidth={220}
            minWidth={160}
            autoPanPaddingTopLeft={[52, 16]}
            autoPanPaddingBottomRight={[16, 16]}
          >
            <FichaDeClinica clinica={clinica} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

/**
 * Reencuadra cuando cambia el filtro.
 *
 * Con «Todos» vuelve al país entero aunque las sedes estén todas en el
 * occidente: el criterio pide el mapa centrado en El Salvador, y encuadrar solo
 * las sedes lo haría parecer una red regional. Con un departamento elegido sí
 * va a sus clínicas, que es para lo que se filtra.
 *
 * Se recuerda el último encuadre aplicado en vez de «saltarse el primer render»
 * por el modo estricto de React (ver EnfocarSeleccionada en MapaClinicas.tsx).
 */
function Reencuadrar({
  clinicas,
  departamento,
}: {
  clinicas: ClinicaPublicaUbicada[]
  departamento: string
}) {
  const map = useMap()
  const ultimo = useRef<string | null>(null)
  const huella = `${departamento}|${clinicas.map((c) => c.id).join(',')}`

  useEffect(() => {
    const anterior = ultimo.current
    ultimo.current = huella
    // Mismo filtro y mismas clínicas: nada que mover (incluye la segunda
    // ejecución del modo estricto).
    if (anterior === huella) return
    // Al montar sin filtro, el país ya lo encuadró MapContainer con `bounds`.
    if (anterior === null && !departamento) return

    if (!departamento || clinicas.length === 0) {
      map.fitBounds(EL_SALVADOR, { padding: [12, 12] })
      return
    }
    const vista = calcularVistaInicial(clinicas)
    if (vista.limites) {
      map.fitBounds(vista.limites, { padding: [48, 48], maxZoom: ZOOM_AL_ELEGIR })
    } else {
      map.setView(vista.centro, vista.zoom)
    }
  }, [huella, departamento, clinicas, map])

  return null
}

/** Lleva el mapa a la clínica elegida en la lista y abre su globo. */
function IrALaElegida({
  clinicas,
  elegidaId,
  vez,
  marcadores,
}: {
  clinicas: ClinicaPublicaUbicada[]
  elegidaId: number | null
  vez: number
  marcadores: RefObject<Map<number, MarcadorLeaflet>>
}) {
  const map = useMap()
  const elegida = clinicas.find((c) => c.id === elegidaId) ?? null
  const lat = elegida?.lat ?? null
  const lng = elegida?.lng ?? null

  useEffect(() => {
    if (elegidaId === null || lat === null || lng === null) return
    map.setView([lat, lng], Math.max(map.getZoom(), ZOOM_AL_ELEGIR))
    marcadores.current.get(elegidaId)?.openPopup()
  }, [elegidaId, vez, lat, lng, map, marcadores])

  return null
}
