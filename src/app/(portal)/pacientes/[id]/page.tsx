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
//   · Antecedentes patológicos (HU-12) → GET /antecedentes-patologicos?pacienteId={id}
//   · Condiciones hereditarias (HU-13) → GET /condiciones-hereditarias?pacienteId={id}
//     Las dos cargan dentro de su propia sección (components/clinico) y solo
//     el médico las edita.
//   · Alergias (HU-11) → GET /alergias?pacienteId={id}. Carga en su sección,
//     la editan médico y enfermera, y las severas se destacan además arriba de
//     la ficha (`AvisoDeAlergiasSeveras`).
//   · Hábitos (HU-14) → GET /api/habitos-estilo-de-vida/paciente/{id}. Carga
//     en su sección; registran y editan médico y enfermera, elimina el médico.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Patient } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { EvolucionSignosVitales } from '@/components/clinico/EvolucionSignosVitales'
import { TarjetaUltimosSignos } from '@/components/clinico/TarjetaUltimosSignos'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import { obtenerPaciente, type PacienteDto } from '@/services/pacientes'
import { pacienteDtoAPatient } from '@/lib/pacienteAdapter'
import { ConsultationForm } from '@/components/forms/ConsultationForm'
import { DetalleDeConsulta } from '@/components/clinico/DetalleDeConsulta'
import { FiltrosDeConsultas } from '@/components/clinico/FiltrosDeConsultas'
import {
  AvisoDeAnulacion,
  BotonAnularReceta,
  BotonImprimirReceta,
} from '@/components/clinico/AccionesDeReceta'
import { TablaDeMedicamentos } from '@/components/clinico/TablaDeMedicamentos'
import { SeccionAntecedentes } from '@/components/clinico/SeccionAntecedentes'
import { SeccionCondicionesHereditarias } from '@/components/clinico/SeccionCondicionesHereditarias'
import { SeccionHabitos } from '@/components/clinico/SeccionHabitos'
import {
  AvisoDeAlergiasSeveras,
  SeccionAlergias,
  type AlergiasConocidas,
} from '@/components/clinico/SeccionAlergias'
import { useAppContext } from '@/context/AppContext'
import {
  filtrarConsultas,
  formatearFechaHora,
  listarConsultas,
  medicosDeConsultas,
  nombreDeClinica,
  nombreDeMedico,
  textoOpcional,
  type ConsultaDto,
  type FiltroDeConsultas,
} from '@/services/consultas'
import {
  listarTomas,
  ultimaToma,
  type SignosVitalesDto,
} from '@/services/signosVitales'
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

