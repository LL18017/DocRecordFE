'use client'

// HU-18 (DRS-89) · Evolución histórica de los signos vitales.
//
// «Como médico que da seguimiento a un paciente crónico quiero ver en una
//  gráfica cómo evolucionaron su presión, su peso y su IMC para detectar
//  tendencias que una toma aislada no muestra.»
//
// Esa última frase es la que manda sobre el diseño: lo que aporta la pantalla no
// es el dato de hoy —eso ya está en la tarjeta de la última toma— sino la
// pendiente. Por eso los puntos van unidos, el eje Y no arranca en cero (una
// presión de 118 a 142 se aplana hasta desaparecer si el eje empieza en 0), y
// los valores fuera de rango se marcan en vez de dejarlos confundirse con el
// resto.

import React, { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SignosVitalesDto } from '@/services/signosVitales'

// ─── Qué se puede graficar ───────────────────────────────────────────────────

type ClaveMedida = 'presion' | 'peso' | 'imc'

interface Medida {
  clave: ClaveMedida
  etiqueta: string
  unidad: string
  /** Franja considerada normal, para pintarla de fondo y marcar lo que se sale. */
  normal: { min: number; max: number }
  /** Series que se dibujan. La presión son dos líneas; las otras, una. */
  series: { campo: string; nombre: string; color: string }[]
  /** Saca el valor que decide si una toma está fuera de rango. */
  valorDeReferencia: (t: SignosVitalesDto) => number | null
}

const MEDIDAS: Medida[] = [
  {
    clave: 'presion',
    etiqueta: 'Presión arterial',
    unidad: 'mmHg',
    // Rango de referencia para adulto. Se marca contra la sistólica, que es la
    // que primero se sale en el paciente crónico típico de esta historia.
    normal: { min: 90, max: 129 },
    series: [
      { campo: 'sistolica', nombre: 'Sistólica', color: '#1E3A8A' },
      { campo: 'diastolica', nombre: 'Diastólica', color: '#60A5FA' },
    ],
    valorDeReferencia: (t) => t.presionSistolica,
  },
  {
    clave: 'peso',
    etiqueta: 'Peso',
    unidad: 'kg',
    // El peso no tiene un rango normal universal —depende de la talla—, así que
    // no se marca ninguna franja. Inventar una sería afirmar algo que no se
    // sabe: para eso está el IMC, que sí lo relaciona con la estatura.
    normal: { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY },
    series: [{ campo: 'peso', nombre: 'Peso', color: '#0F766E' }],
    valorDeReferencia: () => null,
  },
  {
    clave: 'imc',
    etiqueta: 'IMC',
    unidad: 'kg/m²',
    normal: { min: 18.5, max: 24.9 },
    series: [{ campo: 'imc', nombre: 'IMC', color: '#B45309' }],
    valorDeReferencia: (t) => t.imc,
  },
]

// ─── Rangos de tiempo ────────────────────────────────────────────────────────

const RANGOS = [
  { clave: 'mes', etiqueta: 'Último mes', dias: 31 },
  { clave: 'semestre', etiqueta: '6 meses', dias: 183 },
  { clave: 'anio', etiqueta: 'Último año', dias: 366 },
] as const

type ClaveRango = (typeof RANGOS)[number]['clave']

interface Punto {
  fecha: string
  momento: number
  sistolica: number | null
  diastolica: number | null
  peso: number | null
  imc: number | null
  fueraDeRango: boolean
}

export interface EvolucionSignosVitalesProps {
  tomas: SignosVitalesDto[]
}

