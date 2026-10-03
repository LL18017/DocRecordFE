'use client'

// ─── HU-12 · Antecedentes patológicos ───────────────────────────────────────
// Enfermedades previas, cirugías y hospitalizaciones del paciente, del más
// reciente al más antiguo (criterio 2; el orden lo da el backend).
//
// Solo el médico registra y elimina. La enfermera ve la misma lista sin los
// botones (criterio 3) —y si los tuviera, el backend respondería 403—.

import React, { useCallback, useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
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
  crearAntecedente,
  eliminarAntecedente,
  ESTADOS_DE_ANTECEDENTE,
  etiquetaDeEstado,
  etiquetaDeTipo,
  listarAntecedentes,
  TIPOS_DE_ANTECEDENTE,
  type AntecedenteDto,
  type EstadoDeAntecedente,
  type TipoDeAntecedente,
} from '@/services/antecedentes'

interface Props {
  pacienteId: number
  /** Solo el médico registra y elimina. */
  puedeEditar: boolean
  expanded: boolean
  onToggle: () => void
}

export const SeccionAntecedentes: React.FC<Props> = ({ pacienteId, puedeEditar, expanded, onToggle }) => {
  const [antecedentes, setAntecedentes] = useState<AntecedenteDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setAntecedentes(await listarAntecedentes(pacienteId))
      setError(null)
    } catch (err) {
      setAntecedentes([])
      setError(mensajeDe(err, 'No se pudieron cargar los antecedentes.'))
    } finally {
      setCargando(false)
    }
  }, [pacienteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargar()
  }, [cargar])

  const reintentar = () => {
    setCargando(true)
    void cargar()
  }

  const abrirFormulario = () => {
    setFormularioAbierto(true)
    if (!expanded) onToggle()
  }

  // Lo nuevo entra en su lugar cronológico, no arriba de todo: la lista se
  // lee por fecha del antecedente, y un registro de hoy de una cirugía de 2010
  // va donde va 2010.
  const alGuardar = (nuevo: AntecedenteDto) => {
    setAntecedentes((prev) =>
      [...prev, nuevo].sort((a, b) =>
        a.fecha === b.fecha ? b.antecedenteId - a.antecedenteId : b.fecha.localeCompare(a.fecha),
      ),
    )
    setFormularioAbierto(false)
  }

  const alEliminar = (antecedenteId: number) =>
    setAntecedentes((prev) => prev.filter((a) => a.antecedenteId !== antecedenteId))

  return (
    <SeccionDeExpediente
      icon="history"
      titulo="Antecedentes Patológicos"
      cantidad={cargando || error ? null : antecedentes.length}
      expanded={expanded}
      onToggle={onToggle}
      accion={puedeEditar && !formularioAbierto ? { etiqueta: '+ Agregar', onClick: abrirFormulario } : undefined}
    >
      {formularioAbierto && (
        <FormularioDeAntecedente
          pacienteId={pacienteId}
          onGuardado={alGuardar}
          onCancelar={() => setFormularioAbierto(false)}
        />
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando antecedentes…</p>
      ) : error ? (
        <ErrorDeSeccion mensaje={error} onReintentar={reintentar} />
      ) : antecedentes.length === 0 ? (
        // Criterio 4: un estado vacío que explica, no un error. Dice lo que
        // el sistema sabe —que nadie registró nada— y no «no tiene».
        <p className="text-sm text-slate-500">
          No hay antecedentes patológicos registrados para este paciente.
          {puedeEditar
            ? ' Registre sus enfermedades previas, cirugías y hospitalizaciones con «Agregar».'
            : ' Solo un médico puede registrarlos.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {antecedentes.map((a) => (
            <FilaDeAntecedente
              key={a.antecedenteId}
              antecedente={a}
              puedeEliminar={puedeEditar}
              onEliminado={() => alEliminar(a.antecedenteId)}
            />
          ))}
        </ul>
      )}
    </SeccionDeExpediente>
  )
}

const FilaDeAntecedente: React.FC<{
  antecedente: AntecedenteDto
  puedeEliminar: boolean
  onEliminado: () => void
}> = ({ antecedente: a, puedeEliminar, onEliminado }) => {
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eliminar = async () => {
    setEliminando(true)
    setError(null)
    try {
      await eliminarAntecedente(a.antecedenteId)
      onEliminado()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar el antecedente.'))
      setEliminando(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="blue">{etiquetaDeTipo(a.tipo)}</Badge>
            <Badge color={a.estado === 'ACTIVO' ? 'amber' : 'gray'}>{etiquetaDeEstado(a.estado)}</Badge>
            <span className="text-xs font-semibold text-slate-500">{formatearFecha(a.fecha)}</span>
          </div>
          <p className="mt-1.5 text-sm text-slate-700 break-words">{a.descripcion}</p>
          <p className="mt-1 text-xs text-slate-400">Registró: {a.registradoPor}</p>
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
              aria-label={`Eliminar antecedente: ${a.descripcion}`}
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

const FormularioDeAntecedente: React.FC<{
  pacienteId: number
  onGuardado: (a: AntecedenteDto) => void
  onCancelar: () => void
}> = ({ pacienteId, onGuardado, onCancelar }) => {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`

  const [tipo, setTipo] = useState<TipoDeAntecedente>('ENFERMEDAD')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [estado, setEstado] = useState<EstadoDeAntecedente>('ACTIVO')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const texto = descripcion.trim()
    if (!texto || !fecha) {
      setError('La descripción y la fecha son obligatorias.')
      return
    }
    if (fecha > hoy()) {
      setError('La fecha no puede ser futura.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      onGuardado(await crearAntecedente({ pacienteId, tipo, descripcion: texto, fecha, estado }))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo registrar el antecedente.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={enviar}
      aria-label="Nuevo antecedente patológico"
      className="space-y-3 rounded-xl border-2 border-slate-100 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={id('tipo')} className={labelClass}>
            Tipo
            <Obligatorio />
          </label>
          <select
            id={id('tipo')}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeAntecedente)}
            className={campoBase}
          >
            {TIPOS_DE_ANTECEDENTE.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('fecha')} className={labelClass}>
            Fecha
            <Obligatorio />
          </label>
          <input
            id={id('fecha')}
            type="date"
            max={hoy()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('estado')} className={labelClass}>
            Estado
            <Obligatorio />
          </label>
          <select
            id={id('estado')}
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoDeAntecedente)}
            className={campoBase}
          >
            {ESTADOS_DE_ANTECEDENTE.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={id('descripcion')} className={labelClass}>
          Descripción
          <Obligatorio />
        </label>
        <textarea
          id={id('descripcion')}
          rows={2}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej.: Apendicectomía laparoscópica sin complicaciones"
          className={`${campoBase} resize-none`}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
        >
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
          {enviando ? 'Guardando…' : 'Guardar antecedente'}
        </button>
      </div>
    </form>
  )
}
