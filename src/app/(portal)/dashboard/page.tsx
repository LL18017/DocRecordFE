'use client'

// ─── Panel ─────────────────────────────────────────────────────────────────
// Antes esta pantalla no hacía UNA SOLA llamada al backend: las cuatro
// tarjetas, la gráfica y la lista de citas estaban escritas a mano en el JSX o
// importadas de `@/data/mockData`. Presumía «48 pacientes activos / 12
// consultas hoy / 7 prescripciones hoy / 3 clínicas» cuando la realidad era
// 6 / 2 / 1 / 1, y dibujaba una curva de treinta días que nadie había medido.
//
// Ahora todo lo que se ve sale de `GET /pacientes`, `GET /consultas` y
// `GET /clinics/mias`, y lo que no se puede saber se muestra como hueco («—»)
// con el motivo escrito en el aviso de arriba. Un cero o un guion son
// respuestas legítimas; una cifra inventada no lo es, porque se ve igual que
// una verdadera.
//
// LO QUE SE QUITÓ Y POR QUÉ:
//
//  · «Prescripciones hoy». No se puede calcular. `GET /prescripciones` EXIGE
//    `consultaId` o `pacienteId` (sin filtro responde 400 «Indique consultaId
//    o pacienteId»), así que un total del día obligaría a una petición por
//    paciente —N+1 que crece con el padrón— y, peor, un fallo parcial de esa
//    ráfaga daría un número bajo presentado como cierto. Preferir el hueco:
//    la tarjeta desaparece hasta que el backend ofrezca un listado por fecha.
//
//  · «Próximas citas». No existe endpoint de citas en el backend; las cinco
//    que se mostraban eran inventadas y estaban asignadas a un médico que no
//    existe. En su lugar va la lista de consultas REALES más recientes, que
//    sale de la misma petición que ya alimenta las tarjetas.
//
// NOMBRES DE LAS TARJETAS: «Pacientes activos» pasó a «Pacientes registrados»
// porque el API no tiene noción de paciente activo o inactivo; y «Total de
// clínicas» pasó a «Mis clínicas» porque `/clinics/mias` devuelve las de la
// cuenta autenticada, no las del sistema. Poner un número correcto bajo una
// etiqueta que promete otra cosa es la misma mentira con otra forma.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { useUsuarioAutenticado } from '@/context/AppContext'
import { ApiError } from '@/lib/api'
import { listarPacientes, type PacienteDto } from '@/services/pacientes'
import { listarMisClinicas, type ClinicaDto } from '@/services/clinicas'
import {
  formatearFechaHora,
  listarConsultas,
  nombreDePaciente,
  type ConsultaDto,
} from '@/services/consultas'
import { contarConsultasDeHoy, serieDePacientesAtendidos } from '@/lib/resumenPanel'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

/** Cuántas consultas recientes caben en la tarjeta lateral. */
const CONSULTAS_RECIENTES = 4

/** Cómo se pinta cada estado; mismo criterio que la pantalla de consultas. */
const COLOR_DE_ESTADO = { PENDIENTE: 'yellow', FINALIZADA: 'green' } as const

