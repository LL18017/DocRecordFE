'use client'

// ─── HU-14 · Hábitos y estilo de vida ───────────────────────────────────────
// Cada hábito con su tipo (del catálogo), una descripción y un nivel de riesgo
// (criterio 1). Los de riesgo alto salen primero y destacados en rojo
// (criterio 3). Registran y editan el médico y la enfermera; eliminar es solo
// del médico, y el administrador consulta.
//
// Lo que esta sección NO hace todavía, porque el backend no lo guarda: la
// fecha de actualización y el historial de valores anteriores (criterio 2).
// Editar sobrescribe. No se finge un historial que no existe.

import React, { useCallback, useEffect, useId, useState } from 'react'
import {
  campoBase,
  ErrorDeSeccion,
  labelClass,
  mensajeDe,
  Obligatorio,
  SeccionDeExpediente,
} from '@/components/clinico/SeccionDeExpediente'
import {
  actualizarHabito,
  eliminarHabito,
  etiquetaDeNivel,
  listarHabitos,
  listarTiposDeHabito,
  NIVELES,
  ordenarPorRiesgo,
  registrarHabito,
  type HabitoDto,
  type NivelDeHabito,
  type TipoDeHabitoDto,
} from '@/services/habitos'

interface Props {
  pacienteId: number
  /** Médico o enfermera: registran y editan. */
  puedeEditar: boolean
  /** Solo el médico elimina. */
  puedeEliminar: boolean
  expanded: boolean
  onToggle: () => void
}

