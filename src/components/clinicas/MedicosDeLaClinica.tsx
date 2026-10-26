'use client'

// ─── HU-29 · Médicos de una sede, con sus horarios ──────────────────────────
// La ficha de la clínica lista a sus médicos con especialidad y horario
// (criterio 3). El administrador agrega franjas —a un médico de la sede o a
// uno nuevo, que con eso queda asignado— y quita franjas o médicos. Antes de
// quitar a un médico se muestran sus citas futuras en la sede y se pide
// confirmar (criterio 4). Los traslapes los rechaza el backend nombrando el
// conflicto (criterios 1 y 2).

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { campoBase, labelClass, mensajeDe, Obligatorio } from '@/components/clinico/SeccionDeExpediente'
import {
  agregarHorario,
  citasFuturasDelMedico,
  DIAS,
  etiquetaDeHorario,
  HORAS,
  listarMedicosConHorario,
  quitarHorario,
  quitarMedicoDeLaClinica,
  type MedicoDeClinicaDto,
} from '@/services/horarios'
import { listarUsuarios } from '@/services/usuarios'
import type { CitaDto } from '@/services/citas'

interface Props {
  clinicaId: number
  /** Solo el administrador cambia asignaciones y horarios. */
  esAdmin: boolean
}

interface MedicoElegible {
  medicoId: number
  nombre: string
}

export const MedicosDeLaClinica: React.FC<Props> = ({ clinicaId, esAdmin }) => {
  const [medicos, setMedicos] = useState<MedicoDeClinicaDto[] | null>(null)
  const [todos, setTodos] = useState<MedicoElegible[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setMedicos(await listarMedicosConHorario(clinicaId))
      setError(null)
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron cargar los médicos de la sede.'))
    }
  }, [clinicaId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!esAdmin) return
    // Para asignar a la sede un médico que todavía no está en ella hace falta
    // el listado de cuentas, que es solo del administrador.
    listarUsuarios()
      .then((usuarios) =>
        setTodos(
          usuarios
            .filter((u) => u.activo && u.roles.some((r) => (r.name ?? '').toUpperCase().includes('MEDICO')))
            .map((u) => ({ medicoId: u.userId, nombre: u.userName }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        ),
      )
      .catch(() => setTodos([]))
  }, [esAdmin])

  const elegibles = useMemo(() => {
    const deLaSede = new Map((medicos ?? []).map((m) => [m.medicoId, m.nombre]))
    const lista = [...(medicos ?? []).map((m) => ({ medicoId: m.medicoId, nombre: m.nombre }))]
    todos.forEach((t) => {
      if (!deLaSede.has(t.medicoId)) lista.push({ medicoId: t.medicoId, nombre: `${t.nombre} (asignar a esta sede)` })
    })
    return lista
  }, [medicos, todos])

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {error}{' '}
        <button onClick={() => void cargar()} className="font-semibold underline cursor-pointer">
          Reintentar
        </button>
      </p>
    )
  }
  if (!medicos) return <p className="text-sm text-slate-400">Cargando médicos…</p>

  return (
    <div className="space-y-4">
      {medicos.length === 0 ? (
        <p className="text-sm text-slate-500">Esta sede todavía no tiene médicos asignados.</p>
      ) : (
        <ul aria-label="Médicos de la sede" className="space-y-2">
          {medicos.map((m) => (
            <FilaDeMedico key={m.medicoId} clinicaId={clinicaId} medico={m} esAdmin={esAdmin} onCambio={cargar} />
          ))}
        </ul>
      )}
      {esAdmin && elegibles.length > 0 && (
        <FormularioDeHorario clinicaId={clinicaId} medicos={elegibles} onAgregado={cargar} />
      )}
    </div>
  )
}

