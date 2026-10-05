'use client'

// ─── /mapa · Clínicas de la red (HU-28, DRS-96) ──────────────────────────────
// «Como paciente o visitante del sitio quiero ver todas las clínicas asociadas
//  ubicadas sobre un mapa para identificar dónde puedo atenderme.»
//
// Página PÚBLICA: vive fuera del grupo `(portal)`, así que no pasa por su
// guarda de sesión, y pide `GET /clinics/publicas`, que el backend sirve sin
// token.
//
// ── Criterio 4: menos de 3 segundos con 50 clínicas ─────────────────────────
// Lo que cuesta aquí no son los 50 marcadores —son 50 <div>, nada— sino tres
// descargas: la lista de clínicas, el código de Leaflet y las teselas. Las tres
// arrancan a la vez en vez de una tras otra:
//   · el mapa se monta de inmediato, sin esperar a la lista, así que el código
//     de Leaflet empieza a bajar mientras la petición está en vuelo;
//   · `preconnect` abre la conexión con el servidor de teselas antes de que
//     Leaflet pida la primera;
//   · la lista se pide una sola vez y el filtro trabaja sobre ella en memoria:
//     cambiar de departamento no vuelve al servidor.

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { preconnect } from 'react-dom'
import { FichaDeClinica } from '@/components/mapa/FichaDeClinica'
import { Icon } from '@/components/ui/Icon'
import { ApiError } from '@/lib/api'
import {
  TODOS_LOS_DEPARTAMENTOS,
  clinicaPublicaDesdeDto,
  departamentosDeLaRed,
  fichaDeClinica,
  filtrarPorDepartamento,
  separarPorUbicacion,
  type ClinicaPublica,
} from '@/lib/mapaDeLaRed'
import { listarClinicasDeLaRed } from '@/services/mapaDeClinicas'

/** De aquí salen las teselas (ver MapaDeLaRed.tsx). */
const SERVIDOR_DE_TESELAS = 'https://tile.openstreetmap.org'

// Leaflet toca `window` al importarse: fuera del prerenderizado en servidor.
// `ssr: false` solo se admite en un componente de cliente, que es lo que es
// este (la página que lo monta es de servidor para poder declarar `metadata`).
const MapaDeLaRed = dynamic(() => import('@/components/mapa/MapaDeLaRed'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Cargando mapa…
    </div>
  ),
})

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