export default function ExpedienteDetailPage() {
  const params = useParams()
  const patientId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)
  // Antecedentes y condiciones hereditarias los registra solo el médico; la
  // enfermera y el administrador los consultan (HU-12 c3, HU-13 c4).
  const { user } = useAppContext()
  const esMedico = user ? user.roles.includes('medico') : false
  const esAdministrador = user ? user.roles.includes('Administrador') : false
  // Las alergias, en cambio, las registra también la enfermera (HU-11): suele
  // ser quien primero oye «soy alérgico a…». El administrador solo consulta.
  const puedeRegistrarAlergias = user
    ? user.roles.includes('medico') || user.roles.includes('enfermera')
    : false
  // Lo que la sección de alergias sabe, para el aviso de arriba (HU-11 c2).
  const [alergiasConocidas, setAlergiasConocidas] = useState<AlergiasConocidas>(undefined)

  const [patient, setPatient] = useState<Patient | null>(null)
  // Quién lo registró, dónde y quién lo tocó por última vez (HU-07 y HU-09,
  // criterio 4). Va aparte de `patient` porque el adaptador al tipo de la
  // maqueta no lleva estos campos.
  const [trazabilidad, setTrazabilidad] = useState<Pick<
    PacienteDto,
    'registradoPor' | 'clinicaRegistro' | 'creadoEn' | 'modificadoPor' | 'modificadoEn'
  > | null>(null)
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

  // Signos vitales: `null` significa que el paciente aún no tiene ninguna toma
  // —el backend responde 204, no 404, porque eso no es un error— y es distinto
  // de `errorVitales`, que significa que no se pudo saber. La tarjeta dice
  // cosas diferentes en cada caso: un hueco no es una falla.
  const [ultimosVitales, setUltimosVitales] = useState<SignosVitalesDto | null>(null)
  // El histórico completo, para la gráfica de evolución (HU-18). Va aparte
  // de `ultimosVitales`: la tarjeta necesita la última toma y la gráfica
  // necesita la serie, y pedir la serie para sacar de ella la última haría
  // que la tarjeta dependiera de que la petición grande llegue.
  const [historicoVitales, setHistoricoVitales] = useState<SignosVitalesDto[]>([])
  const [errorVitales, setErrorVitales] = useState<string | null>(null)

  const cargarPaciente = useCallback(async () => {
    setError(null)
    setNoEncontrado(false)
    try {
      const paciente = await obtenerPaciente(Number(patientId))
      setPatient(pacienteDtoAPatient(paciente))
      setTrazabilidad({
        registradoPor: paciente.registradoPor,
        clinicaRegistro: paciente.clinicaRegistro,
        creadoEn: paciente.creadoEn,
        modificadoPor: paciente.modificadoPor,
        modificadoEn: paciente.modificadoEn,
      })
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
    const [resConsultas, resRecetas, resVitales, resHistorico] = await Promise.allSettled([
      listarConsultas(id),
      listarPrescripcionesDePaciente(id),
      ultimaToma(id),
      // 60 tomas: con una medición semanal cubre algo más de un año, que es el
      // rango más amplio que ofrece la gráfica. Pedir todas sin límite haría
      // que un paciente con años de seguimiento cargara el expediente entero
      // para dibujar doce puntos.
      listarTomas(id, 60),
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

    if (resVitales.status === 'fulfilled') {
      setUltimosVitales(resVitales.value)
      setErrorVitales(null)
    } else {
      setUltimosVitales(null)
      setErrorVitales(describir('No se pudieron cargar los signos vitales', resVitales.reason))
    }

    // La gráfica se trata aparte y sin mensaje de error propio: si falla, la
    // tarjeta de la última toma puede haber llegado bien, y llenar la pantalla
    // de errores por una gráfica que no se pudo dibujar es ruido. Sin datos,
    // el propio componente explica que no hay suficientes.
    setHistoricoVitales(resHistorico.status === 'fulfilled' ? resHistorico.value : [])

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
    setErrorVitales(null)
    void cargarHistorial()
  }

  const [expanded, setExpanded] = useState<string[]>(['datos'])
  const [modal, setModal] = useState<'consulta' | null>(null)
  // HU-20 c2: el historial de UN paciente llega completo y se filtra aquí, sin
  // volver al servidor en cada cambio de fecha (el listado general de
  // /consultas sí filtra en el servidor). Los médicos del selector son los que
  // aparecen en este historial.
  const [filtroConsultas, setFiltroConsultas] = useState<FiltroDeConsultas>({})
  const [consultaAbierta, setConsultaAbierta] = useState<ConsultaDto | null>(null)
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

  const consultasVisibles = useMemo(
    () => filtrarConsultas(consultas, filtroConsultas),
    [consultas, filtroConsultas],
  )
  const medicosDelHistorial = useMemo(() => medicosDeConsultas(consultas), [consultas])
  const hayFiltroDeConsultas = Boolean(
    filtroConsultas.desde || filtroConsultas.hasta || filtroConsultas.medicoId !== undefined,
  )

  // HU-22 c3: la receta anulada se queda en la lista, marcada.
  const alAnularReceta = (anulada: PrescripcionDto) =>
    setRecetas((prev) => prev.map((r) => (r.prescripcionId === anulada.prescripcionId ? anulada : r)))

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

      {/* HU-11 c2: las alergias severas, arriba y en rojo, sin tener que
          desplegar nada. */}
      <AvisoDeAlergiasSeveras alergias={alergiasConocidas} />

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

          {/* ── HU-07 y HU-09, criterio 4: trazabilidad del registro.
              El hueco honesto: en un paciente anterior a la trazabilidad se
              dice que no consta, no se inventa un autor. ── */}
          {trazabilidad && (
            <div
              aria-label="Trazabilidad del registro"
              className="bg-white rounded-2xl shadow-sm border border-slate-100/80 px-5 py-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-surface text-doc-blue">
                  <Icon name="history" size={16} />
                </div>
                <span className="font-semibold text-slate-700 text-sm font-outfit">
                  Trazabilidad del registro
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {[
                  ['Registrado por', trazabilidad.registradoPor ?? 'No consta'],
                  ['Clínica de registro', trazabilidad.clinicaRegistro ?? 'No consta'],
                  ['Fecha de registro', formatearFechaHora(trazabilidad.creadoEn)],
                  ['Última modificación por', trazabilidad.modificadoPor ?? 'Sin modificaciones'],
                  [
                    'Fecha de última modificación',
                    trazabilidad.modificadoEn
                      ? formatearFechaHora(trazabilidad.modificadoEn)
                      : 'Sin modificaciones',
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-xs text-slate-400 uppercase tracking-wider">{k}</span>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HU-11: alergias (GET /alergias?pacienteId=) ── */}
          <SeccionAlergias
            pacienteId={Number(patientId)}
            puedeEditar={puedeRegistrarAlergias}
            expanded={expanded.includes('alergias')}
            onToggle={() => toggle('alergias')}
            onCambio={setAlergiasConocidas}
          />

          {/* ── HU-12 y HU-13: secciones con backend ──
              Antecedentes patológicos reemplaza a «Enfermedades Crónicas»: una
              enfermedad crónica es un antecedente de tipo Enfermedad en
              estado Activo. */}
          <SeccionAntecedentes
            pacienteId={Number(patientId)}
            puedeEditar={esMedico}
            expanded={expanded.includes('antecedentes')}
            onToggle={() => toggle('antecedentes')}
          />

          <SeccionCondicionesHereditarias
            pacienteId={Number(patientId)}
            puedeEditar={esMedico}
            expanded={expanded.includes('hereditarias')}
            onToggle={() => toggle('hereditarias')}
          />

          {/* ── HU-14: hábitos (GET /api/habitos-estilo-de-vida/paciente/{id}).
              Registran y editan médico y enfermera, como las alergias;
              eliminar es solo del médico. ── */}
          <SeccionHabitos
            pacienteId={Number(patientId)}
            puedeEditar={puedeRegistrarAlergias}
            puedeEliminar={esMedico}
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
              <>
              <div className="px-5 pt-4">
                <FiltrosDeConsultas
                  filtro={filtroConsultas}
                  medicos={medicosDelHistorial}
                  onChange={setFiltroConsultas}
                />
              </div>
              {consultasVisibles.length === 0 && hayFiltroDeConsultas && (
                <p className="px-5 pb-8 text-center text-sm text-slate-400 italic">
                  Ninguna consulta cumple estos filtros.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      {['Fecha', 'Médico', 'Clínica', 'Motivo', 'Diagnóstico', 'Estado', 'Medicamentos', ''].map((h) => (
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
                    {consultasVisibles.map((c) => {
                      const medicamentos = medicamentosPorConsulta.get(c.consultaId) ?? []
                      return (
                        <tr key={c.consultaId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {formatearFechaHora(c.fecha)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                            {nombreDeMedico(c)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {nombreDeClinica(c) ?? (
                              <span className="text-slate-400 italic">Sin sede</span>
                            )}
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
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setConsultaAbierta(c)}
                              aria-label={`Abrir la consulta del ${formatearFechaHora(c.fecha)}`}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-doc-surface text-doc-blue hover:bg-slate-200/80 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
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
                  <div
                    key={rx.prescripcionId}
                    className={`rounded-xl border p-4 ${
                      rx.estado === 'ANULADA' ? 'border-red-200 bg-red-50/30' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm font-outfit">
                          Receta #{rx.prescripcionId}{' '}
                          {rx.estado === 'ANULADA' && <Badge color="red">Anulada</Badge>}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatearFechaHora(rx.fecha)} · {nombreDeMedicoQueReceta(rx)} · Consulta #
                          {rx.consultaId}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <BotonImprimirReceta prescripcionId={rx.prescripcionId} />
                        {rx.estado === 'EMITIDA' && (esMedico || esAdministrador) && (
                          <BotonAnularReceta
                            prescripcionId={rx.prescripcionId}
                            onAnulada={alAnularReceta}
                          />
                        )}
                      </div>
                    </div>
                    <div className="mt-3">
                      <TablaDeMedicamentos medicamentos={rx.medicamentos} />
                    </div>
                    <AvisoDeAnulacion receta={rx} />
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

          {/* Signos vitales: ESTE SÍ tiene endpoint (GET /signos-vitales/ultima).
              El detalle (qué botones no hay, qué se resalta en rojo, el IMC)
              vive en TarjetaUltimosSignos. */}
          <TarjetaUltimosSignos ultimosVitales={ultimosVitales} errorVitales={errorVitales} />

          {/* La evolución va DEBAJO de la última toma y no en su lugar: son dos
              preguntas distintas. «¿Cómo está hoy?» la responde la tarjeta de
              arriba; «¿hacia dónde va?» sólo se ve en la serie, y es lo que el
              médico viene a mirar en un paciente crónico (HU-18).

              Se monta aunque no haya datos suficientes: el propio componente
              explica cuántas tomas faltan, que es más útil que hacerlo
              desaparecer y dejar al médico preguntándose si existe. */}
          <div className="mt-6">
            <EvolucionSignosVitales tomas={historicoVitales} />
          </div>
        </div>
      </div>

      {/* HU-20 c3: la consulta con todos sus datos y sus recetas; desde aquí se
          emite una receta nueva (HU-19 c5). */}
      <Modal
        isOpen={consultaAbierta !== null}
        onClose={() => setConsultaAbierta(null)}
        title="Consulta médica"
        subtitle="Datos de la consulta y recetas emitidas"
        icon="consultas"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
        maxWidth="2xl"
      >
        {consultaAbierta && (
          <DetalleDeConsulta
            consulta={consultaAbierta}
            onRecetasCambiaron={() => void cargarHistorial()}
          />
        )}
      </Modal>

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