export function EvolucionSignosVitales({ tomas }: EvolucionSignosVitalesProps) {
  const [medidaActiva, setMedidaActiva] = useState<ClaveMedida>('presion')
  const [rangoActivo, setRangoActivo] = useState<ClaveRango>('semestre')

  const medida = MEDIDAS.find((m) => m.clave === medidaActiva)!
  const rango = RANGOS.find((r) => r.clave === rangoActivo)!

  // El «ahora» se fija UNA vez, al montar, y no se lee dentro del useMemo.
  //
  // No es sólo para contentar a la regla de pureza: un `Date.now()` dentro del
  // cálculo hace que el mismo estado produzca resultados distintos según el
  // instante en que React decida recalcular, y una toma justo en el borde del
  // rango aparecería y desaparecería sola. Con la referencia congelada, lo que
  // se ve sólo cambia cuando el médico cambia algo.
  const [ahora] = useState(() => Date.now())

  // El filtro por rango es un `useMemo` sobre los datos que ya están en
  // memoria, no una petición nueva: el criterio 2 pide que cambiar el rango no
  // recargue la página, y volver al servidor por cada clic haría justo eso —con
  // un parpadeo y una espera por cada pulsación.
  const puntos = useMemo<Punto[]>(() => {
    const desde = ahora - rango.dias * 24 * 60 * 60 * 1000

    return tomas
      .filter((t) => new Date(t.tomadoEn).getTime() >= desde)
      .map((t) => {
        const referencia = medida.valorDeReferencia(t)
        return {
          fecha: new Date(t.tomadoEn).toLocaleDateString('es-SV', {
            day: '2-digit',
            month: 'short',
          }),
          momento: new Date(t.tomadoEn).getTime(),
          sistolica: t.presionSistolica,
          diastolica: t.presionDiastolica,
          peso: t.pesoKg,
          imc: t.imc,
          fueraDeRango:
            referencia !== null &&
            (referencia < medida.normal.min || referencia > medida.normal.max),
        }
      })
      // De lo más antiguo a lo más reciente: el backend los devuelve al revés
      // porque para una lista lo último es lo que importa, pero una gráfica que
      // avanza hacia atrás en el tiempo se lee como una tendencia invertida.
      .sort((a, b) => a.momento - b.momento)
  }, [tomas, rango.dias, medida, ahora])

  // Cuántas tienen realmente el dato de esta medida. Una toma puede traer la
  // presión y no el peso, así que «hay 5 tomas» no significa «hay 5 puntos».
  const conDato = puntos.filter((p) =>
    medida.series.some((s) => p[s.campo as keyof Punto] !== null),
  ).length

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-outfit text-base font-semibold text-slate-800">
            Evolución
          </h3>
          <p className="text-xs text-slate-500">
            Tendencia que una toma aislada no muestra
          </p>
        </div>

        {/* Rangos. Van arriba y no dentro de la gráfica para que se alcancen con
            el pulgar en un teléfono, que es el criterio 5. */}
        <div
          role="group"
          aria-label="Rango de tiempo"
          className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
        >
          {RANGOS.map((r) => (
            <button
              key={r.clave}
              type="button"
              onClick={() => setRangoActivo(r.clave)}
              aria-pressed={rangoActivo === r.clave}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                rangoActivo === r.clave
                  ? 'bg-white text-doc-blue shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Medidas */}
      <div role="group" aria-label="Medida" className="mb-4 flex flex-wrap gap-2">
        {MEDIDAS.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() => setMedidaActiva(m.clave)}
            aria-pressed={medidaActiva === m.clave}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              medidaActiva === m.clave
                ? 'bg-doc-blue text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>

      {conDato < 2 ? (
        // Criterio 3. Una gráfica de un punto no es una gráfica, y una vacía
        // parece un error del sistema. Se dice qué falta y por qué.
        <p
          role="status"
          className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
        >
          {conDato === 0
            ? `No hay tomas de ${medida.etiqueta.toLowerCase()} en este período.`
            : `Solo hay una toma de ${medida.etiqueta.toLowerCase()} en este período.`}{' '}
          Hacen falta al menos dos para ver una tendencia.
          <span className="mt-1 block text-xs text-slate-400">
            Prueba a ampliar el rango de tiempo.
          </span>
        </p>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={puntos} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  // `domain="auto"` y no `[0, ...]`: una presión que va de 118 a
                  // 142 se aplana hasta no verse si el eje arranca en cero, y
                  // justo esa variación es lo que el médico viene a mirar.
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                  // El valor llega tipado como `ValueType | undefined`: una serie
                  // puede no tener dato en ese punto -- una toma sin peso -- y
                  // entonces no hay nada que formatear.
                  formatter={(valor, nombre) =>
                    valor === undefined || valor === null
                      ? ['—', String(nombre)]
                      : [`${valor} ${medida.unidad}`, String(nombre)]
                  }
                />

                {/* La franja normal, de fondo. Da la referencia sin necesidad de
                    leer números, que es lo que hace útil una gráfica. */}
                {Number.isFinite(medida.normal.min) && (
                  <ReferenceArea
                    y1={medida.normal.min}
                    y2={medida.normal.max}
                    fill="#10B981"
                    fillOpacity={0.07}
                  />
                )}

                {medida.series.map((serie) => (
                  <Line
                    key={serie.campo}
                    type="monotone"
                    dataKey={serie.campo}
                    name={serie.nombre}
                    stroke={serie.color}
                    strokeWidth={2}
                    // `connectNulls`: una toma sin peso no debe partir la línea
                    // en dos, porque no significa que el paciente dejara de
                    // pesar — significa que ese día no se le pesó.
                    connectNulls
                    dot={<PuntoDeLaSerie color={serie.color} />}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {medida.series.map((s) => (
              <span key={s.campo} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.nombre}
              </span>
            ))}
            {Number.isFinite(medida.normal.min) && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-3 rounded-sm bg-emerald-500/20" />
                Rango normal ({medida.normal.min}–{medida.normal.max} {medida.unidad})
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              Fuera de rango
            </span>
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Un punto de la línea, rojo y más grande si la toma salió de rango (criterio 4).
 *
 * El tamaño acompaña al color a propósito: distinguir sólo por color deja fuera
 * a quien no diferencia el rojo del azul, y esto es información clínica.
 */
function PuntoDeLaSerie(props: {
  color: string
  cx?: number
  cy?: number
  payload?: Punto
}) {
  const { color, cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null

  const fuera = payload?.fueraDeRango ?? false
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={fuera ? 5 : 3}
      fill={fuera ? '#DC2626' : color}
      stroke="#FFFFFF"
      strokeWidth={fuera ? 2 : 1}
    />
  )
}
