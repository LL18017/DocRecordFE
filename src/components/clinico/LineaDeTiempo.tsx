'use client'

// ─── Línea de tiempo del expediente (HU-15) ────────────────────────────────
//
// Consultas, tomas de signos vitales y recetas del paciente en una sola vista
// cronológica, de todas las sedes de la red. Es la pantalla en la que un médico
// que ve al paciente por primera vez entiende su evolución, aunque lo hayan
// atendido en otra clínica.
//
// ── Solo lectura (criterio 5) ─────────────────────────────────────────────
// No hay ni un botón que escriba: lo único interactivo son los filtros. Cada
// registro se corrige o se anula desde su propia sección de la ficha, que es
// donde están sus reglas (quién puede, con qué motivo, dentro de qué ventana).
//
// ── Filtros en el navegador (criterio 2) ──────────────────────────────────
// La lista llega completa una vez y se filtra aquí, así que cambiar un filtro
// no vuelve al servidor ni recarga nada.
//
// ── Lo que enfermería no ve ───────────────────────────────────────────────
// El diagnóstico de la consulta le llega en `null` desde el backend (criterio
// 4). Aquí no se decide nada por rol: lo que no vino no se pinta.

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/types'
import { ApiError } from '@/lib/api'
import { formatearFechaHora } from '@/services/consultas'
import {
  ETIQUETA_DE_TIPO,
  TIPOS_DE_EVENTO,
  filtrarLineaDeTiempo,
  nombreDelProfesional,
  obtenerLineaDeTiempo,
  rolDelProfesional,
  type EventoDelExpedienteDto,
  type FiltroDeLineaDeTiempo,
  type TipoDeEvento,
} from '@/services/expediente'
import { tensionArterial, type SignosVitalesDto } from '@/services/signosVitales'

const ICONO_DE_TIPO: Record<TipoDeEvento, IconName> = {
  CONSULTA: 'consultas',
  SIGNOS_VITALES: 'vitals',
  RECETA: 'prescripciones',
}

const COLOR_DE_TIPO: Record<TipoDeEvento, string> = {
  CONSULTA: 'bg-doc-surface text-doc-blue',
  SIGNOS_VITALES: 'bg-emerald-50 text-emerald-700',
  RECETA: 'bg-amber-50 text-amber-700',
}

/** Solo los estados que dicen algo: ACTIVA, EMITIDA y FINALIZADA son lo normal y no llevan marca. */
const MARCA_DE_ESTADO: Record<string, { texto: string; color: 'red' | 'yellow' }> = {
  ANULADA: { texto: 'Anulada', color: 'red' },
  PENDIENTE: { texto: 'Pendiente', color: 'yellow' },
}

const campo =
  'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'

interface LineaDeTiempoProps {
  pacienteId: number
}

