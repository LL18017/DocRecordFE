'use client'

// ─── Agenda de citas (HU-30, HU-31, HU-32) ──────────────────────────────────
// La agenda de la sede activa, por día o por semana: quién viene, a qué hora,
// con qué médico, en qué clínica y por qué motivo. Desde aquí el personal
// agenda, reprograma, cancela con motivo y marca atendida una cita.
//
// HU-31: el médico la abre en «Mis citas» (sus citas, las resuelve el backend
// por el token) y puede pasar a toda la sede. En sus citas agendadas inicia la
// consulta —que lleva el `citaId` y deja la cita ATENDIDA— y en las que ya
// pasaron sin que el paciente llegara marca «No asistió».
//
// Antes esta pantalla era un aviso de «todavía no disponible»: el backend no
// tenía citas, y después tuvo citas colgadas de cuentas de usuario, que la
// mayoría de los pacientes no tiene. Desde V24 la cita es del paciente del
// expediente y lleva su sede, y esta pantalla se apoya en eso.
//
// QUÉ DECIDE EL SERVIDOR Y QUÉ ESTA PANTALLA. La disponibilidad, la fecha
// pasada, la grilla de 30 minutos y la regla de las 4 horas las valida el
// backend, y sus mensajes (409, 400) se muestran tal cual. Aquí solo se evita
// OFRECER lo que se sabe que va a rechazar: las franjas ya ocupadas del
// médico no aparecen y los botones de cambio se ocultan con menos de 4 horas.
//
// Una cita cancelada no se borra: sigue en la lista, tachada, con su motivo
// (HU-32 c5).

import {
  MAXIMO_MOTIVO_DE_ANULACION,
  MENSAJE_MOTIVO_DE_ANULACION,
  motivoDeAnulacionInvalido,
} from '@/lib/validaciones'
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useAppContext } from '@/context/AppContext'
import { campoBase, hoy, labelClass, mensajeDe, Obligatorio } from '@/components/clinico/SeccionDeExpediente'
import { listarPacientes, type PacienteDto } from '@/services/pacientes'
import {
  admiteCambios,
  agendarCita,
  cancelarCita,
  ETIQUETA_DE_ESTADO,
  horaDe,
  listarAgenda,
  listarFranjasLibres,
  listarMedicosDeClinica,
  listarTiposDeCita,
  marcarAtendida,
  marcarNoAsistio,
  reprogramarCita,
  yaPaso,
  type CitaDto,
  type EstadoDeCita,
  type MedicoDeAgendaDto,
  type TipoDeCitaDto,
} from '@/services/citas'

type Vista = 'dia' | 'semana'
type Alcance = 'mias' | 'sede'

type Dialogo = { tipo: 'agendar' } | { tipo: 'reprogramar'; cita: CitaDto } | { tipo: 'cancelar'; cita: CitaDto }

const COLOR_DE_ESTADO: Record<EstadoDeCita, string> = {
  AGENDADA: 'bg-blue-50 text-doc-blue border-blue-200',
  ATENDIDA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELADA: 'bg-slate-100 text-slate-500 border-slate-200',
  NO_ASISTIO: 'bg-amber-50 text-amber-800 border-amber-300',
}

function fechaLegible(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function moverDia(dia: string, delta: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  const f = new Date(a, m - 1, d + delta)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

/** El lunes de la semana de `dia` (la semana va de lunes a domingo). */
function lunesDe(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  const diaDeSemana = (new Date(a, m - 1, d).getDay() + 6) % 7
  return moverDia(dia, -diaDeSemana)
}

function encabezadoDeDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'short' })
}

function rangoLegible(desde: string, hasta: string): string {
  const [a1, m1, d1] = desde.split('-').map(Number)
  const [a2, m2, d2] = hasta.split('-').map(Number)
  const ini = new Date(a1, m1 - 1, d1).toLocaleDateString('es-SV', { day: 'numeric', month: 'long' })
  const fin = new Date(a2, m2 - 1, d2).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })
  return `Semana del ${ini} al ${fin}`
}

