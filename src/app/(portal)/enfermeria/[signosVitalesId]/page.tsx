'use client'

// Detalle de una toma de constantes.
//
// PANTALLA PROPIA Y NO UN MODAL, y la diferencia no es estética: esto es lo que
// el médico lee ANTES de diagnosticar. Con una URL propia el enlace se puede
// compartir con un colega, el botón de volver del navegador funciona, y
// recargar no lo cierra. Un modal se pierde con cualquiera de las tres cosas.
//
// No se edita ni se borra, para nadie. Una constante mal tomada no se corrige
// reescribiéndola: se ANULA dejando el motivo (HU-16, criterio 4) y se toma otra
// vez; las dos quedan en el histórico con su hora. Un expediente clínico es el
// registro de lo que pasó, no el estado actual de un formulario —por eso el
// backend no expone PUT ni DELETE aquí, solo la anulación—.
//
// El botón «Anular toma» lo ve cualquier ENFERMERA con la toma activa, pero el
// servidor solo se lo acepta a la que la registró: la sesión del cliente no trae
// el id de persona con el que comparar, así que el 403 de las demás se muestra
// dentro del propio diálogo, con el motivo que da el servidor.
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ImcDeLaToma } from '@/components/clinico/ImcDeLaToma'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useAppContext } from '@/context/AppContext'
import { ApiError } from '@/lib/api'
import {
  rangoNormalComoTexto,
  valoresFueraDeRango,
  type ClaveDeRango,
} from '@/lib/rangosVitales'
import { formatearFechaHora } from '@/services/consultas'
import {
  anularToma,
  estaAnulada,
  nombreDeEnfermera,
  obtenerToma,
  tensionArterial,
  type SignosVitalesDto,
} from '@/services/signosVitales'

/**
 * Las medidas, con su rótulo y su unidad, en el orden en que se toman. La
 * última columna son las claves que, si salen del rango normal, marcan la
 * celda: peso y talla no llevan ninguna porque no tienen rango normal (el peso
 * se juzga por el IMC, que va aparte).
 */
