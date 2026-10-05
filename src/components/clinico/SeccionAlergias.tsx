'use client'

// ─── HU-11 · Alergias del paciente ──────────────────────────────────────────
// La sustancia, el tipo de reacción, la severidad y la fecha de detección
// (criterio 1). Las severas salen primero en la sección y, además, destacadas
// arriba de la ficha con color de advertencia (criterio 2, ver
// `AvisoDeAlergiasSeveras`). Repetir una sustancia lo rechaza el backend con
// un 409 que nombra el registro existente, y ese mensaje es el que se muestra
// (criterio 3). Quién la registró lo pone el backend desde el token y aquí se
// enseña junto a cada alergia (criterio 4).
//
// Registran y eliminan el médico y la enfermera; el administrador consulta.

import React, { useCallback, useEffect, useId, useState } from 'react'
import {
  campoBase,
  ErrorDeSeccion,
  formatearFecha,
  hoy,
  labelClass,
  mensajeDe,
  Obligatorio,
  SeccionDeExpediente,
} from '@/components/clinico/SeccionDeExpediente'
import {
  alergiasSeveras,
  crearAlergia,
  eliminarAlergia,
  etiquetaDeSeveridad,
  listarAlergias,
  ordenarPorSeveridad,
  SEVERIDADES,
  type AlergiaDto,
  type SeveridadDeAlergia,
} from '@/services/alergias'

/**
 * Lo que la sección sabe de las alergias del paciente, para el aviso de
 * arriba: `undefined` mientras carga, `null` si no se pudo saber, y la lista
 * cuando llegó. Son tres cosas distintas y el aviso dice algo distinto en cada
 * una: callar mientras carga, advertir si falló, destacar las severas si las
 * hay.
 */
export type AlergiasConocidas = AlergiaDto[] | null | undefined

interface Props {
  pacienteId: number
  /** Médico o enfermera: registran y eliminan. */
  puedeEditar: boolean
  expanded: boolean
  onToggle: () => void
  /**
   * Avisa de cada cambio en lo que se sabe (ver `AlergiasConocidas`). Debe
   * ser estable —un `setState` sirve—: se llama desde un efecto.
   */
  onCambio?: (alergias: AlergiasConocidas) => void
}

const COLOR_DE_SEVERIDAD: Record<SeveridadDeAlergia, string> = {
  SEVERA: 'bg-red-100 text-red-700 border-red-200',
  MODERADA: 'bg-amber-100 text-amber-800 border-amber-200',
  LEVE: 'bg-slate-100 text-slate-600 border-slate-200',
}

export const SeccionAlergias: React.FC<Props> = ({ pacienteId, puedeEditar, expanded, onToggle, onCambio }) => {
  const [alergias, setAlergias] = useState<AlergiaDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setAlergias(await listarAlergias(pacienteId))
      setError(null)
    } catch (err) {
      setAlergias([])
      setError(mensajeDe(err, 'No se pudieron cargar las alergias.'))
    } finally {
      setCargando(false)
    }
  }, [pacienteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargar()
  }, [cargar])

  useEffect(() => {
    onCambio?.(cargando ? undefined : error ? null : alergias)
  }, [alergias, cargando, error, onCambio])

  const reintentar = () => {
    setCargando(true)
    void cargar()
  }

  const abrirFormulario = () => {
    setFormularioAbierto(true)
    if (!expanded) onToggle()
  }

  return (
    <SeccionDeExpediente
      icon="shield"
      titulo="Historial de Alergias"
      cantidad={cargando || error ? null : alergias.length}
      expanded={expanded}
      onToggle={onToggle}
      accion={puedeEditar && !formularioAbierto ? { etiqueta: '+ Agregar', onClick: abrirFormulario } : undefined}
    >
      {formularioAbierto && (
        <FormularioDeAlergia
          pacienteId={pacienteId}
          onGuardada={(nueva) => {
            setAlergias((prev) => ordenarPorSeveridad([...prev, nueva]))
            setFormularioAbierto(false)
          }}
          onCancelar={() => setFormularioAbierto(false)}
        />
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando alergias…</p>
      ) : error ? (
        <ErrorDeSeccion mensaje={error} onReintentar={reintentar} />
      ) : alergias.length === 0 ? (
        <p className="text-sm text-slate-500">
          No hay alergias registradas para este paciente.
          {puedeEditar
            ? ' Pregunte siempre por alergias y regístrelas con «Agregar».'
            : ' Solo un médico o una enfermera pueden registrarlas.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {alergias.map((a) => (
            <FilaDeAlergia
              key={a.alergiaId}
              alergia={a}
              puedeEliminar={puedeEditar}
              onEliminada={() => setAlergias((prev) => prev.filter((x) => x.alergiaId !== a.alergiaId))}
            />
          ))}
        </ul>
      )}
    </SeccionDeExpediente>
  )
}

/**
 * El aviso de la parte superior de la ficha (criterio 2).
 *
 * Va fuera de la sección a propósito: la sección arranca plegada, y una
 * alergia severa no puede depender de que alguien la despliegue para verse.
 * Si la lista no se pudo cargar también avisa, en ámbar: callar en ese caso
 * se leería como «no tiene alergias severas», que nadie ha comprobado.
 */