const porHora = (a: CitaDto, b: CitaDto) => a.fechaHora.localeCompare(b.fechaHora)

const botonDeOpcion = (activo: boolean) =>
  `px-3 py-1.5 text-sm font-semibold cursor-pointer ${activo ? 'bg-doc-blue text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`

export default function AgendaPage() {
  const { user, activeClinic } = useAppContext()
  const esMedico = user?.roles.includes('medico') ?? false

  const [dia, setDia] = useState(hoy())
  const [vista, setVista] = useState<Vista>('dia')
  // `null` = lo que toca por rol. Se deriva en vez de fijarlo al montar porque
  // la sesión puede llegar después del primer render.
  const [alcanceElegido, setAlcanceElegido] = useState<Alcance | null>(null)
  const alcance: Alcance = alcanceElegido ?? (esMedico ? 'mias' : 'sede')
  const mias = esMedico && alcance === 'mias'
  const [citas, setCitas] = useState<CitaDto[]>([])
  const [medicos, setMedicos] = useState<MedicoDeAgendaDto[]>([])
  const [tipos, setTipos] = useState<TipoDeCitaDto[]>([])
  const [filtroMedico, setFiltroMedico] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const clinicaId = activeClinic?.id
  const desde = vista === 'semana' ? lunesDe(dia) : dia
  const hasta = vista === 'semana' ? moverDia(desde, 6) : dia
  const diasDeLaSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => moverDia(lunesDe(dia), i)), [dia])

  const cargarCatalogos = useCallback(async () => {
    if (!clinicaId) return
    try {
      const [m, t] = await Promise.all([listarMedicosDeClinica(clinicaId), listarTiposDeCita()])
      setMedicos(m)
      setTipos(t)
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron cargar los médicos y los tipos de cita.'))
    }
  }, [clinicaId])

  const cargarAgenda = useCallback(async () => {
    if (!clinicaId) return
    try {
      setCitas(await listarAgenda(clinicaId, desde, hasta, { mias }))
      setError(null)
    } catch (err) {
      setCitas([])
      setError(mensajeDe(err, 'No se pudo cargar la agenda.'))
    } finally {
      setCargando(false)
    }
  }, [clinicaId, desde, hasta, mias])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al cambiar de día, semana o alcance
    setCargando(true)
    void cargarAgenda()
  }, [cargarAgenda])

  const visibles = useMemo(
    () => (!mias && filtroMedico ? citas.filter((c) => c.medicoId === Number(filtroMedico)) : citas).slice().sort(porHora),
    [citas, filtroMedico, mias],
  )

  const conteo = useMemo(() => {
    const n: Record<EstadoDeCita, number> = { AGENDADA: 0, ATENDIDA: 0, CANCELADA: 0, NO_ASISTIO: 0 }
    visibles.forEach((c) => (n[c.estado] = (n[c.estado] ?? 0) + 1))
    return n
  }, [visibles])

  const alGuardar = (mensaje: string, cita: CitaDto) => {
    setDialogo(null)
    setAviso(mensaje)
    // Si la cita quedó fuera de lo que se ve, se va a su día para que se vea.
    const diaDeLaCita = cita.fechaHora.slice(0, 10)
    if (diaDeLaCita < desde || diaDeLaCita > hasta) setDia(diaDeLaCita)
    else void cargarAgenda()
  }

  // Solo el médico inicia la consulta, y desde sus propias citas: la sesión no
  // trae su id de médico, así que «propias» son las que devolvió «Mis citas».
  const puedeIniciarConsulta = mias
  const paso = vista === 'semana' ? 7 : 1

  const fila = (c: CitaDto, compacta = false) => (
    <FilaDeCita
      key={c.citaId}
      cita={c}
      compacta={compacta}
      puedeIniciarConsulta={puedeIniciarConsulta}
      onReprogramar={() => setDialogo({ tipo: 'reprogramar', cita: c })}
      onCancelar={() => setDialogo({ tipo: 'cancelar', cita: c })}
      onAtendida={(actualizada) => alGuardar(`Cita de ${actualizada.paciente} marcada como atendida.`, actualizada)}
      onNoAsistio={(actualizada) => alGuardar(`Cita de ${actualizada.paciente} marcada como «No asistió».`, actualizada)}
    />
  )

  if (!activeClinic) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 px-6 py-14 text-center">
        <h1 className="text-lg font-bold text-slate-800 font-outfit">Elija una sede para ver su agenda</h1>
        <p className="mt-2 text-sm text-slate-500">La agenda es de una clínica: primero seleccione en cuál trabaja hoy.</p>
        <Link
          href="/select-clinica"
          className="inline-flex mt-6 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90"
        >
          Seleccionar clínica
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Agenda de Citas</h1>
          <p className="text-sm text-slate-500 mt-0.5">{activeClinic.name}</p>
        </div>
        <button
          onClick={() => {
            setAviso(null)
            setDialogo({ tipo: 'agendar' })
          }}
          disabled={medicos.length === 0 || tipos.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="agenda" size={16} color="white" /> Agendar cita
        </button>
      </div>

      {(medicos.length === 0 || tipos.length === 0) && !cargando && !error && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {medicos.length === 0
            ? 'Esta sede no tiene médicos asignados: no hay con quién agendar.'
            : (
              <>
                No hay tipos de cita registrados. El administrador debe crearlos en{' '}
                <Link href="/catalogos" className="font-semibold underline underline-offset-2">
                  Catálogos
                </Link>{' '}
                antes de agendar.
              </>
            )}
        </p>
      )}

      {aviso && (
        <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {aviso}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-100/80 px-4 py-3">
        {esMedico && (
          <div role="group" aria-label="Qué citas ver" className="inline-flex overflow-hidden rounded-xl border-2 border-slate-200">
            <button aria-pressed={mias} onClick={() => setAlcanceElegido('mias')} className={botonDeOpcion(mias)}>
              Mis citas
            </button>
            <button aria-pressed={!mias} onClick={() => setAlcanceElegido('sede')} className={botonDeOpcion(!mias)}>
              Toda la sede
            </button>
          </div>
        )}
        <div role="group" aria-label="Vista de la agenda" className="inline-flex overflow-hidden rounded-xl border-2 border-slate-200">
          <button aria-pressed={vista === 'dia'} onClick={() => setVista('dia')} className={botonDeOpcion(vista === 'dia')}>
            Día
          </button>
          <button aria-pressed={vista === 'semana'} onClick={() => setVista('semana')} className={botonDeOpcion(vista === 'semana')}>
            Semana
          </button>
        </div>
        <button
          onClick={() => setDia(moverDia(dia, -paso))}
          aria-label={vista === 'semana' ? 'Semana anterior' : 'Día anterior'}
          className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-600 text-sm font-semibold cursor-pointer"
        >
          ‹
        </button>
        <input
          type="date"
          aria-label="Día de la agenda"
          value={dia}
          onChange={(e) => e.target.value && setDia(e.target.value)}
          className="border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => setDia(moverDia(dia, paso))}
          aria-label={vista === 'semana' ? 'Semana siguiente' : 'Día siguiente'}
          className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-600 text-sm font-semibold cursor-pointer"
        >
          ›
        </button>
        <button onClick={() => setDia(hoy())} className="text-sm font-semibold text-doc-blue hover:underline cursor-pointer">
          Hoy
        </button>
        <span className="text-sm text-slate-500 first-letter:uppercase">
          {vista === 'semana' ? rangoLegible(desde, hasta) : fechaLegible(dia)}
        </span>
        {!mias && (
          <select
            aria-label="Filtrar por médico"
            value={filtroMedico}
            onChange={(e) => setFiltroMedico(e.target.value)}
            className="w-full sm:w-auto sm:ml-auto border-2 border-slate-200 rounded-xl px-3 py-1.5 text-sm"
          >
            <option value="">Todos los médicos</option>
            {medicos.map((m) => (
              <option key={m.medicoId} value={m.medicoId}>
                {m.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden">
        <div className="flex flex-wrap gap-4 px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500">
          <span>{conteo.AGENDADA} agendadas</span>
          <span>{conteo.ATENDIDA} atendidas</span>
          <span>{conteo.CANCELADA} canceladas</span>
          <span>{conteo.NO_ASISTIO} no asistieron</span>
        </div>
        {cargando ? (
          <p className="px-5 py-8 text-sm text-slate-400">Cargando agenda…</p>
        ) : error ? (
          <div role="alert" className="px-5 py-6 text-sm text-red-700">
            {error}{' '}
            <button onClick={() => void cargarAgenda()} className="font-semibold underline cursor-pointer">
              Reintentar
            </button>
          </div>
        ) : vista === 'semana' ? (
          // Siete columnas, lunes a domingo, en pantallas anchas; por debajo
          // cada día es un bloque de la lista, sin desplazamiento horizontal.
          <div
            role="region"
            aria-label="Citas de la semana"
            className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-7 lg:divide-x lg:divide-y-0"
          >
            {diasDeLaSemana.map((d) => {
              const delDia = visibles.filter((c) => c.fechaHora.slice(0, 10) === d)
              const esHoy = d === hoy()
              return (
                <section key={d} aria-labelledby={`dia-${d}`} className="min-w-0">
                  <h3
                    id={`dia-${d}`}
                    className={`px-3 py-2 text-xs font-bold uppercase tracking-wide ${esHoy ? 'bg-blue-50 text-doc-blue' : 'text-slate-500'}`}
                  >
                    {encabezadoDeDia(d)}
                  </h3>
                  {delDia.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-400">Sin citas</p>
                  ) : (
                    <ul aria-label={`Citas del ${encabezadoDeDia(d)}`} className="divide-y divide-slate-100">
                      {delDia.map((c) => fila(c, true))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        ) : visibles.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No hay citas para este día.</p>
        ) : (
          <ul aria-label="Citas del día" className="divide-y divide-slate-100">
            {visibles.map((c) => fila(c))}
          </ul>
        )}
      </div>

      {dialogo?.tipo === 'agendar' && (
        <Modal isOpen onClose={() => setDialogo(null)} title="Agendar cita" subtitle={activeClinic.name} icon="agenda" maxWidth="lg">
          <FormularioDeAgendar
            clinicaId={activeClinic.id}
            diaInicial={dia >= hoy() ? dia : hoy()}
            medicos={medicos}
            tipos={tipos}
            onAgendada={(c) => alGuardar(`Cita agendada: ${c.paciente}, ${fechaLegible(c.fechaHora.slice(0, 10))} a las ${horaDe(c.fechaHora)}.`, c)}
            onCancelar={() => setDialogo(null)}
          />
        </Modal>
      )}
      {dialogo?.tipo === 'reprogramar' && (
        <Modal isOpen onClose={() => setDialogo(null)} title="Reprogramar cita" subtitle={dialogo.cita.paciente} icon="agenda" maxWidth="md">
          <FormularioDeReprogramar
            cita={dialogo.cita}
            clinicaId={activeClinic.id}
            onReprogramada={(c) => alGuardar(`Cita reprogramada para el ${fechaLegible(c.fechaHora.slice(0, 10))} a las ${horaDe(c.fechaHora)}.`, c)}
            onCancelar={() => setDialogo(null)}
          />
        </Modal>
      )}
      {dialogo?.tipo === 'cancelar' && (
        <Modal isOpen onClose={() => setDialogo(null)} title="Cancelar cita" subtitle={dialogo.cita.paciente} icon="agenda" maxWidth="md">
          <FormularioDeCancelar
            cita={dialogo.cita}
            onCancelada={(c) => alGuardar(`Cita de ${c.paciente} cancelada. La franja quedó libre.`, c)}
            onCancelar={() => setDialogo(null)}
          />
        </Modal>
      )}
    </div>
  )
}

const FilaDeCita: React.FC<{
  cita: CitaDto
  /** En la vista semanal la columna es angosta: todo va apilado. */
  compacta?: boolean
  puedeIniciarConsulta: boolean
  onReprogramar: () => void
  onCancelar: () => void
  onAtendida: (c: CitaDto) => void
  onNoAsistio: (c: CitaDto) => void
}> = ({ cita: c, compacta = false, puedeIniciarConsulta, onReprogramar, onCancelar, onAtendida, onNoAsistio }) => {
  const [marcando, setMarcando] = useState(false)
  const [confirmandoInasistencia, setConfirmandoInasistencia] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelada = c.estado === 'CANCELADA'
  const agendada = c.estado === 'AGENDADA'
  const cambiable = admiteCambios(c)
  // HU-31 c4: «No asistió» solo cuando la hora ya pasó. El backend lo vuelve a
  // validar y, si no cuadra (o no es su cita), su mensaje es el que se ve.
  const pasada = agendada && yaPaso(c)

  const atender = async () => {
    setMarcando(true)
    setError(null)
    try {
      onAtendida(await marcarAtendida(c.citaId))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo marcar la cita como atendida.'))
      setMarcando(false)
    }
  }

  const noAsistio = async () => {
    setMarcando(true)
    setError(null)
    try {
      onNoAsistio(await marcarNoAsistio(c.citaId))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo marcar la inasistencia.'))
      setMarcando(false)
      setConfirmandoInasistencia(false)
    }
  }

  // La consulta se abre con el paciente y la cita: al guardarla, el backend
  // deja la cita ATENDIDA en la misma operación (HU-31 c5).
  const hrefConsulta = `/consultas?${new URLSearchParams({ citaId: String(c.citaId), pacienteId: String(c.pacienteId) })}`

  return (
    <li className={compacta ? 'px-3 py-3' : 'px-5 py-3.5'} aria-label={`Cita de ${c.paciente} a las ${horaDe(c.fechaHora)}`}>
      <div className={compacta ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-start gap-4'}>
        <span
          className={`shrink-0 font-bold font-outfit ${compacta ? 'text-base' : 'w-14 text-lg'} ${
            cancelada ? 'text-slate-400 line-through' : 'text-slate-800'
          }`}
        >
          {horaDe(c.fechaHora)}
        </span>
        <div className="min-w-0 flex-1 break-words">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/pacientes/${c.pacienteId}`} className="text-sm font-semibold text-slate-700 hover:text-doc-blue">
              {c.paciente}
            </Link>
            <span className="text-xs text-slate-400">{c.expediente}</span>
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${COLOR_DE_ESTADO[c.estado] ?? ''}`}>
              {ETIQUETA_DE_ESTADO[c.estado] ?? c.estado}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {c.medico}
            {c.tipoCita && <> · {c.tipoCita}</>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Clínica: {c.clinica ?? <span className="italic text-slate-400">sin sede registrada</span>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Motivo de la cita: {c.motivo?.trim() ? c.motivo : <span className="text-slate-400">—</span>}
          </p>
          {cancelada && c.motivoCancelacion && (
            <p className="mt-0.5 text-xs text-slate-500">Motivo: {c.motivoCancelacion}</p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
        {/* HU-31 c6: ATENDIDA, NO_ASISTIO y CANCELADA no tienen acciones. */}
        {agendada && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs font-semibold">
            {confirmandoInasistencia ? (
              <span role="group" aria-label="Confirmar inasistencia" className="flex flex-wrap items-center gap-2">
                <span className="font-normal text-slate-600">¿El paciente no llegó?</span>
                <button onClick={noAsistio} disabled={marcando} className="text-amber-800 hover:underline cursor-pointer disabled:opacity-60">
                  {marcando ? 'Guardando…' : 'Sí, no asistió'}
                </button>
                <button onClick={() => setConfirmandoInasistencia(false)} disabled={marcando} className="text-slate-500 hover:underline cursor-pointer">
                  Volver
                </button>
              </span>
            ) : (
              <>
                {puedeIniciarConsulta ? (
                  <Link href={hrefConsulta} className="rounded-lg bg-doc-blue px-2.5 py-1 text-white hover:opacity-90">
                    Iniciar consulta
                  </Link>
                ) : (
                  <button onClick={atender} disabled={marcando} className="text-emerald-700 hover:underline cursor-pointer disabled:opacity-60">
                    {marcando ? 'Guardando…' : 'Atendida'}
                  </button>
                )}
                {pasada && (
                  <button
                    onClick={() => {
                      setError(null)
                      setConfirmandoInasistencia(true)
                    }}
                    className="text-amber-800 hover:underline cursor-pointer"
                  >
                    No asistió
                  </button>
                )}
                {cambiable ? (
                  <>
                    <button onClick={onReprogramar} className="text-doc-blue hover:underline cursor-pointer">
                      Reprogramar
                    </button>
                    <button onClick={onCancelar} className="text-red-600 hover:underline cursor-pointer">
                      Cancelar
                    </button>
                  </>
                ) : (
                  !pasada && (
                    <span className="font-normal text-slate-400" title="Política de anticipación">
                      Menos de 4 h: ya no se cambia
                    </span>
                  )
                )}
              </>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Las horas libres de un médico en un día. Las da el backend: conoce el
 * horario del médico en la sede (HU-29) y las citas que ya ocupan cada hora.
 */
function useFranjasLibres(clinicaId: number, dia: string, medicoId: number | null) {
  const [franjas, setFranjas] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    if (!medicoId || !dia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin médico o día no hay franjas que pedir
      setFranjas(null)
      return
    }
    setFranjas(null)
    listarFranjasLibres(clinicaId, medicoId, dia)
      .then((libres) => {
        if (!vigente) return
        setFranjas(libres)
        setError(null)
      })
      .catch((err) => vigente && setError(mensajeDe(err, 'No se pudieron consultar los horarios.')))
    return () => {
      vigente = false
    }
  }, [clinicaId, dia, medicoId])

  return { franjas, error }
}

const SelectorDeFranja: React.FC<{
  id: string
  franjas: string[] | null
  error: string | null
  valor: string
  onCambio: (v: string) => void
  habilitado: boolean
}> = ({ id, franjas, error, valor, onCambio, habilitado }) => (
  <div>
    <label htmlFor={id} className={labelClass}>
      Hora disponible
      <Obligatorio />
    </label>
    <select
      id={id}
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      disabled={!habilitado || !franjas}
      className={campoBase}
    >
      <option value="">
        {!habilitado ? 'Elija médico y día' : !franjas ? 'Consultando…' : franjas.length === 0 ? 'Sin horarios libres' : 'Seleccione…'}
      </option>
      {franjas?.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
    {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
  </div>
)

const Botones: React.FC<{ enviando: boolean; etiqueta: string; onCancelar: () => void; peligro?: boolean }> = ({
  enviando,
  etiqueta,
  onCancelar,
  peligro,
}) => (
  <div className="flex gap-3 pt-1">
    <button
      type="button"
      onClick={onCancelar}
      className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 cursor-pointer"
    >
      Volver
    </button>
    <button
      type="submit"
      disabled={enviando}
      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
        peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-doc-blue hover:opacity-90'
      }`}
    >
      {enviando ? 'Guardando…' : etiqueta}
    </button>
  </div>
)

/** Tope del motivo de la cita en el backend (V40). */
const MAXIMO_MOTIVO_DE_CITA = 500

const MensajeDeError: React.FC<{ error: string | null }> = ({ error }) =>
  error ? (
    <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
      {error}
    </p>
  ) : null

const FormularioDeAgendar: React.FC<{
  clinicaId: number
  diaInicial: string
  medicos: MedicoDeAgendaDto[]
  tipos: TipoDeCitaDto[]
  onAgendada: (c: CitaDto) => void
  onCancelar: () => void
}> = ({ clinicaId, diaInicial, medicos, tipos, onAgendada, onCancelar }) => {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<PacienteDto[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [paciente, setPaciente] = useState<PacienteDto | null>(null)
  const [medicoId, setMedicoId] = useState(medicos.length === 1 ? String(medicos[0].medicoId) : '')
  const [tipoCitaId, setTipoCitaId] = useState(tipos.length === 1 ? String(tipos[0].tipoCitaId) : '')
  const [dia, setDia] = useState(diaInicial)
  const [franja, setFranja] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { franjas, error: errorFranjas } = useFranjasLibres(clinicaId, dia, medicoId ? Number(medicoId) : null)

  const buscar = async () => {
    if (!busqueda.trim()) return
    setBuscando(true)
    try {
      setResultados(await listarPacientes(busqueda.trim()))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo buscar el paciente.'))
    } finally {
      setBuscando(false)
    }
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paciente || !medicoId || !tipoCitaId || !dia || !franja) {
      setError('El paciente, el médico, el tipo de cita, el día y la hora son obligatorios.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      onAgendada(
        await agendarCita({
          pacienteId: paciente.personaId,
          medicoId: Number(medicoId),
          tipoCitaId: Number(tipoCitaId),
          clinicaId,
          fechaHora: `${dia}T${franja}`,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        }),
      )
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo agendar la cita.'))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} aria-label="Agendar cita" className="space-y-4">
      <div>
        <label htmlFor={id('buscar')} className={labelClass}>
          Paciente
          <Obligatorio />
        </label>
        {paciente ? (
          <div className="flex items-center justify-between rounded-xl border-2 border-doc-blue/30 bg-blue-50/50 px-3.5 py-2.5">
            <span className="text-sm font-semibold text-slate-700">
              {paciente.persona.nombres} {paciente.persona.apellidos}
              <span className="ml-2 text-xs font-normal text-slate-500">{paciente.expediente}</span>
            </span>
            <button type="button" onClick={() => setPaciente(null)} className="text-xs font-semibold text-doc-blue hover:underline cursor-pointer">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                id={id('buscar')}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void buscar()
                  }
                }}
                placeholder="Nombre, apellido o DUI"
                className={campoBase}
              />
              <button
                type="button"
                onClick={() => void buscar()}
                disabled={buscando}
                className="shrink-0 px-4 rounded-xl text-sm font-semibold border-2 border-doc-blue text-doc-blue cursor-pointer disabled:opacity-60"
              >
                {buscando ? '…' : 'Buscar'}
              </button>
            </div>
            {resultados && (
              <ul aria-label="Pacientes encontrados" className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-100">
                {resultados.length === 0 ? (
                  <li className="px-3.5 py-2 text-xs text-slate-500">Ningún paciente activo coincide.</li>
                ) : (
                  resultados.map((p) => (
                    <li key={p.personaId}>
                      <button
                        type="button"
                        onClick={() => setPaciente(p)}
                        className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                      >
                        {p.persona.nombres} {p.persona.apellidos}
                        <span className="ml-2 text-xs text-slate-400">{p.expediente}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('medico')} className={labelClass}>
            Médico
            <Obligatorio />
          </label>
          <select
            id={id('medico')}
            value={medicoId}
            onChange={(e) => {
              setMedicoId(e.target.value)
              setFranja('')
            }}
            className={campoBase}
          >
            <option value="">Seleccione…</option>
            {medicos.map((m) => (
              <option key={m.medicoId} value={m.medicoId}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('tipo')} className={labelClass}>
            Tipo de cita
            <Obligatorio />
          </label>
          <select id={id('tipo')} value={tipoCitaId} onChange={(e) => setTipoCitaId(e.target.value)} className={campoBase}>
            <option value="">Seleccione…</option>
            {tipos.map((t) => (
              <option key={t.tipoCitaId} value={t.tipoCitaId}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('dia')} className={labelClass}>
            Día
            <Obligatorio />
          </label>
          <input
            id={id('dia')}
            type="date"
            min={hoy()}
            value={dia}
            onChange={(e) => {
              setDia(e.target.value)
              setFranja('')
            }}
            className={campoBase}
          />
        </div>
        <SelectorDeFranja
          id={id('hora')}
          franjas={franjas}
          error={errorFranjas}
          valor={franja}
          onCambio={setFranja}
          habilitado={Boolean(medicoId && dia)}
        />
      </div>

      <div>
        <label htmlFor={id('motivo')} className={labelClass}>
          Motivo de la cita
        </label>
        <textarea
          id={id('motivo')}
          maxLength={MAXIMO_MOTIVO_DE_CITA}
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej.: Control de presión arterial (opcional)"
          className={campoBase}
        />
      </div>

      <MensajeDeError error={error} />
      <Botones enviando={enviando} etiqueta="Confirmar cita" onCancelar={onCancelar} />
    </form>
  )
}

const FormularioDeReprogramar: React.FC<{
  cita: CitaDto
  clinicaId: number
  onReprogramada: (c: CitaDto) => void
  onCancelar: () => void
}> = ({ cita, clinicaId, onReprogramada, onCancelar }) => {
  const uid = useId()
  const [dia, setDia] = useState(cita.fechaHora.slice(0, 10))
  const [franja, setFranja] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { franjas, error: errorFranjas } = useFranjasLibres(clinicaId, dia, cita.medicoId)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dia || !franja) {
      setError('Elija el nuevo día y la nueva hora.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      onReprogramada(await reprogramarCita(cita.citaId, `${dia}T${franja}`))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo reprogramar la cita.'))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} aria-label="Reprogramar cita" className="space-y-4">
      <p className="text-sm text-slate-600">
        Ahora: {fechaLegible(cita.fechaHora.slice(0, 10))} a las {horaDe(cita.fechaHora)}, con {cita.medico}.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-dia`} className={labelClass}>
            Nuevo día
            <Obligatorio />
          </label>
          <input
            id={`${uid}-dia`}
            type="date"
            min={hoy()}
            value={dia}
            onChange={(e) => {
              setDia(e.target.value)
              setFranja('')
            }}
            className={campoBase}
          />
        </div>
        <SelectorDeFranja id={`${uid}-hora`} franjas={franjas} error={errorFranjas} valor={franja} onCambio={setFranja} habilitado={Boolean(dia)} />
      </div>
      <MensajeDeError error={error} />
      <Botones enviando={enviando} etiqueta="Reprogramar" onCancelar={onCancelar} />
    </form>
  )
}

const FormularioDeCancelar: React.FC<{
  cita: CitaDto
  onCancelada: (c: CitaDto) => void
  onCancelar: () => void
}> = ({ cita, onCancelada, onCancelar }) => {
  const uid = useId()
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (motivoDeAnulacionInvalido(motivo)) {
      setError(`${MENSAJE_MOTIVO_DE_ANULACION}.`)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      onCancelada(await cancelarCita(cita.citaId, motivo.trim()))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cancelar la cita.'))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} aria-label="Cancelar cita" className="space-y-4">
      <p className="text-sm text-slate-600">
        {fechaLegible(cita.fechaHora.slice(0, 10))} a las {horaDe(cita.fechaHora)}, con {cita.medico}. La cita no se
        borra: queda cancelada con su motivo y la hora se libera.
      </p>
      <div>
        <label htmlFor={`${uid}-motivo`} className={labelClass}>
          Motivo
          <Obligatorio />
        </label>
        <textarea
          id={`${uid}-motivo`}
          maxLength={MAXIMO_MOTIVO_DE_ANULACION}
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej.: El paciente no puede asistir por viaje"
          className={campoBase}
        />
      </div>
      <MensajeDeError error={error} />
      <Botones enviando={enviando} etiqueta="Cancelar la cita" onCancelar={onCancelar} peligro />
    </form>
  )
}
