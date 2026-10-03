'use client'

// Detalle de una toma de constantes.
//
// PANTALLA PROPIA Y NO UN MODAL, y la diferencia no es estética: esto es lo que
// el médico lee ANTES de diagnosticar. Con una URL propia el enlace se puede
// compartir con un colega, el botón de volver del navegador funciona, y
// recargar no lo cierra. Un modal se pierde con cualquiera de las tres cosas.
//
// De SOLO LECTURA para todos, también para enfermería. Una constante mal tomada
// no se corrige reescribiéndola: se toma otra vez y las dos quedan en el
// histórico con su hora. Un expediente clínico es el registro de lo que pasó,
// no el estado actual de un formulario —por eso el backend no expone PUT ni
// DELETE aquí, y esta pantalla no inventa botones que no existen—.
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ApiError } from '@/lib/api'
import { formatearFechaHora } from '@/services/consultas'
import {
  nombreDeEnfermera,
  obtenerToma,
  tensionArterial,
  type SignosVitalesDto,
} from '@/services/signosVitales'

/** Las medidas, con su rótulo y su unidad, en el orden en que se toman. */
const MEDIDAS: [string, (t: SignosVitalesDto) => number | string | null, string][] = [
  ['Presión arterial', (t) => tensionArterial(t), 'mmHg'],
  ['Pulso', (t) => t.pulsoLpm, 'lpm'],
  ['Temperatura', (t) => t.temperaturaC, '°C'],
  ['Saturación O₂', (t) => t.saturacionPct, '%'],
  ['Frecuencia respiratoria', (t) => t.frecuenciaRespRpm, 'rpm'],
  ['Peso', (t) => t.pesoKg, 'kg'],
  ['Talla', (t) => t.estaturaCm, 'cm'],
]

export default function DetalleDeTomaPage() {
  const params = useParams()
  const idTexto = Array.isArray(params?.signosVitalesId)
    ? params.signosVitalesId[0]
    : (params?.signosVitalesId as string)

  const [toma, setToma] = useState<SignosVitalesDto | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noEncontrada, setNoEncontrada] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    setNoEncontrada(false)
    try {
      setToma(await obtenerToma(Number(idTexto)))
    } catch (err) {
      // Un 404 no es un fallo del sistema: es que esa toma no existe, y se
      // dice distinto de «no se pudo cargar», que sí se puede reintentar.
      if (err instanceof ApiError && err.status === 404) {
        setNoEncontrada(true)
      } else {
        setError(err instanceof Error && err.message ? err.message : 'No se pudo cargar la toma.')
      }
    } finally {
      setCargando(false)
    }
  }, [idTexto])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver (portal)/consultas/page.tsx
    void cargar()
  }, [cargar])

  const volver = (
    <Link
      href="/enfermeria"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors mb-4"
    >
      <Icon name="chevron_right" size={16} className="rotate-180" /> Volver a signos vitales
    </Link>
  )

  if (cargando) {
    return (
      <div>
        {volver}
        <p className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando la toma…
        </p>
      </div>
    )
  }

  if (noEncontrada) {
    return (
      <div>
        {volver}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-12 text-center">
          <h1 className="text-lg font-bold text-slate-800 font-outfit">
            Esa toma de constantes no existe
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Puede que se haya escrito mal la dirección.
          </p>
        </div>
      </div>
    )
  }

  if (error || !toma) {
    return (
      <div>
        {volver}
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="text-sm text-red-800">{error ?? 'No se pudo cargar la toma.'}</p>
          <button
            onClick={() => {
              setCargando(true)
              void cargar()
            }}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {volver}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">
          {toma.paciente.nombres} {toma.paciente.apellidos}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Toma de constantes del {formatearFechaHora(toma.tomadoEn)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-800 font-outfit mb-4">Constantes</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {MEDIDAS.map(([etiqueta, leer, unidad]) => {
                const valor = leer(toma)
                return (
                  <div key={etiqueta} className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-slate-400">
                      {etiqueta}
                    </p>
                    {/* Una medida ausente se dice con todas sus letras y no con
                        un guion, y NUNCA como 0: la diferencia entre «no se
                        midió» y una saturación baja es la que decide un
                        tratamiento. */}
                    {valor === null ? (
                      <p className="text-sm italic text-slate-400 mt-0.5">no se tomó</p>
                    ) : (
                      <p className="text-xl font-bold text-slate-800 font-outfit mt-0.5">
                        {valor}{' '}
                        <span className="text-sm font-normal text-slate-500">{unidad}</span>
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-800 font-outfit mb-2">
              Observaciones de enfermería
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {toma.observaciones ?? (
                <span className="italic text-slate-400">Sin observaciones.</span>
              )}
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-800 font-outfit mb-4">Registro</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-slate-400">Expediente</dt>
                <dd className="font-mono font-semibold text-slate-800">
                  <Link
                    href={`/pacientes/${toma.paciente.personaId}`}
                    className="hover:text-doc-blue transition-colors"
                  >
                    {toma.paciente.expediente}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-slate-400">
                  Tomado por
                </dt>
                {/* Quién y cuándo, siempre: una constante sin responsable no le
                    sirve al médico para decidir nada. */}
                <dd className="font-semibold text-slate-800">{nombreDeEnfermera(toma)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-slate-400">Fecha</dt>
                <dd className="text-slate-700">{formatearFechaHora(toma.tomadoEn)}</dd>
              </div>
              {toma.consultaId !== null && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-slate-400">Consulta</dt>
                  <dd className="text-slate-700">#{toma.consultaId}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Se dice por qué no hay nada que editar, en vez de dejar la pantalla
              sin acciones y que parezca que faltan. */}
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
            Una toma no se edita ni se borra. Si algo se midió mal, se toma otra vez: las dos
            quedan en el histórico con su hora, porque el expediente registra lo que pasó.
          </p>
        </aside>
      </div>
    </div>
  )
}
