'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Alergia,
  Enfermedad,
  Hereditaria,
  Habito,
  Vital,
  Consultation,
  IconName,
  Patient,
} from '@/types'
import {
  vitals as initialVitals,
  consultations as initialConsultations,
} from '@/data/mockData'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import { obtenerPaciente } from '@/services/pacientes'
import { pacienteDtoAPatient } from '@/lib/pacienteAdapter'

// Modular Forms
import { AllergyForm } from '@/components/forms/AllergyForm'
import { ChronicForm } from '@/components/forms/ChronicForm'
import { HereditaryForm } from '@/components/forms/HereditaryForm'
import { HabitForm } from '@/components/forms/HabitForm'
import { VitalsForm } from '@/components/forms/VitalsForm'
import { ConsultationForm } from '@/components/forms/ConsultationForm'
import { formatearFechaHora, nombreDeMedico, textoOpcional } from '@/services/consultas'

type ModalType =
  | 'alergia'
  | 'enfermedad'
  | 'hereditaria'
  | 'habito'
  | 'vitales'
  | 'consulta'
  | null

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

interface SectionHeaderProps {
  icon: IconName
  label: string
  onAdd: () => void
  expanded: boolean
  onToggle: () => void
  addLabel: string
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  label,
  onAdd,
  expanded,
  onToggle,
  addLabel,
}) => (
  <div className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
    <button className="flex items-center gap-3 flex-1 text-left cursor-pointer" onClick={onToggle}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-surface text-doc-blue">
        <Icon name={icon} size={16} />
      </div>
      <span className="font-semibold text-slate-700 text-sm font-outfit">{label}</span>
    </button>
    <button
      onClick={(e) => {
        e.stopPropagation()
        onAdd()
      }}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-doc-surface text-doc-blue hover:bg-slate-200/80 transition-colors cursor-pointer"
    >
      <Icon name="add" size={13} /> {addLabel}
    </button>
    <button
      onClick={onToggle}
      className={`text-slate-400 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
      aria-label="Expandir sección"
    >
      <Icon name="chevron_down" size={18} />
    </button>
  </div>
)

export default function ExpedienteDetailPage() {
  const params = useParams()
  const patientId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const [patient, setPatient] = useState<Patient | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noEncontrado, setNoEncontrado] = useState(false)

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargarPaciente()
  }, [cargarPaciente])

  const [expanded, setExpanded] = useState<string[]>(['datos'])
  const [modal, setModal] = useState<ModalType>(null)
  const toggle = (s: string) =>
    setExpanded((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  // Dynamic state records
  const [alergias, setAlergias] = useState<Alergia[]>([
    { nombre: 'Penicilina', tipo: 'Medicamento', reaccion: 'Urticaria, angioedema', severidad: 'Alta' },
    { nombre: 'Sulfonamidas', tipo: 'Medicamento', reaccion: 'Erupción cutánea', severidad: 'Moderada' },
  ])
  const [enfermedades, setEnfermedades] = useState<Enfermedad[]>([
    { nombre: 'Hipertensión arterial', desde: '2020', tratamiento: 'Losartán 50mg' },
  ])
  const [hereditarias, setHereditarias] = useState<Hereditaria[]>([
    { condicion: 'Diabetes tipo 2', parentesco: 'Padre', observaciones: 'Diagnosticado a los 55 años' },
  ])
  const [habitos, setHabitos] = useState<Habito[]>([
    { tipo: 'Actividad física', descripcion: '3 veces por semana, 30 min', nivel: 'Moderado' },
  ])
  const [patientVitals, setPatientVitals] = useState<Vital[]>(initialVitals)
  const [patientConsultations, setPatientConsultations] = useState<Consultation[]>(initialConsultations)
  const [editingDatos, setEditingDatos] = useState(false)

  const closeModal = () => setModal(null)

  const severityColor: Record<string, 'red' | 'yellow' | 'green'> = {
    Alta: 'red',
    Moderada: 'yellow',
    Baja: 'green',
  }

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

          {/* ── Historial de Alergias ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <SectionHeader
              icon="shield"
              label="Historial de Alergias"
              addLabel="Agregar"
              expanded={expanded.includes('alergias')}
              onToggle={() => toggle('alergias')}
              onAdd={() => setModal('alergia')}
            />
            {expanded.includes('alergias') && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
                {alergias.length === 0 && <p className="text-sm text-slate-400">Sin alergias registradas.</p>}
                {alergias.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-800 text-sm">{a.nombre}</span>
                        <Badge color={severityColor[a.severidad] || 'gray'}>{a.severidad}</Badge>
                        <span className="text-xs text-slate-400">{a.tipo}</span>
                      </div>
                      <p className="text-xs text-slate-500">Reacción: {a.reaccion}</p>
                    </div>
                    <button
                      onClick={() => setAlergias((prev) => prev.filter((_, j) => j !== i))}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-all cursor-pointer"
                      title="Eliminar"
                    >
                      <Icon name="delete" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Enfermedades Crónicas ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <SectionHeader
              icon="history"
              label="Enfermedades Crónicas"
              addLabel="Agregar"
              expanded={expanded.includes('enfermedades')}
              onToggle={() => toggle('enfermedades')}
              onAdd={() => setModal('enfermedad')}
            />
            {expanded.includes('enfermedades') && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
                {enfermedades.length === 0 && (
                  <p className="text-sm text-slate-400">Sin enfermedades registradas.</p>
                )}
                {enfermedades.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-800 text-sm">{e.nombre}</span>
                        <span className="text-xs text-slate-400">Desde {e.desde}</span>
                      </div>
                      <p className="text-xs text-slate-500">Tratamiento: {e.tratamiento}</p>
                    </div>
                    <button
                      onClick={() => setEnfermedades((prev) => prev.filter((_, j) => j !== i))}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-all cursor-pointer"
                      title="Eliminar"
                    >
                      <Icon name="delete" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Condiciones Hereditarias ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <SectionHeader
              icon="patients"
              label="Condiciones Hereditarias"
              addLabel="Agregar"
              expanded={expanded.includes('hereditarias')}
              onToggle={() => toggle('hereditarias')}
              onAdd={() => setModal('hereditaria')}
            />
            {expanded.includes('hereditarias') && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
                {hereditarias.length === 0 && (
                  <p className="text-sm text-slate-400">Sin condiciones hereditarias registradas.</p>
                )}
                {hereditarias.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-800 text-sm">{h.condicion}</span>
                        <Badge color="blue">{h.parentesco}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{h.observaciones}</p>
                    </div>
                    <button
                      onClick={() => setHereditarias((prev) => prev.filter((_, j) => j !== i))}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-all cursor-pointer"
                      title="Eliminar"
                    >
                      <Icon name="delete" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Hábitos y Estilo de Vida ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <SectionHeader
              icon="vitals"
              label="Hábitos y Estilo de Vida"
              addLabel="Agregar"
              expanded={expanded.includes('habitos')}
              onToggle={() => toggle('habitos')}
              onAdd={() => setModal('habito')}
            />
            {expanded.includes('habitos') && (
              <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
                {habitos.length === 0 && <p className="text-sm text-slate-400">Sin hábitos registrados.</p>}
                {habitos.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-slate-800 text-sm">{h.tipo}</span>
                        <Badge color="green">{h.nivel}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{h.descripcion}</p>
                    </div>
                    <button
                      onClick={() => setHabitos((prev) => prev.filter((_, j) => j !== i))}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-all cursor-pointer"
                      title="Eliminar"
                    >
                      <Icon name="delete" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Consultas Médicas ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-doc-blue to-doc-blue-light text-white">
              <h3 className="font-bold text-white font-outfit">Consultas Médicas</h3>
              <div className="flex items-center gap-3">
                <span className="text-blue-200 text-sm">{patientConsultations.length} consultas</span>
                <button
                  onClick={() => setModal('consulta')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/20 text-white hover:bg-white/30 transition-colors cursor-pointer"
                >
                  <Icon name="add" size={13} color="white" /> Agregar
                </button>
              </div>
            </div>
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
                  {patientConsultations.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{c.date}</td>
                      <td className="px-4 py-3 text-sm text-slate-800 max-w-[160px] truncate font-medium">
                        {c.reason}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[160px] truncate">{c.diagnosis}</td>
                      <td className="px-4 py-3">
                        <Badge color="green">{c.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.meds.map((m) => (
                            <Badge key={m} color="blue">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right Patient Summary Sidebar ── */}
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

            <div className="w-full py-2 rounded-xl text-center text-sm font-bold text-white mb-4 bg-emerald-500 shadow-2xs">
              Activo
            </div>

            {[
              ['Alergias', alergias.length, 'text-red-500'],
              ['Enfermedades crónicas', enfermedades.length, 'text-doc-blue'],
              ['Hábitos registrados', habitos.length, 'text-emerald-600'],
              ['Consultas realizadas', patientConsultations.length, 'text-slate-800'],
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

          {/* Latest vitals card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/80">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-slate-800 text-sm font-outfit">Últimos Signos Vitales</h4>
              <button
                onClick={() => setModal('vitales')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-doc-surface text-doc-blue hover:bg-slate-200/80 transition-colors cursor-pointer"
              >
                <Icon name="add" size={12} /> Actualizar
              </button>
            </div>
            {patientVitals[0] && (
              <div className="space-y-2">
                {[
                  ['Peso', patientVitals[0].weight],
                  ['Talla', patientVitals[0].height],
                  ['Temperatura', patientVitals[0].temp],
                  ['Presión', patientVitals[0].bp],
                  ['Pulso', patientVitals[0].pulse],
                  ['Saturación O₂', patientVitals[0].sat],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1.5 border-b border-slate-50 text-xs">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-semibold text-slate-700">{v}</span>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400 mt-2">
                  Registrado: {patientVitals[0].date} · {patientVitals[0].nurse}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ MODALS CON FORMULARIOS MODULARES ══ */}

      {/* Agregar Alergia */}
      <Modal
        isOpen={modal === 'alergia'}
        onClose={closeModal}
        title="Agregar Alergia"
        subtitle="Registro de reacciones alérgicas"
        icon="shield"
        headerGradient="bg-gradient-to-r from-red-500 to-red-600"
      >
        <AllergyForm
          onSubmit={(a) => {
            setAlergias((prev) => [...prev, a])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>

      {/* Agregar Enfermedad Crónica */}
      <Modal
        isOpen={modal === 'enfermedad'}
        onClose={closeModal}
        title="Agregar Enfermedad Crónica"
        subtitle="Diagnósticos previos y tratamientos continuos"
        icon="history"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
      >
        <ChronicForm
          onSubmit={(e) => {
            setEnfermedades((prev) => [...prev, e])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>

      {/* Agregar Condición Hereditaria */}
      <Modal
        isOpen={modal === 'hereditaria'}
        onClose={closeModal}
        title="Agregar Condición Hereditaria"
        subtitle="Antecedentes médicos familiares"
        icon="patients"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
      >
        <HereditaryForm
          onSubmit={(h) => {
            setHereditarias((prev) => [...prev, h])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>

      {/* Agregar Hábito */}
      <Modal
        isOpen={modal === 'habito'}
        onClose={closeModal}
        title="Agregar Hábito de Vida"
        subtitle="Estilo de vida, nutrición y actividad física"
        icon="vitals"
        headerGradient="bg-gradient-to-r from-emerald-500 to-emerald-600"
      >
        <HabitForm
          onSubmit={(hb) => {
            setHabitos((prev) => [...prev, hb])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>

      {/* Actualizar Signos Vitales */}
      <Modal
        isOpen={modal === 'vitales'}
        onClose={closeModal}
        title="Actualizar Signos Vitales"
        subtitle="Toma y registro de constantes vitales"
        icon="vitals"
        headerGradient="bg-gradient-to-r from-doc-teal to-teal-700"
      >
        <VitalsForm
          defaultPatientId={patient.id}
          onSubmit={(v) => {
            setPatientVitals((prev) => [v as Vital, ...prev])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>

      {/* Nueva Consulta */}
      <Modal
        isOpen={modal === 'consulta'}
        onClose={closeModal}
        title="Nueva Consulta Médica"
        subtitle="Evaluación y prescripción farmacológica"
        icon="consultas"
        headerGradient="bg-gradient-to-r from-doc-amber to-doc-amber-dark"
        maxWidth="lg"
      >
        {/* El formulario ya guarda contra `POST /consultas`; esta lista sigue
            siendo de maqueta, así que la consulta confirmada por el servidor se
            adapta al tipo `Consultation` para que se vea de inmediato. Los
            medicamentos van vacíos a propósito: ahora se recetan aparte, desde
            /prescripciones, sobre la consulta ya registrada. */}
        <ConsultationForm
          pacientes={[{ personaId: Number(patient.id), nombre: patient.name }]}
          pacienteIdPorDefecto={Number(patient.id)}
          onGuardada={(c) => {
            setPatientConsultations((prev) => [
              {
                date: formatearFechaHora(c.fecha),
                // `reason` y `diagnosis` son `string` en el tipo `Consultation`
                // de la maqueta, pero `motivo` y `diagnostico` PUEDEN venir
                // null del backend. `textoOpcional` es lo que hace honesto ese
                // `string`: sin él, la tarjeta del expediente pinta la palabra
                // «null» donde el médico espera leer por qué vino el paciente.
                reason: textoOpcional(c.motivo),
                diagnosis: textoOpcional(c.diagnostico),
                status: c.estado === 'FINALIZADA' ? 'Finalizada' : 'Pendiente',
                meds: [],
                doctor: nombreDeMedico(c),
              },
              ...prev,
            ])
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>
    </div>
  )
}