const COLOR_DE_NIVEL: Record<NivelDeHabito, string> = {
  ALTO: 'bg-red-100 text-red-700 border-red-200',
  MODERADO: 'bg-amber-100 text-amber-800 border-amber-200',
  BAJO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export const SeccionHabitos: React.FC<Props> = ({ pacienteId, puedeEditar, puedeEliminar, expanded, onToggle }) => {
  const [habitos, setHabitos] = useState<HabitoDto[]>([])
  const [tipos, setTipos] = useState<TipoDeHabitoDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [lista, catalogo] = await Promise.all([listarHabitos(pacienteId), listarTiposDeHabito()])
      setHabitos(ordenarPorRiesgo(lista))
      setTipos(catalogo)
      setError(null)
    } catch (err) {
      setHabitos([])
      setError(mensajeDe(err, 'No se pudieron cargar los hábitos.'))
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

  const reemplazar = (h: HabitoDto) =>
    setHabitos((prev) => ordenarPorRiesgo(prev.map((x) => (x.id === h.id ? h : x))))

  return (
    <SeccionDeExpediente
      icon="vitals"
      titulo="Hábitos y Estilo de Vida"
      cantidad={cargando || error ? null : habitos.length}
      expanded={expanded}
      onToggle={onToggle}
      accion={
        puedeEditar && !formularioAbierto && tipos.length > 0
          ? { etiqueta: '+ Agregar', onClick: abrirFormulario }
          : undefined
      }
    >
      {formularioAbierto && (
        <FormularioDeHabito
          pacienteId={pacienteId}
          tipos={tipos}
          onGuardado={(nuevo) => {
            setHabitos((prev) => ordenarPorRiesgo([...prev, nuevo]))
            setFormularioAbierto(false)
          }}
          onCancelar={() => setFormularioAbierto(false)}
        />
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando hábitos…</p>
      ) : error ? (
        <ErrorDeSeccion mensaje={error} onReintentar={reintentar} />
      ) : (
        <>
          {puedeEditar && tipos.length === 0 && (
            <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              No hay tipos de hábito en el catálogo. El administrador debe registrarlos antes de poder
              anotar hábitos.
            </p>
          )}
          {habitos.length === 0 ? (
            <p className="text-sm text-slate-500">No hay hábitos registrados para este paciente.</p>
          ) : (
            <ul className="space-y-2">
              {habitos.map((h) => (
                <FilaDeHabito
                  key={h.id}
                  habito={h}
                  tipos={tipos}
                  puedeEditar={puedeEditar}
                  puedeEliminar={puedeEliminar}
                  onActualizado={reemplazar}
                  onEliminado={() => setHabitos((prev) => prev.filter((x) => x.id !== h.id))}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </SeccionDeExpediente>
  )
}

const FilaDeHabito: React.FC<{
  habito: HabitoDto
  tipos: TipoDeHabitoDto[]
  puedeEditar: boolean
  puedeEliminar: boolean
  onActualizado: (h: HabitoDto) => void
  onEliminado: () => void
}> = ({ habito: h, tipos, puedeEditar, puedeEliminar, onActualizado, onEliminado }) => {
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (editando) {
    return (
      <li>
        <FormularioDeHabito
          pacienteId={h.pacienteId}
          tipos={tipos}
          inicial={h}
          onGuardado={(actualizado) => {
            onActualizado(actualizado)
            setEditando(false)
          }}
          onCancelar={() => setEditando(false)}
        />
      </li>
    )
  }

  const eliminar = async () => {
    setEliminando(true)
    setError(null)
    try {
      await eliminarHabito(h.id)
      onEliminado()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar el hábito.'))
      setEliminando(false)
    }
  }

  const alto = h.nivel === 'ALTO'

  return (
    <li
      className={`rounded-xl border px-3.5 py-2.5 ${
        alto ? 'border-red-200 bg-red-50/70' : 'border-slate-100 bg-slate-50/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-700 break-words">{h.tipoHabito.descripcion}</p>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                COLOR_DE_NIVEL[h.nivel] ?? COLOR_DE_NIVEL.BAJO
              }`}
            >
              {etiquetaDeNivel(h.nivel)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 break-words">{h.descripcion}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          {confirmando ? (
            <>
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
            </>
          ) : (
            <>
              {puedeEditar && (
                <button
                  onClick={() => setEditando(true)}
                  aria-label={`Editar hábito: ${h.tipoHabito.descripcion}`}
                  className="font-semibold text-slate-400 hover:text-doc-blue cursor-pointer"
                >
                  Editar
                </button>
              )}
              {puedeEliminar && (
                <button
                  onClick={() => setConfirmando(true)}
                  aria-label={`Eliminar hábito: ${h.tipoHabito.descripcion}`}
                  className="font-semibold text-slate-400 hover:text-red-600 cursor-pointer"
                >
                  Eliminar
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </li>
  )
}

const FormularioDeHabito: React.FC<{
  pacienteId: number
  tipos: TipoDeHabitoDto[]
  inicial?: HabitoDto
  onGuardado: (h: HabitoDto) => void
  onCancelar: () => void
}> = ({ pacienteId, tipos, inicial, onGuardado, onCancelar }) => {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`

  const [tipoHabitoId, setTipoHabitoId] = useState(inicial ? String(inicial.tipoHabito.id) : '')
  const [nivel, setNivel] = useState<NivelDeHabito | ''>(inicial?.nivel ?? '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const texto = descripcion.trim()
    if (!tipoHabitoId || !nivel || !texto) {
      setError('El tipo, el nivel de riesgo y la descripción son obligatorios.')
      return
    }
    setEnviando(true)
    setError(null)
    const payload = { pacienteId, tipoHabitoId: Number(tipoHabitoId), nivel, descripcion: texto }
    try {
      onGuardado(inicial ? await actualizarHabito(inicial.id, payload) : await registrarHabito(payload))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo guardar el hábito.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={enviar}
      aria-label={inicial ? 'Editar hábito' : 'Nuevo hábito'}
      className="space-y-3 rounded-xl border-2 border-slate-100 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('tipo')} className={labelClass}>
            Tipo de hábito
            <Obligatorio />
          </label>
          <select
            id={id('tipo')}
            value={tipoHabitoId}
            onChange={(e) => setTipoHabitoId(e.target.value)}
            className={campoBase}
          >
            <option value="">Seleccione…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.descripcion}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('nivel')} className={labelClass}>
            Nivel de riesgo
            <Obligatorio />
          </label>
          <select
            id={id('nivel')}
            value={nivel}
            onChange={(e) => setNivel(e.target.value as NivelDeHabito | '')}
            className={campoBase}
          >
            <option value="">Seleccione…</option>
            {NIVELES.map((n) => (
              <option key={n.valor} value={n.valor}>
                {n.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={id('descripcion')} className={labelClass}>
            Descripción y frecuencia
            <Obligatorio />
          </label>
          <input
            id={id('descripcion')}
            maxLength={255}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej.: Fuma 10 cigarrillos al día desde hace 5 años"
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
          {enviando ? 'Guardando…' : 'Guardar hábito'}
        </button>
      </div>
    </form>
  )
}
