'use client'

// ─── HU-13 · Condiciones hereditarias ───────────────────────────────────────
// Enfermedades de la familia del paciente, agrupadas por el parentesco del
// familiar afectado (criterio 3). El parentesco se elige de la lista
// controlada (criterio 2): padre, madre, abuelo, abuela, hermano, hermana u
// otro.
//
// Solo el médico registra y elimina; la enfermera consulta (criterio 4).

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  campoBase,
  ErrorDeSeccion,
  labelClass,
  mensajeDe,
  Obligatorio,
  SeccionDeExpediente,
} from '@/components/clinico/SeccionDeExpediente'
import {
  agruparPorParentesco,
  crearCondicionHereditaria,
  eliminarCondicionHereditaria,
  etiquetaDeParentesco,
  listarCondicionesHereditarias,
  PARENTESCOS,
  type CondicionHereditariaDto,
  type Parentesco,
} from '@/services/antecedentes'

interface Props {
  pacienteId: number
  /** Solo el médico registra y elimina. */
  puedeEditar: boolean
  expanded: boolean
  onToggle: () => void
}

export const SeccionCondicionesHereditarias: React.FC<Props> = ({
  pacienteId,
  puedeEditar,
  expanded,
  onToggle,
}) => {
  const [condiciones, setCondiciones] = useState<CondicionHereditariaDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formularioAbierto, setFormularioAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setCondiciones(await listarCondicionesHereditarias(pacienteId))
      setError(null)
    } catch (err) {
      setCondiciones([])
      setError(mensajeDe(err, 'No se pudieron cargar las condiciones hereditarias.'))
    } finally {
      setCargando(false)
    }
  }, [pacienteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargar()
  }, [cargar])

  const grupos = useMemo(() => agruparPorParentesco(condiciones), [condiciones])

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
      icon="patients"
      titulo="Condiciones Hereditarias"
      cantidad={cargando || error ? null : condiciones.length}
      expanded={expanded}
      onToggle={onToggle}
      accion={puedeEditar && !formularioAbierto ? { etiqueta: '+ Agregar', onClick: abrirFormulario } : undefined}
    >
      {formularioAbierto && (
        <FormularioDeCondicion
          pacienteId={pacienteId}
          onGuardada={(nueva) => {
            setCondiciones((prev) => [...prev, nueva])
            setFormularioAbierto(false)
          }}
          onCancelar={() => setFormularioAbierto(false)}
        />
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando condiciones hereditarias…</p>
      ) : error ? (
        <ErrorDeSeccion mensaje={error} onReintentar={reintentar} />
      ) : grupos.length === 0 ? (
        <p className="text-sm text-slate-500">
          No hay condiciones hereditarias registradas para este paciente.
          {puedeEditar
            ? ' Registre las enfermedades de su familia con «Agregar», indicando el parentesco.'
            : ' Solo un médico puede registrarlas.'}
        </p>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => (
            <div key={grupo.parentesco}>
              <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                {etiquetaDeParentesco(grupo.parentesco)}
              </h4>
              <ul className="space-y-2">
                {grupo.condiciones.map((c) => (
                  <FilaDeCondicion
                    key={c.condicionHereditariaId}
                    condicion={c}
                    puedeEliminar={puedeEditar}
                    onEliminada={() =>
                      setCondiciones((prev) =>
                        prev.filter((x) => x.condicionHereditariaId !== c.condicionHereditariaId),
                      )
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SeccionDeExpediente>
  )
}

const FilaDeCondicion: React.FC<{
  condicion: CondicionHereditariaDto
  puedeEliminar: boolean
  onEliminada: () => void
}> = ({ condicion: c, puedeEliminar, onEliminada }) => {
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eliminar = async () => {
    setEliminando(true)
    setError(null)
    try {
      await eliminarCondicionHereditaria(c.condicionHereditariaId)
      onEliminada()
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar la condición.'))
      setEliminando(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700 break-words">{c.nombre}</p>
          {c.observaciones && <p className="mt-0.5 text-xs text-slate-500 break-words">{c.observaciones}</p>}
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
              aria-label={`Eliminar condición: ${c.nombre}`}
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

const FormularioDeCondicion: React.FC<{
  pacienteId: number
  onGuardada: (c: CondicionHereditariaDto) => void
  onCancelar: () => void
}> = ({ pacienteId, onGuardada, onCancelar }) => {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`

  const [nombre, setNombre] = useState('')
  const [parentesco, setParentesco] = useState<Parentesco | ''>('')
  const [observaciones, setObservaciones] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const texto = nombre.trim()
    if (!texto || !parentesco) {
      setError('La condición y el parentesco son obligatorios.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const notas = observaciones.trim()
      onGuardada(
        await crearCondicionHereditaria({
          pacienteId,
          nombre: texto,
          parentesco,
          ...(notas ? { observaciones: notas } : {}),
        }),
      )
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo registrar la condición.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={enviar}
      aria-label="Nueva condición hereditaria"
      className="space-y-3 rounded-xl border-2 border-slate-100 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id('nombre')} className={labelClass}>
            Condición
            <Obligatorio />
          </label>
          <input
            id={id('nombre')}
            maxLength={100}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Diabetes mellitus tipo 2"
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('parentesco')} className={labelClass}>
            Parentesco
            <Obligatorio />
          </label>
          <select
            id={id('parentesco')}
            value={parentesco}
            onChange={(e) => setParentesco(e.target.value as Parentesco | '')}
            className={campoBase}
          >
            <option value="">Seleccione…</option>
            {PARENTESCOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={id('observaciones')} className={labelClass}>
          Observaciones
        </label>
        <input
          id={id('observaciones')}
          maxLength={255}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Ej.: diagnosticada a los 50 años"
          className={campoBase}
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
          {enviando ? 'Guardando…' : 'Guardar condición'}
        </button>
      </div>
    </form>
  )
}