export const LineaDeTiempo: React.FC<LineaDeTiempoProps> = ({ pacienteId }) => {
  const uid = useId()
  const [eventos, setEventos] = useState<EventoDelExpedienteDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroDeLineaDeTiempo>({})

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setEventos(await obtenerLineaDeTiempo(pacienteId))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la línea de tiempo.')
    } finally {
      setCargando(false)
    }
  }, [pacienteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargar()
  }, [cargar])

  const visibles = useMemo(() => filtrarLineaDeTiempo(eventos, filtro), [eventos, filtro])
  const tiposElegidos = filtro.tipos ?? []
  const hayFiltros = tiposElegidos.length > 0 || Boolean(filtro.desde || filtro.hasta)

  const alternarTipo = (tipo: TipoDeEvento) => {
    const tipos = tiposElegidos.includes(tipo)
      ? tiposElegidos.filter((t) => t !== tipo)
      : [...tiposElegidos, tipo]
    setFiltro({ ...filtro, tipos })
  }

  return (
    <section aria-labelledby={`${uid}-titulo`}>
      <h2 id={`${uid}-titulo`} className="sr-only">
        Línea de tiempo del expediente
      </h2>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filtros</h3>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => setFiltro({})}
              className="text-xs font-semibold text-doc-blue hover:underline cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div role="group" aria-label="Tipo de evento" className="flex flex-wrap gap-2 mb-3">
          {TIPOS_DE_EVENTO.map((tipo) => {
            const activo = tiposElegidos.includes(tipo)
            return (
              <button
                key={tipo}
                type="button"
                aria-pressed={activo}
                onClick={() => alternarTipo(tipo)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-doc-blue/40 ${
                  activo
                    ? 'border-doc-blue bg-doc-blue text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <Icon name={ICONO_DE_TIPO[tipo]} size={13} />
                {ETIQUETA_DE_TIPO[tipo]}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-desde`} className="block text-xs text-slate-500 mb-1">
              Desde
            </label>
            <input
              id={`${uid}-desde`}
              type="date"
              value={filtro.desde ?? ''}
              max={filtro.hasta || undefined}
              onChange={(e) => setFiltro({ ...filtro, desde: e.target.value || undefined })}
              className={campo}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-hasta`} className="block text-xs text-slate-500 mb-1">
              Hasta
            </label>
            <input
              id={`${uid}-hasta`}
              type="date"
              value={filtro.hasta ?? ''}
              min={filtro.desde || undefined}
              onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value || undefined })}
              className={campo}
            />
          </div>
        </div>
      </div>

      {cargando ? (
        <p role="status" className="text-sm text-slate-500 px-1">
          Cargando la línea de tiempo…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void cargar()}
            className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <p aria-live="polite" className="text-xs text-slate-500 mb-3 px-1">
            {eventos.length === 0
              ? 'Este paciente todavía no tiene consultas, tomas de signos ni recetas.'
              : visibles.length === 0
                ? 'Ningún evento coincide con los filtros.'
                : hayFiltros
                  ? `${visibles.length} de ${eventos.length} eventos`
                  : `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}`}
          </p>
          {visibles.length > 0 && (
            <ol className="relative border-l-2 border-slate-100 ml-4 space-y-4">
              {visibles.map((evento) => (
                <li key={`${evento.tipo}-${evento.id}`} className="ml-6">
                  <Evento evento={evento} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

const Evento: React.FC<{ evento: EventoDelExpedienteDto }> = ({ evento }) => {
  const marca = MARCA_DE_ESTADO[evento.estado]
  const anulado = evento.estado === 'ANULADA'

  return (
    <article
      aria-label={`${ETIQUETA_DE_TIPO[evento.tipo]} del ${formatearFechaHora(evento.fecha)}`}
      className={`relative bg-white rounded-2xl border shadow-sm p-4 ${
        anulado ? 'border-red-100 bg-red-50/30' : 'border-slate-100'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute -left-[2.35rem] top-4 w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-white ${COLOR_DE_TIPO[evento.tipo]}`}
      >
        <Icon name={ICONO_DE_TIPO[evento.tipo]} size={14} />
      </span>

      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-semibold text-slate-800 text-sm font-outfit">
          {ETIQUETA_DE_TIPO[evento.tipo]}
        </span>
        <time dateTime={evento.fecha} className="text-xs text-slate-500">
          {formatearFechaHora(evento.fecha)}
        </time>
        {marca && <Badge color={marca.color}>{marca.texto}</Badge>}
      </div>

      {/* Criterio 3: dónde y quién, en todos los eventos. */}
      <p className="text-xs text-slate-500 mb-3">
        {evento.clinica ? evento.clinica.name : 'Sede no registrada'} · {nombreDelProfesional(evento)} (
        {rolDelProfesional(evento)})
      </p>

      {evento.consulta && <DetalleConsulta consulta={evento.consulta} />}
      {evento.signosVitales && <DetalleToma toma={evento.signosVitales} />}
      {evento.receta && (
        <ul className="text-sm text-slate-700 space-y-1">
          {evento.receta.medicamentos.map((m) => (
            <li key={m.id}>
              <span className="font-medium">{m.medicamento}</span> — {m.dosis}, {m.viaAdministracion},{' '}
              {m.frecuencia.toLowerCase()}, {m.duracion}
            </li>
          ))}
        </ul>
      )}

      {anulado && <MotivoDeAnulacion evento={evento} />}
    </article>
  )
}

const DetalleConsulta: React.FC<{ consulta: NonNullable<EventoDelExpedienteDto['consulta']> }> = ({
  consulta,
}) => (
  <dl className="text-sm text-slate-700 space-y-1">
    <Dato rotulo="Motivo" valor={consulta.motivo} />
    <Dato rotulo="Diagnóstico" valor={consulta.diagnostico} />
    <Dato rotulo="Indicaciones" valor={consulta.indicaciones} />
  </dl>
)

const DetalleToma: React.FC<{ toma: SignosVitalesDto }> = ({ toma }) => {
  const presion = tensionArterial(toma)
  const medidas: [string, string | null][] = [
    ['Presión arterial', presion && `${presion} mmHg`],
    ['Pulso', toma.pulsoLpm === null ? null : `${toma.pulsoLpm} lpm`],
    ['Temperatura', toma.temperaturaC === null ? null : `${toma.temperaturaC} °C`],
    ['Frecuencia respiratoria', toma.frecuenciaRespRpm === null ? null : `${toma.frecuenciaRespRpm} rpm`],
    ['Saturación', toma.saturacionPct === null ? null : `${toma.saturacionPct} %`],
    ['Peso', toma.pesoKg === null ? null : `${toma.pesoKg} kg`],
    ['Estatura', toma.estaturaCm === null ? null : `${toma.estaturaCm} cm`],
    [
      'IMC',
      toma.imc === null ? null : `${toma.imc}${toma.clasificacionImc ? ` (${toma.clasificacionImc})` : ''}`,
    ],
  ]
  return (
    <dl className="text-sm text-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {medidas.map(([rotulo, valor]) => (
        <Dato key={rotulo} rotulo={rotulo} valor={valor} />
      ))}
      <Dato rotulo="Observaciones" valor={toma.observaciones} className="sm:col-span-2" />
    </dl>
  )
}

/** Un dato que no vino no se pinta: una medida que no se tomó no es cero. */
const Dato: React.FC<{ rotulo: string; valor: string | null; className?: string }> = ({
  rotulo,
  valor,
  className = '',
}) =>
  valor ? (
    <div className={`flex gap-1.5 ${className}`}>
      <dt className="text-slate-500">{rotulo}:</dt>
      <dd>{valor}</dd>
    </div>
  ) : null

const MotivoDeAnulacion: React.FC<{ evento: EventoDelExpedienteDto }> = ({ evento }) => {
  const motivo =
    evento.consulta?.motivoAnulacion ??
    evento.signosVitales?.motivoAnulacion ??
    evento.receta?.motivoAnulacion ??
    null
  return motivo ? <p className="mt-3 text-xs text-red-700">Motivo de la anulación: {motivo}</p> : null
}
