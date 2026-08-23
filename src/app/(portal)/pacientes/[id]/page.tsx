'use client'

// ─── Expediente de un paciente ─────────────────────────────────────────────
//
// REGLA DE ESTA PANTALLA: en un expediente clínico, EL HUECO HONESTO SIEMPRE
// GANA AL DATO INVENTADO. Nada que no venga del backend puede pintarse como si
// fuera del paciente.
//
// De dónde viene ese principio: esta pantalla llevaba escritas EN EL CÓDIGO
// una alergia a la Penicilina de severidad Alta, dos sulfonamidas, una
// hipertensión con su Losartán, un padre diabético y unos signos vitales
// tomados por una enfermera que no existe. Salían idénticos para CUALQUIER
// paciente, incluido uno creado esa misma mañana al que nadie preguntó nada.
// Un médico que lee «Alergia a Penicilina» de una paciente a la que nunca se
// le preguntó puede negarle el antibiótico que necesita; una alergia real que
// falta puede matarla.
//
// Y la maqueta no solo mentía: TAPABA. `consultations` y `vitals` de
// `@/data/mockData` sembraban el estado inicial, así que las consultas de
// verdad —registradas desde esta misma pantalla, confirmadas con un 201 y
// guardadas en la base— desaparecían al recargar y en su lugar volvían las dos
// inventadas.
//
// Qué se carga de verdad y qué queda en hueco:
//   · Consultas  → GET /consultas?pacienteId={id}      (services/consultas)
//   · Recetas    → GET /prescripciones?pacienteId={id} (services/prescripciones)
//   · Alergias, enfermedades crónicas, antecedentes hereditarios, hábitos y
//     signos vitales → NO EXISTE ENDPOINT. No hay nada que cargar, así que se
//     muestra el vacío con un aviso que dice por qué está vacío (ver
//     `AvisoSinRegistro`), nunca datos de relleno.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { IconName, Patient } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import { obtenerPaciente } from '@/services/pacientes'
import { pacienteDtoAPatient } from '@/lib/pacienteAdapter'
import { ConsultationForm } from '@/components/forms/ConsultationForm'
import {
  formatearFechaHora,
  listarConsultas,
  textoOpcional,
  type ConsultaDto,
} from '@/services/consultas'
import {
  listarPrescripcionesDePaciente,
  nombreDeMedicoQueReceta,
  type PrescripcionDto,
} from '@/services/prescripciones'

// Ids fijos, sin `useId()`: esta pantalla se monta una sola vez por ruta y el
// bloque de datos personales vive dentro de ella, no en un componente que
// alguien pueda repetir. Los formularios que sí se reutilizan —los de
// components/forms— llevan su prefijo con `useId()`.
const idDato = (campo: string) => `datos-personales-${campo}`
const labelDatoClass = 'block text-xs text-slate-500 uppercase tracking-wide mb-1 font-semibold'
// Se agrega `focus-visible:ring-*` al `focus:outline-none` que ya estaba:
// quitar el contorno del navegador sin reponer nada deja a quien navega con
// teclado sin saber dónde está parado.
const inputDatoClass =
  'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'

/** Cómo se pinta cada estado de consulta. El backend solo maneja estos dos. */
const ETIQUETA_DE_ESTADO = { PENDIENTE: 'Pendiente', FINALIZADA: 'Finalizada' } as const
const COLOR_DE_ESTADO = { PENDIENTE: 'yellow', FINALIZADA: 'green' } as const

/**
 * Aviso que acompaña a cada sección sin backend.
 *
 * Es la mitad que faltaría si solo se borraran los datos inventados. «No hay
 * alergias registradas» a secas, en un expediente clínico, se lee como «esta
 * paciente no tiene alergias» —una afirmación que nadie ha comprobado— y eso
 * es otra vez un dato inventado, solo que en negativo. El aviso convierte la
 * frase en lo único que la aplicación sabe de verdad: que aquí todavía no se
 * guarda nada.
 */