const MEDIDAS: [
  string,
  (t: SignosVitalesDto) => number | string | null,
  string,
  ClaveDeRango[],
][] = [
  ['Presión arterial', (t) => tensionArterial(t), 'mmHg', ['presionSistolica', 'presionDiastolica']],
  ['Pulso', (t) => t.pulsoLpm, 'lpm', ['pulsoLpm']],
  ['Temperatura', (t) => t.temperaturaC, '°C', ['temperaturaC']],
  ['Saturación O₂', (t) => t.saturacionPct, '%', ['saturacionPct']],
  ['Frecuencia respiratoria', (t) => t.frecuenciaRespRpm, 'rpm', ['frecuenciaRespRpm']],
  ['Peso', (t) => t.pesoKg, 'kg', []],
  ['Talla', (t) => t.estaturaCm, 'cm', []],
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

  // Anulación (HU-16, criterio 4). Solo enfermería: espeja el hasRole('ENFERMERA')
  // del backend. Sin sesión legible se asume que NO puede.
  const { user } = useAppContext()
  const puedeAnular = user ? user.roles.includes('enfermera') : false
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardandoAnulacion, setGuardandoAnulacion] = useState(false)
  const [errorAlAnular, setErrorAlAnular] = useState<string | null>(null)

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

  const confirmarAnulacion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!toma || motivo.trim() === '' || guardandoAnulacion) return
    setGuardandoAnulacion(true)
    setErrorAlAnular(null)
    try {
      // La pantalla cambia solo cuando el servidor confirmó, nunca antes: una
      // anulación optimista que el servidor rechazó (403, 409) dejaría en
      // pantalla una toma anulada que en el expediente sigue vigente.
      setToma(await anularToma(toma.signosVitalesId, motivo.trim()))
      setAnulando(false)
      setMotivo('')
    } catch (err) {
      // El error se queda DENTRO del diálogo, con el motivo escrito intacto.
      setErrorAlAnular(
        err instanceof Error && err.message ? err.message : 'No se pudo anular la toma.',
      )
    } finally {
      setGuardandoAnulacion(false)
    }
  }

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

  const anulada = estaAnulada(toma)
  // Una toma anulada no se evalúa: sus valores ya no valen, y pintarlos de rojo
  // alarmaría por una medida que enfermería declaró errónea.
  const fuera = anulada ? new Set<ClaveDeRango>() : valoresFueraDeRango(toma)

  return (
    <div>
      {volver}

      {anulada && (
        <div
          role="status"
          className="mb-4 rounded-2xl border border-slate-300 bg-slate-100 px-5 py-4"
        >
          <p className="text-sm font-bold text-slate-700">
            Toma ANULADA: estos valores no cuentan como una medición válida.
          </p>
          <dl className="mt-2 space-y-1 text-sm text-slate-600">
            <div>
              <dt className="inline font-semibold">Motivo: </dt>
              <dd className="inline">{toma.motivoAnulacion}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Anulada por: </dt>
              <dd className="inline">
                {toma.anuladaPor
                  ? `${toma.anuladaPor.nombres} ${toma.anuladaPor.apellidos}`.trim()
                  : '—'}
                {toma.anuladaEn && ` · ${formatearFechaHora(toma.anuladaEn)}`}
              </dd>
            </div>
          </dl>
        </div>
      )}

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
              {MEDIDAS.map(([etiqueta, leer, unidad, claves]) => {
                const valor = leer(toma)
                const salePorFuera = valor !== null && claves.some((c) => fuera.has(c))
                return (
                  <div
                    key={etiqueta}
                    data-fuera-de-rango={salePorFuera ? 'true' : undefined}
                    className={`rounded-xl px-4 py-3 ${
                      salePorFuera ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50'
                    } ${anulada ? 'opacity-60' : ''}`}
                  >
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
                      <p
                        className={`text-xl font-bold font-outfit mt-0.5 ${
                          salePorFuera ? 'text-red-700' : 'text-slate-800'
                        }`}
                      >
                        {valor}{' '}
                        <span className="text-sm font-normal text-slate-500">{unidad}</span>
                      </p>
                    )}
                    {/* Con palabras y no solo con el color. */}
                    {salePorFuera && (
                      <p className="text-[11px] font-semibold text-red-700">
                        Fuera de rango (normal{' '}
                        {claves.map((c) => rangoNormalComoTexto(c)).filter(Boolean).join(' / ')})
                      </p>
                    )}
                  </div>
                )
              })}

              {/* HU-17: el IMC con su clasificación de la OMS, o el aviso de
                  percentiles en menores de 18 años. En una toma anulada se
                  muestra el número sin clasificar ni marcar. */}
              <ImcDeLaToma
                toma={anulada ? { imc: toma.imc, clasificacionImc: null } : toma}
                className={`sm:col-span-2 ${anulada ? 'opacity-60' : ''}`}
              />
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
            Una toma no se edita ni se borra. Si algo se midió mal, se anula dejando el motivo y
            se toma otra vez: las dos quedan en el histórico con su hora, porque el expediente
            registra lo que pasó.
          </p>

          {puedeAnular && !anulada && (
            <button
              type="button"
              onClick={() => {
                setErrorAlAnular(null)
                setAnulando(true)
              }}
              className="w-full rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
            >
              Anular toma
            </button>
          )}
        </aside>
      </div>

      <Modal
        isOpen={anulando}
        onClose={() => setAnulando(false)}
        title="Anular toma de constantes"
        subtitle="La toma no se borra: queda marcada con el motivo"
        icon="enfermeria"
        headerGradient="bg-gradient-to-r from-red-600 to-red-700"
        maxWidth="md"
      >
        <form onSubmit={confirmarAnulacion} className="space-y-4">
          <div>
            <label
              htmlFor="motivo-anulacion"
              className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide"
            >
              Motivo de la anulación
            </label>
            <textarea
              id="motivo-anulacion"
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué esta toma no es válida (por ejemplo, paciente equivocado)"
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white"
            />
          </div>

          {errorAlAnular && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800"
            >
              {errorAlAnular}
            </p>
          )}

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAnulando(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoAnulacion || motivo.trim() === ''}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {guardandoAnulacion ? 'Anulando…' : 'Confirmar anulación'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