export const AvisoDeAlergiasSeveras: React.FC<{ alergias: AlergiasConocidas }> = ({ alergias }) => {
  if (alergias === undefined) return null

  if (alergias === null) {
    return (
      <div
        role="alert"
        className="mb-4 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        No se pudieron cargar las alergias de este paciente. Verifíquelas antes de indicar o recetar
        un medicamento.
      </div>
    )
  }

  const severas = alergiasSeveras(alergias)
  if (severas.length === 0) return null

  return (
    <div
      role="alert"
      aria-label="Alergias severas"
      className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-800"
    >
      <p className="text-sm font-bold uppercase tracking-wide">
        {severas.length === 1 ? 'Alergia severa' : `Alergias severas (${severas.length})`}
      </p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {severas.map((a) => (
          <li key={a.alergiaId}>
            <span className="font-semibold">{a.sustancia}</span>
            <span className="text-red-700"> — {a.reaccion}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const FilaDeAlergia: React.FC<{
  alergia: AlergiaDto
  puedeEliminar: boolean
  onEliminada: () => void
}> = ({ alergia: a, puedeEliminar, onEliminada }) => {
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eliminar = async () => {
    setEliminando(true)
    setError(null)
    try {
      await eliminarAlergia(a.alergiaId)
      onEliminada()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar la alergia.'))
      setEliminando(false)
    }
  }

  const severa = a.severidad === 'SEVERA'

  return (
    <li
      className={`rounded-xl border px-3.5 py-2.5 ${
        severa ? 'border-red-200 bg-red-50/70' : 'border-slate-100 bg-slate-50/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-700 break-words">{a.sustancia}</p>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                COLOR_DE_SEVERIDAD[a.severidad] ?? COLOR_DE_SEVERIDAD.LEVE
              }`}
            >
              {etiquetaDeSeveridad(a.severidad)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 break-words">{a.reaccion}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Detectada el {formatearFecha(a.fechaDeteccion)}
            {a.registradaPor && <> · Registrada por {a.registradaPor}</>}
          </p>
        </div>
        {puedeEliminar &&
          (confirmando ? (
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <button
                onClick={eliminar}
                disabled={eliminando}
                className="font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-60"
              >
                {eliminando ? 'Eliminando…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmando(false)}
                disabled={eliminando}
                className="text-slate-500 hover:underline cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              aria-label={`Eliminar alergia: ${a.sustancia}`}
              className="shrink-0 text-xs font-semibold text-slate-400 hover:text-red-600 cursor-pointer"
            >
              Eliminar
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </li>
  )
}

const FormularioDeAlergia: React.FC<{
  pacienteId: number
  onGuardada: (a: AlergiaDto) => void
  onCancelar: () => void
}> = ({ pacienteId, onGuardada, onCancelar }) => {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`

  const [sustancia, setSustancia] = useState('')
  const [reaccion, setReaccion] = useState('')
  const [severidad, setSeveridad] = useState<SeveridadDeAlergia | ''>('')
  const [fechaDeteccion, setFechaDeteccion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const texto = sustancia.trim()
    const tipoDeReaccion = reaccion.trim()
    if (!texto || !tipoDeReaccion || !severidad || !fechaDeteccion) {
      setError('La sustancia, la reacción, la severidad y la fecha de detección son obligatorias.')
      return
    }
    if (fechaDeteccion > hoy()) {
      setError('La fecha de detección no puede ser futura.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      onGuardada(
        await crearAlergia({ pacienteId, sustancia: texto, reaccion: tipoDeReaccion, severidad, fechaDeteccion }),
      )
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo registrar la alergia.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} aria-label="Nueva alergia" className="space-y-3 rounded-xl border-2 border-slate-100 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('sustancia')} className={labelClass}>
            Sustancia
            <Obligatorio />
          </label>
          <input
            id={id('sustancia')}
            maxLength={100}
            value={sustancia}
            onChange={(e) => setSustancia(e.target.value)}
            placeholder="Ej.: Penicilina"
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('severidad')} className={labelClass}>
            Severidad
            <Obligatorio />
          </label>
          <select
            id={id('severidad')}
            value={severidad}
            onChange={(e) => setSeveridad(e.target.value as SeveridadDeAlergia | '')}
            className={campoBase}
          >
            <option value="">Seleccione…</option>
            {SEVERIDADES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('reaccion')} className={labelClass}>
            Tipo de reacción
            <Obligatorio />
          </label>
          <input
            id={id('reaccion')}
            maxLength={255}
            value={reaccion}
            onChange={(e) => setReaccion(e.target.value)}
            placeholder="Ej.: Urticaria, anafilaxia"
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('fecha')} className={labelClass}>
            Fecha de detección
            <Obligatorio />
          </label>
          <input
            id={id('fecha')}
            type="date"
            max={hoy()}
            value={fechaDeteccion}
            onChange={(e) => setFechaDeteccion(e.target.value)}
            className={campoBase}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {enviando ? 'Guardando…' : 'Guardar alergia'}
        </button>
      </div>
    </form>
  )
}