const AvisoSinRegistro: React.FC<{ loQueFalta: string }> = ({ loQueFalta }) => (
  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
    El sistema todavía no guarda {loQueFalta}: este apartado seguirá vacío aunque el paciente sí
    tenga. No lo lea como «no tiene» —pregúntelo y consulte el expediente en papel antes de
    decidir un tratamiento—.
  </p>
)

interface SeccionSinRegistroProps {
  icon: IconName
  titulo: string
  /** Estado vacío, redactado para la sección: «No hay alergias registradas.» */
  vacio: string
  /** Lo que el sistema aún no guarda, en plural: «alergias». */
  loQueFalta: string
  expanded: boolean
  onToggle: () => void
}

/**
 * Sección del expediente para la que NO existe endpoint.
 *
 * No lleva botón «Agregar». El que había metía una fila en el estado de React
 * y nada más: el médico veía la alergia en pantalla, cerraba el modal creyendo
 * que había quedado registrada y al recargar no estaba. Es el mismo criterio
 * que se aplicó a «Nuevo Usuario» en (portal)/usuarios/page.tsx —un botón que
 * no llega a la base es una promesa falsa— y aquí pesa más, porque lo que se
 * pierde en silencio es una alergia.
 */
const SeccionSinRegistro: React.FC<SeccionSinRegistroProps> = ({
  icon,
  titulo,
  vacio,
  loQueFalta,
  expanded,
  onToggle,
}) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
    <div className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
      <button className="flex items-center gap-3 flex-1 text-left cursor-pointer" onClick={onToggle}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-surface text-doc-blue">
          <Icon name={icon} size={16} />
        </div>
        <span className="font-semibold text-slate-700 text-sm font-outfit">{titulo}</span>
      </button>
      <button
        onClick={onToggle}
        aria-label={`Expandir ${titulo}`}
        className={`text-slate-400 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
      >
        <Icon name="chevron_down" size={18} />
      </button>
    </div>
    {expanded && (
      <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3">
        <p className="text-sm text-slate-500">{vacio}</p>
        <AvisoSinRegistro loQueFalta={loQueFalta} />
      </div>
    )}
  </div>
)

export default function ExpedienteDetailPage() {
  const params = useParams()
  const patientId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const [patient, setPatient] = useState<Patient | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noEncontrado, setNoEncontrado] = useState(false)

  // El historial clínico va aparte del paciente: que se caiga `GET /consultas`
  // no debe esconder los datos personales, que ya llegaron.
  const [consultas, setConsultas] = useState<ConsultaDto[]>([])
  const [recetas, setRecetas] = useState<PrescripcionDto[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)
  // Un error por recurso, no uno compartido: si las consultas cargan y las
  // recetas no, el contador de recetas tiene que decir que no lo sabe, y el de
  // consultas puede decir la verdad.
  const [errorConsultas, setErrorConsultas] = useState<string | null>(null)
  const [errorRecetas, setErrorRecetas] = useState<string | null>(null)

  const cargarPaciente = useCallback(async () => {
    setError(null)
    setNoEncontrado(false)
    try {
      const paciente = await obtenerPaciente(Number(patientId))
      setPatient(pacienteDtoAPatient(paciente))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNoEncontrado(true)
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el expediente.')
      }
    } finally {
      setCargando(false)
    }
  }, [patientId])

  // Las dos peticiones van con `allSettled` y no con `all`: si fallan las
  // recetas, las consultas ya traídas se siguen mostrando. En un fallo se
  // vacía la lista correspondiente a propósito —dejar la anterior pintada
  // mientras el aviso dice que no se pudo cargar es otra forma de mostrar algo
  // que no se sabe si sigue siendo cierto—.
  const cargarHistorial = useCallback(async () => {
    const id = Number(patientId)
    const [resConsultas, resRecetas] = await Promise.allSettled([
      listarConsultas(id),
      listarPrescripcionesDePaciente(id),
    ])

    if (resConsultas.status === 'fulfilled') {
      setConsultas(resConsultas.value)
      setErrorConsultas(null)
    } else {
      setConsultas([])
      setErrorConsultas(describir('No se pudieron cargar las consultas', resConsultas.reason))
    }

    if (resRecetas.status === 'fulfilled') {
      setRecetas(resRecetas.value)
      setErrorRecetas(null)
    } else {
      setRecetas([])
      setErrorRecetas(describir('No se pudieron cargar las recetas', resRecetas.reason))
    }

    setCargandoHistorial(false)
  }, [patientId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargarPaciente()
  }, [cargarPaciente])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargarHistorial()
  }, [cargarHistorial])

  // Reintentar sí es un manejador de evento, no un efecto: aquí marcar el
  // estado de carga antes de pedir es correcto y da respuesta inmediata.
  const reintentarHistorial = () => {
    setCargandoHistorial(true)
    setErrorConsultas(null)
    setErrorRecetas(null)
    void cargarHistorial()
  }

  const [expanded, setExpanded] = useState<string[]>(['datos'])
  const [modal, setModal] = useState<'consulta' | null>(null)
  const toggle = (s: string) =>
    setExpanded((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  const [editingDatos, setEditingDatos] = useState(false)

  const closeModal = () => setModal(null)

  // Los medicamentos de la columna «Medicamentos» salen de las recetas reales
  // del paciente, enlazadas por `consultaId`. Antes venían de `c.meds` de la
  // maqueta: dos antibióticos que nadie recetó, colgados de dos consultas que
  // nunca ocurrieron.
  const medicamentosPorConsulta = useMemo(() => {
    const mapa = new Map<number, string[]>()
    for (const receta of recetas) {
      const nombres = mapa.get(receta.consultaId) ?? []
      nombres.push(...receta.medicamentos.map((m) => m.medicamento))
      mapa.set(receta.consultaId, nombres)
    }
    return mapa
  }, [recetas])

  const avisoHistorial = [errorConsultas, errorRecetas].filter(Boolean).join(' ')

  if (cargando) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
        Cargando expediente…
      </div>
    )
  }

  if (noEncontrado) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center">
        <p className="text-sm text-slate-600 mb-4">Este paciente no existe.</p>
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-doc-blue hover:underline"
        >
          <Icon name="back" size={16} /> Volver a Pacientes
        </Link>
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div
        role="alert"
        className="bg-white rounded-2xl border border-red-100 shadow-sm px-6 py-16 text-center"
      >
        <p className="text-sm text-red-700 mb-4">{error ?? 'No se pudo cargar el expediente.'}</p>
        <button
          onClick={() => {
            setCargando(true)
            void cargarPaciente()
          }}
          className="text-sm font-semibold text-doc-blue hover:underline cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header Bar */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/pacientes"
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <Icon name="back" size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Expediente del Paciente</h1>
          <p className="text-xs text-slate-500">
            {patient.name} · DUI: {patient.id_num}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setModal('consulta')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-amber hover:opacity-90 shadow-sm transition-all cursor-pointer"
          >
            <Icon name="add" size={14} color="white" /> Nueva consulta
          </button>
        </div>
      </div>

      {avisoHistorial && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{avisoHistorial}</span>
          <button
            onClick={reintentarHistorial}
            className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {/* ── Datos Personales ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
              <button
                className="flex items-center gap-3 flex-1 text-left cursor-pointer"
                onClick={() => toggle('datos')}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-surface text-doc-blue">
                  <Icon name="person" size={16} />
                </div>
                <span className="font-semibold text-slate-700 text-sm font-outfit">Datos Personales</span>
              </button>
              <button
                onClick={() => setEditingDatos(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-doc-surface text-doc-blue hover:bg-slate-200/80 transition-colors cursor-pointer"
              >
                <Icon name="edit" size={13} /> Editar
              </button>
              <button
                onClick={() => toggle('datos')}
                aria-label="Expandir Datos Personales"
                className={`text-slate-400 transition-transform cursor-pointer ${
                  expanded.includes('datos') ? 'rotate-180' : ''
                }`}
              >
                <Icon name="chevron_down" size={18} />
              </button>
            </div>

            {expanded.includes('datos') && (
              <div className="px-5 pb-5 border-t border-slate-100">
                {editingDatos ? (
                  <div className="grid grid-cols-2 gap-3 pt-4">
                    {([
                      ['nombre', 'Nombre completo', patient.name],
                      ['nacimiento', 'Fecha de nacimiento', patient.born],
                      ['telefono', 'Teléfono', patient.phone],
                      ['dui', 'Identificación', patient.id_num],
                      ['sangre', 'Tipo sanguíneo', patient.blood],
                      ['email', 'Email', patient.email],
                    ] as const).map(([campo, rotulo, valor]) => (
                      <div key={campo}>
                        <label htmlFor={idDato(campo)} className={labelDatoClass}>
                          {rotulo}
                        </label>
                        <input
                          id={idDato(campo)}
                          defaultValue={valor}
                          className={inputDatoClass}
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label htmlFor={idDato('direccion')} className={labelDatoClass}>
                        Dirección
                      </label>
                      <input
                        id={idDato('direccion')}
                        defaultValue={patient.address}
                        className={inputDatoClass}
                      />
                    </div>
                    <div className="col-span-2 flex gap-2 mt-2">
                      <button
                        onClick={() => setEditingDatos(false)}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => setEditingDatos(false)}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
                      >
                        Guardar cambios
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-4">
                    {[
                      ['Nombre completo', patient.name],
                      ['Fecha de nacimiento', patient.born],
                      ['Edad', `${patient.age} años`],
                      ['Sexo', patient.sex],
                      ['Teléfono', patient.phone],
                      ['Identificación', patient.id_num],
                      ['Tipo sanguíneo', patient.blood],
                      ['Email', patient.email],
                      ['Dirección', patient.address],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span className="text-xs text-slate-400 uppercase tracking-wider">{k}</span>
                        <p className="text-sm font-medium text-slate-800 mt-0.5">{v}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Secciones sin endpoint: se muestra el hueco, no relleno ── */}
          <SeccionSinRegistro
            icon="shield"
            titulo="Historial de Alergias"
            vacio="No hay alergias registradas."
            loQueFalta="alergias"
            expanded={expanded.includes('alergias')}
            onToggle={() => toggle('alergias')}
          />

          <SeccionSinRegistro
            icon="history"
            titulo="Enfermedades Crónicas"
            vacio="No hay enfermedades crónicas registradas."
            loQueFalta="enfermedades crónicas"
            expanded={expanded.includes('enfermedades')}
            onToggle={() => toggle('enfermedades')}
          />

          <SeccionSinRegistro
            icon="patients"
            titulo="Condiciones Hereditarias"
            vacio="No hay antecedentes hereditarios registrados."
            loQueFalta="antecedentes hereditarios"
            expanded={expanded.includes('hereditarias')}
            onToggle={() => toggle('hereditarias')}
          />

          <SeccionSinRegistro
            icon="vitals"
            titulo="Hábitos y Estilo de Vida"
            vacio="No hay hábitos registrados."
            loQueFalta="hábitos ni estilo de vida"
            expanded={expanded.includes('habitos')}
            onToggle={() => toggle('habitos')}
          />

          {/* ── Consultas Médicas (GET /consultas?pacienteId=) ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-doc-blue to-doc-blue-light text-white">
              <h3 className="font-bold text-white font-outfit">Consultas Médicas</h3>
              <div className="flex items-center gap-3">
                {/* El conteo solo se pinta cuando se sabe: «0 consultas»
                    mientras la petición está en vuelo, o después de que
                    fallara, afirma algo del paciente que nadie ha comprobado. */}
                <span className="text-blue-200 text-sm">
                  {cargandoHistorial || errorConsultas ? '—' : plural(consultas.length, 'consulta')}
                </span>
                <button
                  onClick={() => setModal('consulta')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors cursor-pointer"
                >
                  <Icon name="add" size={13} color="white" /> Agregar
                </button>
              </div>
            </div>
            {cargandoHistorial ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">Cargando consultas…</p>
            ) : errorConsultas ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">
                Las consultas de este paciente no se pudieron cargar, así que no se muestran.
              </p>
            ) : consultas.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-400 italic">
                Este paciente todavía no tiene consultas registradas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      {['Fecha', 'Motivo', 'Diagnóstico', 'Estado', 'Medicamentos'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consultas.map((c) => {
                      const medicamentos = medicamentosPorConsulta.get(c.consultaId) ?? []
                      return (
                        <tr key={c.consultaId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {formatearFechaHora(c.fecha)}
                          </td>
                          {/* `motivo` y `diagnostico` PUEDEN venir null (ver
                              `ConsultaDto`): sin `textoOpcional` la columna
                              pinta la palabra «null», que el médico lee como
                              un dato y no como un hueco. */}
                          <td className="px-4 py-3 text-sm text-slate-800 max-w-[160px] truncate font-medium">
                            {textoOpcional(c.motivo)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 max-w-[160px] truncate">
                            {textoOpcional(c.diagnostico)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge color={COLOR_DE_ESTADO[c.estado]}>
                              {ETIQUETA_DE_ESTADO[c.estado]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {medicamentos.length === 0 ? (
                              <span className="text-sm text-slate-400">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {/* La clave cae al índice: el mismo
                                    medicamento puede repetirse en dos recetas
                                    de la misma consulta. */}
                                {medicamentos.map((m, i) => (
                                  <Badge key={`${m}-${i}`} color="blue">
                                    {m}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Recetas Emitidas (GET /prescripciones?pacienteId=) ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white">
              <h3 className="font-bold text-white font-outfit">Recetas Emitidas</h3>
              <span className="text-purple-200 text-sm">
                {cargandoHistorial || errorRecetas ? '—' : plural(recetas.length, 'receta')}
              </span>
            </div>
            {cargandoHistorial ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">Cargando recetas…</p>
            ) : errorRecetas ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">
                Las recetas de este paciente no se pudieron cargar, así que no se muestran.
              </p>
            ) : recetas.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-400 italic">
                Este paciente todavía no tiene recetas emitidas.
              </p>
            ) : (
              <div className="px-5 py-4 space-y-4">
                {recetas.map((rx) => (
                  <div key={rx.prescripcionId} className="rounded-xl border border-slate-100 p-4">
                    <p className="font-semibold text-slate-800 text-sm font-outfit">
                      Receta #{rx.prescripcionId}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatearFechaHora(rx.fecha)} · {nombreDeMedicoQueReceta(rx)} · Consulta #
                      {rx.consultaId}
                    </p>
                    <div className="overflow-x-auto mt-3">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {['Medicamento', 'Dosis', 'Frecuencia', 'Duración'].map((h) => (
                              <th
                                key={h}
                                className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider pr-6"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {rx.medicamentos.map((m) => (
                            <tr key={m.id}>
                              <td className="py-2.5 text-sm font-medium text-slate-800 pr-6">
                                {m.medicamento}
                              </td>
                              {/* dosis, frecuencia y duración son opcionales
                                  al crear, así que vuelven null. */}
                              <td className="py-2.5 text-xs font-mono text-slate-600 pr-6">
                                {textoOpcional(m.dosis)}
                              </td>
                              <td className="py-2.5 text-sm text-slate-600 pr-6">
                                {textoOpcional(m.frecuencia)}
                              </td>
                              <td className="py-2.5 text-sm text-slate-600">
                                {textoOpcional(m.duracion)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Ficha lateral ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/80">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-doc-surface text-doc-blue shadow-xs">
                <Icon name="person" size={22} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm font-outfit">{patient.name}</p>
                <p className="text-xs text-slate-400">ID: {patient.id_num}</p>
              </div>
            </div>

            {/* Se fue la etiqueta verde «Activo»: era un literal fijo, no un
                estado del paciente. El backend no devuelve nada parecido —igual
                que la columna «Estado» que se retiró de Usuarios—, así que
                pintarla era afirmar algo que nadie había comprobado.

                Solo quedan los dos contadores que salen de una petición real.
                Los de alergias, enfermedades crónicas y hábitos se fueron con
                sus datos: un «0» grande junto a «Alergias» se lee como «no
                tiene ninguna», que es exactamente la afirmación peligrosa. */}
            {[
              ['Consultas registradas', cargandoHistorial || errorConsultas ? '—' : consultas.length, 'text-slate-800'],
              ['Recetas emitidas', cargandoHistorial || errorRecetas ? '—' : recetas.length, 'text-doc-blue'],
            ].map(([lbl, val, colClass]) => (
              <div
                key={String(lbl)}
                className="py-3 border-b border-slate-100 last:border-0 text-center"
              >
                <p className={`text-2xl font-bold font-outfit ${colClass}`}>{val}</p>
                <p className="text-xs text-slate-400 mt-0.5">{lbl}</p>
              </div>
            ))}
          </div>

          {/* Signos vitales: tampoco hay endpoint. El botón «Actualizar» se
              retiró por lo mismo que los «Agregar»; lo que había pintado aquí
              venía de `vitals` de la maqueta, con un «Registrado: 10 ago 2026 ·
              Enf. María López» idéntico para todo paciente. */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/80">
            <h4 className="font-bold text-slate-800 text-sm font-outfit mb-3">
              Últimos Signos Vitales
            </h4>
            <p className="text-sm text-slate-500 mb-3">No hay signos vitales registrados.</p>
            <AvisoSinRegistro loQueFalta="signos vitales" />
          </div>
        </div>
      </div>

      {/* Nueva Consulta: el único formulario que queda, porque es el único que
          llega al backend (POST /consultas). */}
      <Modal
        isOpen={modal === 'consulta'}
        onClose={closeModal}
        title="Nueva Consulta Médica"
        subtitle="Evaluación y prescripción farmacológica"
        icon="consultas"
        headerGradient="bg-gradient-to-r from-doc-amber to-doc-amber-dark"
        maxWidth="lg"
      >
        {/* La consulta que devuelve el servidor se prepone tal cual: la lista
            ya es de `ConsultaDto`, así que no hay que adaptarla a ningún tipo
            de maqueta. Los medicamentos aparecerán en su fila en cuanto se le
            emita una receta desde /prescripciones. */}
        <ConsultationForm
          pacientes={[{ personaId: Number(patient.id), nombre: patient.name }]}
          pacienteIdPorDefecto={Number(patient.id)}
          onGuardada={(c) => {
            setConsultas((prev) => [c, ...prev])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>
    </div>
  )
}

/** «1 consulta» / «3 consultas». */
function plural(cantidad: number, singular: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : `${singular}s`}`
}

/**
 * Antepone QUÉ se estaba cargando al motivo que dio el servidor.
 *
 * Mismo criterio que en (portal)/consultas/page.tsx: aquí conviven dos
 * peticiones y el aviso puede juntar las dos, así que «Error del servidor
 * (500).» a secas no diría si lo que falta son las consultas o las recetas. Se
 * AÑADE contexto, no se reemplaza el motivo del backend.
 */
function describir(contexto: string, causa: unknown): string {
  const motivo = causa instanceof Error && causa.message ? causa.message : null
  return motivo ? `${contexto}: ${motivo}` : `${contexto}.`
}