export function VistaDelMapa() {
  preconnect(SERVIDOR_DE_TESELAS)

  const idSelector = useId()
  const contenedorDelMapa = useRef<HTMLElement | null>(null)

  const [clinicas, setClinicas] = useState<ClinicaPublica[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [departamento, setDepartamento] = useState(TODOS_LOS_DEPARTAMENTOS)
  const [eleccion, setEleccion] = useState<{ id: number; vez: number } | null>(null)

  // Sin setState síncrono dentro del efecto (react-hooks/set-state-in-effect):
  // el «cargando» lo marca quien reintenta, en el manejador del botón.
  useEffect(() => {
    let cancelado = false
    listarClinicasDeLaRed()
      .then((dtos) => {
        if (!cancelado) setClinicas(dtos.map(clinicaPublicaDesdeDto))
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setError(
          e instanceof ApiError && e.status !== 0
            ? e.message
            : 'No se pudo cargar el mapa de clínicas. Revisa tu conexión e inténtalo de nuevo.',
        )
      })
    return () => {
      cancelado = true
    }
  }, [intento])

  const opciones = useMemo(() => departamentosDeLaRed(clinicas ?? []), [clinicas])
  const visibles = useMemo(
    () => filtrarPorDepartamento(clinicas ?? [], departamento),
    [clinicas, departamento],
  )
  const { ubicadas, sinUbicacion } = useMemo(() => separarPorUbicacion(visibles), [visibles])

  const nombreDelDepartamento = opciones.find((o) => o.valor === departamento)?.etiqueta ?? null

  const reintentar = () => {
    setError(null)
    setClinicas(null)
    setIntento((n) => n + 1)
  }

  const verEnElMapa = (id: number) => {
    setEleccion((anterior) => ({ id, vez: (anterior?.vez ?? 0) + 1 }))
    // En el teléfono la lista queda debajo del mapa: sin esto, el globo se abre
    // fuera de la pantalla y parece que el botón no hizo nada. `?.` porque
    // jsdom no implementa scrollIntoView.
    contenedorDelMapa.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    // `overflow-x-hidden` es la red de seguridad del criterio 5: si algún hijo
    // se pasa de ancho en un teléfono, se recorta en vez de dar scroll lateral.
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-doc-surface">
      <nav className="flex items-center justify-between gap-3 bg-gradient-to-r from-doc-navy to-doc-navy-light px-4 py-3 shadow-md sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-doc-amber shadow-sm">
            <Icon name="shield" size={16} color="white" />
          </span>
          <span className="truncate font-outfit text-lg font-bold text-white">
            DocRecord <span className="text-doc-amber">Sv</span>
          </span>
        </Link>
        <Link
          href="/login"
          className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-blue-200 transition-colors hover:text-white"
        >
          Iniciar sesión
        </Link>
      </nav>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-outfit text-2xl font-bold text-slate-800 sm:text-3xl">Clínicas de la red</h1>
          <p className="mt-1 text-sm text-slate-600">
            Toca una clínica en el mapa para ver su dirección, teléfono y horario de atención.
          </p>
        </header>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={idSelector} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Departamento
            </label>
            <select
              id={idSelector}
              value={departamento}
              onChange={(e) => {
                setDepartamento(e.target.value)
                setEleccion(null)
              }}
              disabled={clinicas === null}
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-doc-blue focus:outline-none sm:w-72"
            >
              <option value={TODOS_LOS_DEPARTAMENTOS}>
                Todos los departamentos{clinicas ? ` (${clinicas.length})` : ''}
              </option>
              {opciones.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta} ({o.clinicas})
                </option>
              ))}
            </select>
          </div>

          {/* Se anuncia al cambiar el filtro: quien no ve el mapa necesita saber
              cuántas clínicas quedaron. */}
          <p role="status" aria-live="polite" className="text-sm text-slate-600">
            {clinicas === null
              ? error
                ? ''
                : 'Cargando clínicas…'
              : `${plural(visibles.length, 'clínica', 'clínicas')}${
                  nombreDelDepartamento ? ` en ${nombreDelDepartamento}` : ' en la red'
                }`}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={reintentar}
              className="self-start rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 sm:self-auto cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {clinicas !== null && clinicas.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Todavía no hay clínicas activas en la red.
          </p>
        )}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Alto en `svh` y no en `vh`: en el navegador del teléfono `vh`
              cuenta la barra de direcciones aunque esté visible, y el mapa
              quedaba más alto que la pantalla —el dedo que quería bajar la
              página caía siempre sobre el mapa—. Así siempre queda una franja
              de página por donde desplazarse. */}
          <section
            ref={contenedorDelMapa}
            aria-label="Mapa de clínicas"
            className="relative h-[60svh] min-h-[300px] w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:h-[600px]"
          >
            <MapaDeLaRed clinicas={ubicadas} departamento={departamento} eleccion={eleccion} />
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            {ubicadas.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-outfit text-base font-semibold text-slate-800">
                  En el mapa ({ubicadas.length})
                </h2>
                <ul className="mt-2 divide-y divide-slate-100 lg:max-h-[500px] lg:overflow-y-auto">
                  {ubicadas.map((c) => {
                    const ficha = fichaDeClinica(c)
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => verEnElMapa(c.id)}
                          aria-label={`Ver ${c.name} en el mapa`}
                          className="flex w-full min-w-0 items-start gap-2 py-2.5 text-left hover:bg-slate-50 cursor-pointer"
                        >
                          <Icon name="map" size={16} className="mt-0.5 shrink-0 text-doc-amber" />
                          <span className="min-w-0 break-words">
                            <span className="block text-sm font-medium text-slate-800">{c.name}</span>
                            {ficha.lugar && <span className="block text-xs text-slate-500">{ficha.lugar}</span>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {sinUbicacion.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <h2 className="font-outfit text-base font-semibold text-slate-800">
                  Sin ubicación en el mapa ({sinUbicacion.length})
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Estas clínicas atienden, pero todavía no tienen sus coordenadas registradas. Aquí
                  está su dirección para que puedas llegar.
                </p>
                <ul className="mt-3 space-y-3">
                  {sinUbicacion.map((c) => (
                    <li key={c.id} className="rounded-xl bg-white p-3 shadow-xs">
                      <FichaDeClinica clinica={c} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}