export default function DashboardPage() {
  const user = useUsuarioAutenticado()

  // `null` significa «no se sabe», que no es lo mismo que una lista vacía.
  // Vacío es un dato (no hay ninguno); null es la ausencia del dato, y es lo
  // que hace que la tarjeta muestre «—» en vez de un 0 que sería falso.
  const [pacientes, setPacientes] = useState<PacienteDto[] | null>(null)
  const [consultas, setConsultas] = useState<ConsultaDto[] | null>(null)
  const [clinicas, setClinicas] = useState<ClinicaDto[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [problemas, setProblemas] = useState<string[]>([])

  // Las tres peticiones van con `allSettled` y no con `all`: que las clínicas
  // fallen —a una enfermera `/clinics/mias` le responde 403— no puede dejar
  // sin pacientes ni sin consultas al resto del panel. Cada tarjeta enseña lo
  // suyo o su hueco.
  const cargar = useCallback(async () => {
    const [resPacientes, resConsultas, resClinicas] = await Promise.allSettled([
      listarPacientes(),
      listarConsultas(),
      listarMisClinicas(),
    ])

    const fallos: string[] = []

    if (resPacientes.status === 'fulfilled') setPacientes(resPacientes.value)
    else {
      setPacientes(null)
      fallos.push(describir('No se pudo contar los pacientes', resPacientes.reason))
    }

    if (resConsultas.status === 'fulfilled') setConsultas(resConsultas.value)
    else {
      setConsultas(null)
      fallos.push(describir('No se pudieron cargar las consultas', resConsultas.reason))
    }

    if (resClinicas.status === 'fulfilled') setClinicas(resClinicas.value)
    else {
      setClinicas(null)
      fallos.push(describir('No se pudieron cargar las clínicas', resClinicas.reason))
    }

    setProblemas(fallos)
    setCargando(false)
  }, [])

  // Ver el comentario equivalente en (portal)/pacientes/page.tsx: la regla
  // rastrea los setState posteriores al await, pero cargar datos remotos al
  // montar no produce el render en cascada que la regla persigue.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargar()
  }, [cargar])

  const reintentar = () => {
    setCargando(true)
    setProblemas([])
    void cargar()
  }

  // El «hoy» se fija una vez por render de datos y se pasa a los cálculos, en
  // vez de que cada uno llame a `new Date()` por su cuenta: así la tarjeta y
  // la gráfica no pueden discrepar si el render cruza la medianoche.
  const hoy = useMemo(() => new Date(), [])

  const consultasDeHoy = consultas === null ? null : contarConsultasDeHoy(consultas, hoy)
  const serie = useMemo(
    () => (consultas === null ? [] : serieDePacientesAtendidos(consultas, hoy)),
    [consultas, hoy],
  )

  const currentDate = hoy.toLocaleDateString('es-SV', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  /**
   * Qué enseña una tarjeta: puntos suspensivos mientras se pide, el número
   * cuando llegó, y un guion cuando la petición falló. Nunca un 0 de relleno.
   */
  const cifra = (valor: number | null): string | number => {
    if (cargando) return '…'
    return valor === null ? '—' : valor
  }

  return (
    <div className="space-y-6">
      {/* Header and fast actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit tracking-tight">
            Bienvenido, {user.name}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Resumen del expediente clínico · {currentDate}
          </p>
        </div>

        {user.roles.some((rol) => rol !== 'enfermera') && (
          <div className="flex gap-2">
            <Link
              href="/pacientes"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all"
            >
              <Icon name="patients" size={16} color="white" /> Paciente
            </Link>
            <Link
              href="/consultas"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-amber hover:opacity-90 shadow-sm transition-all"
            >
              <Icon name="consultas" size={16} color="white" /> Consulta
            </Link>
          </div>
        )}
      </div>

      {problemas.length > 0 && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <div className="space-y-1">
            {problemas.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="text-red-600/80">
              Las cifras que dependen de eso se muestran como «—»: preferimos el hueco a un
              número que no podemos comprobar.
            </p>
          </div>
          <button
            onClick={reintentar}
            className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/pacientes">
          <StatCard
            icon="patients"
            label="Pacientes registrados"
            value={cifra(pacientes === null ? null : pacientes.length)}
            iconColor="bg-blue-600"
          />
        </Link>
        <Link href="/consultas">
          <StatCard
            icon="consultas"
            label="Consultas hoy"
            value={cifra(consultasDeHoy)}
            iconColor="bg-doc-amber"
          />
        </Link>
        <Link href="/consultas">
          <StatCard
            icon="history"
            label="Consultas registradas"
            value={cifra(consultas === null ? null : consultas.length)}
            iconColor="bg-purple-600"
          />
        </Link>
        <Link href="/clinicas">
          <StatCard
            icon="clinicas"
            label="Mis clínicas"
            value={cifra(clinicas === null ? null : clinicas.length)}
            iconColor="bg-emerald-600"
          />
        </Link>
      </div>

      {/* Main Chart + Recent consultations */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chart card */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 font-outfit">Pacientes atendidos</h3>
              <p className="text-xs text-slate-400 mt-0.5">Últimos 30 días</p>
            </div>
          </div>

          <div className="w-full h-56">
            {cargando ? (
              <p className="h-full flex items-center justify-center text-sm text-slate-500">
                Cargando consultas…
              </p>
            ) : consultas === null ? (
              <p className="h-full flex items-center justify-center text-center text-sm text-slate-500">
                Sin las consultas no se puede dibujar esta curva. No se muestra ninguna en su
                lugar.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie}>
                  <defs>
                    <linearGradient id="fillPacientes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E3A5F" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    // Sin esto recharts inventa una escala decimal (0,5 / 1,5
                    // pacientes) en cuanto los valores son pequeños, que es lo
                    // normal con pocos datos reales.
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: 'none',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pacientes"
                    name="Pacientes atendidos"
                    stroke="#1E3A5F"
                    strokeWidth={2.5}
                    fill="url(#fillPacientes)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#E8A838' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent consultations card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-800 mb-4 font-outfit">Consultas recientes</h3>
            <div className="space-y-3">
              {cargando && <p className="text-sm text-slate-500">Cargando consultas…</p>}

              {!cargando && consultas === null && (
                <p className="text-sm text-slate-500">
                  No se pudieron cargar las consultas, así que aquí no se muestra ninguna.
                </p>
              )}

              {!cargando && consultas !== null && consultas.length === 0 && (
                <p className="text-sm text-slate-500">
                  Todavía no hay ninguna consulta registrada.
                </p>
              )}

              {!cargando &&
                consultas !== null &&
                consultas.slice(0, CONSULTAS_RECIENTES).map((c) => (
                  <div
                    key={c.consultaId}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100/60"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {nombreDePaciente(c)}
                      </p>
                      <p className="text-xs text-slate-400">{formatearFechaHora(c.fecha)}</p>
                    </div>
                    <Badge color={COLOR_DE_ESTADO[c.estado]}>{c.estado}</Badge>
                  </div>
                ))}
            </div>
          </div>

          <Link
            href="/consultas"
            className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-doc-blue hover:text-doc-blue transition-colors text-center block"
          >
            Ver todas las consultas
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Une el «qué se estaba haciendo» con el motivo que dio el backend. Mismo
 * criterio que en la pantalla de consultas: el texto del servidor explica el
 * caso concreto mejor que una frase fija escrita aquí.
 */
function describir(quePasaba: string, error: unknown): string {
  if (error instanceof ApiError) return `${quePasaba}: ${error.message}`
  return `${quePasaba}.`
}