const FilaDeMedico: React.FC<{
  clinicaId: number
  medico: MedicoDeClinicaDto
  esAdmin: boolean
  onCambio: () => Promise<void>
}> = ({ clinicaId, medico: m, esAdmin, onCambio }) => {
  const [citas, setCitas] = useState<CitaDto[] | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prepararQuitar = async () => {
    setError(null)
    setTrabajando(true)
    try {
      setCitas(await citasFuturasDelMedico(clinicaId, m.medicoId))
      setConfirmando(true)
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron consultar sus citas futuras.'))
    } finally {
      setTrabajando(false)
    }
  }

  const quitar = async () => {
    setTrabajando(true)
    setError(null)
    try {
      await quitarMedicoDeLaClinica(clinicaId, m.medicoId)
      await onCambio()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo quitar al médico de la sede.'))
      setTrabajando(false)
    }
  }

  const borrarHorario = async (horarioId: number) => {
    setError(null)
    try {
      await quitarHorario(clinicaId, m.medicoId, horarioId)
      await onCambio()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo quitar el horario.'))
    }
  }

  return (
    <li aria-label={`Médico ${m.nombre}`} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">{m.nombre}</p>
          <p className="text-xs text-slate-500">{m.especialidad ?? 'Sin especialidad registrada'}</p>
        </div>
        {esAdmin && !confirmando && (
          <button
            onClick={prepararQuitar}
            disabled={trabajando}
            className="text-xs font-semibold text-slate-400 hover:text-red-600 cursor-pointer disabled:opacity-60"
          >
            Quitar de la sede
          </button>
        )}
      </div>
      {m.horarios.length === 0 ? (
        <p className="mt-1 text-xs text-amber-700">
          Sin horario en esta sede: la agenda le ofrece la jornada de 7:00 a 17:00.
        </p>
      ) : (
        <ul aria-label={`Horario de ${m.nombre}`} className="mt-1.5 flex flex-wrap gap-1.5">
          {m.horarios.map((h) => (
            <li key={h.horarioId} className="flex items-center gap-1 rounded-md border border-blue-100 bg-white px-2 py-0.5 text-xs text-slate-600">
              {etiquetaDeHorario(h)}
              {esAdmin && (
                <button
                  onClick={() => void borrarHorario(h.horarioId)}
                  aria-label={`Quitar horario ${etiquetaDeHorario(h)} de ${m.nombre}`}
                  className="ml-1 text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirmando && citas && (
        <div role="alert" className="mt-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          {citas.length === 0 ? (
            <p>No tiene citas futuras en esta sede. ¿Quitarlo de la sede junto con sus horarios aquí?</p>
          ) : (
            <>
              <p className="font-semibold">
                Tiene {citas.length === 1 ? '1 cita futura' : `${citas.length} citas futuras`} en esta sede:
              </p>
              <ul className="mt-1 list-disc pl-4">
                {citas.map((c) => (
                  <li key={c.citaId}>
                    {c.fechaHora.slice(0, 10)} {c.fechaHora.slice(11, 16)} · {c.paciente}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Quedarán agendadas con él; reprográmelas o cancélelas desde la Agenda.</p>
            </>
          )}
          <div className="mt-2 flex gap-3 font-semibold">
            <button onClick={quitar} disabled={trabajando} className="text-red-700 hover:underline cursor-pointer disabled:opacity-60">
              {trabajando ? 'Quitando…' : 'Confirmar y quitar'}
            </button>
            <button onClick={() => setConfirmando(false)} className="text-slate-600 hover:underline cursor-pointer">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </li>
  )
}

const FormularioDeHorario: React.FC<{
  clinicaId: number
  medicos: MedicoElegible[]
  onAgregado: () => Promise<void>
}> = ({ clinicaId, medicos, onAgregado }) => {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`
  const [medicoId, setMedicoId] = useState('')
  const [dia, setDia] = useState('1')
  const [inicio, setInicio] = useState('08:00')
  const [fin, setFin] = useState('12:00')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!medicoId) {
      setError('Elija el médico.')
      return
    }
    if (fin <= inicio) {
      setError('La hora de fin debe ser posterior a la de inicio.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await agregarHorario(clinicaId, Number(medicoId), { diaSemana: Number(dia), horaInicio: inicio, horaFin: fin })
      await onAgregado()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo agregar el horario.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} aria-label="Agregar horario" className="space-y-3 rounded-xl border-2 border-slate-100 p-4">
      <p className="text-sm font-semibold text-slate-700">Agregar horario</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={id('medico')} className={labelClass}>
            Médico
            <Obligatorio />
          </label>
          <select id={id('medico')} value={medicoId} onChange={(e) => setMedicoId(e.target.value)} className={campoBase}>
            <option value="">Seleccione…</option>
            {medicos.map((m) => (
              <option key={m.medicoId} value={m.medicoId}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('dia')} className={labelClass}>
            Día
          </label>
          <select id={id('dia')} value={dia} onChange={(e) => setDia(e.target.value)} className={campoBase}>
            {DIAS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={id('inicio')} className={labelClass}>
              Desde
            </label>
            <select id={id('inicio')} value={inicio} onChange={(e) => setInicio(e.target.value)} className={campoBase}>
              {HORAS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={id('fin')} className={labelClass}>
              Hasta
            </label>
            <select id={id('fin')} value={fin} onChange={(e) => setFin(e.target.value)} className={campoBase}>
              {HORAS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm cursor-pointer disabled:opacity-60"
      >
        {enviando ? 'Guardando…' : 'Agregar horario'}
      </button>
    </form>
  )
}
