'use client'

// ─── HU-14 · Hábitos y estilo de vida ───────────────────────────────────────
// Cada hábito con su tipo (del catálogo), nivel de riesgo, descripción,
// frecuencia y observaciones, y la fecha en que se actualizó con quién lo hizo
// (criterio 1). Al editar, el backend conserva el valor anterior y «Ver
// historial» lo muestra, de la versión más reciente a la más antigua, para ver
// la evolución en el tiempo (criterio 2). Los de riesgo alto salen primero y
// destacados en rojo (criterio 3). Registran y editan el médico y la
// enfermera, y el administrador consulta (y ve el historial).
//
// DEF-03: un hábito ya no se borra. «Anular» pide el motivo (10 a 500
// caracteres) y el hábito se queda en el expediente marcado como anulado, con
// el motivo, quién y cuándo, y sin acciones que lo cambien. Lo anula quien
// escribió la versión vigente o un administrador; si no es el caso, el 403 del
// backend lo dice dentro del diálogo.

import React, { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import {
  campoBase,
  ErrorDeSeccion,
  labelClass,
  mensajeDe,
  Obligatorio,
  SeccionDeExpediente,
} from '@/components/clinico/SeccionDeExpediente'
import {
  MAXIMO_MOTIVO_DE_ANULACION,
  MENSAJE_MOTIVO_DE_ANULACION,
  motivoDeAnulacionInvalido,
} from '@/lib/validaciones'
import { formatearFechaHora } from '@/services/consultas'
import {
  actualizarHabito,
  anularHabito,
  estaAnulado,
  etiquetaDeNivel,
  listarHabitos,
  listarHistorialDeHabito,
  listarTiposDeHabito,
  NIVELES,
  ordenarPorRiesgo,
  registrarHabito,
  type HabitoDto,
  type HabitoHistorialDto,
  type NivelDeHabito,
  type TipoDeHabitoDto,
} from '@/services/habitos'

interface Props {
  pacienteId: number
  /** Médico o enfermera: registran y editan. */
  puedeEditar: boolean
  /**
   * Médico, enfermera o administrador: se les ofrece «Anular». El backend
   * además exige ser quien escribió la versión vigente (o administrador).
   */
  puedeAnular: boolean
  expanded: boolean
  onToggle: () => void
}

const COLOR_DE_NIVEL: Record<NivelDeHabito, string> = {
  ALTO: 'bg-red-100 text-red-700 border-red-200',
  MODERADO: 'bg-amber-100 text-amber-800 border-amber-200',
  BAJO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export const SeccionHabitos: React.FC<Props> = ({ pacienteId, puedeEditar, puedeAnular, expanded, onToggle }) => {
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
              No hay tipos de hábito en el catálogo. El administrador debe registrarlos en{' '}
              <Link href="/catalogos" className="font-semibold underline underline-offset-2">
                Catálogos
              </Link>{' '}
              antes de poder anotar hábitos.
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
                  puedeAnular={puedeAnular}
                  onActualizado={reemplazar}
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
  puedeAnular: boolean
  /** Edición o anulación: el hábito vuelve del backend y reemplaza al de la lista. */
  onActualizado: (h: HabitoDto) => void
}> = ({ habito: h, tipos, puedeEditar, puedeAnular, onActualizado }) => {
  const [editando, setEditando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const anulado = estaAnulado(h)

  if (editando && !anulado) {
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

  const alto = h.nivel === 'ALTO' && !anulado
  // Tachado pero en slate-600/700, no más claro: sigue legible con contraste AA.
  const tachado = anulado ? 'line-through decoration-slate-500' : ''

  return (
    <li
      aria-label={anulado ? `Hábito anulado: ${h.tipoHabito.descripcion}` : undefined}
      className={`rounded-xl border px-3.5 py-2.5 ${
        anulado
          ? 'border-slate-200 bg-slate-100/70'
          : alto
            ? 'border-red-200 bg-red-50/70'
            : 'border-slate-100 bg-slate-50/60'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-sm font-semibold break-words ${anulado ? 'text-slate-600' : 'text-slate-700'} ${tachado}`}>
              {h.tipoHabito.descripcion}
            </p>
            {anulado ? (
              <span className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                Anulado
              </span>
            ) : (
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                  COLOR_DE_NIVEL[h.nivel] ?? COLOR_DE_NIVEL.BAJO
                }`}
              >
                {etiquetaDeNivel(h.nivel)}
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-xs text-slate-600 break-words ${tachado}`}>{h.descripcion}</p>
          <p className={`mt-0.5 text-xs text-slate-600 break-words ${tachado}`}>
            <span className="font-semibold text-slate-500">Frecuencia:</span> {h.frecuencia}
          </p>
          {h.observaciones && (
            <p className={`mt-0.5 text-xs text-slate-600 break-words ${tachado}`}>
              <span className="font-semibold text-slate-500">Observaciones:</span> {h.observaciones}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            Actualizado el {formatearFechaHora(h.actualizadoEn)}
            {h.actualizadoPor ? ` por ${h.actualizadoPor}` : ''}
          </p>
          {anulado && (
            <p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 break-words">
              <span className="font-semibold">Anulado</span>
              {h.anuladoEn ? ` el ${formatearFechaHora(h.anuladoEn)}` : ''}
              {h.anuladoPor ? ` por ${h.anuladoPor}` : ''}. Motivo: {h.motivoAnulacion ?? 'sin motivo registrado'}
            </p>
          )}
        </div>
        {/* Un hábito anulado no ofrece acciones que lo cambien: solo se
            consulta su historial, que es lectura. */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
          <button
            onClick={() => setHistorialAbierto((v) => !v)}
            aria-expanded={historialAbierto}
            aria-label={`${historialAbierto ? 'Ocultar' : 'Ver'} historial del hábito: ${h.tipoHabito.descripcion}`}
            className="font-semibold text-slate-500 hover:text-doc-blue cursor-pointer"
          >
            {historialAbierto ? 'Ocultar historial' : 'Ver historial'}
          </button>
          {!anulado && puedeEditar && (
            <button
              onClick={() => setEditando(true)}
              aria-label={`Editar hábito: ${h.tipoHabito.descripcion}`}
              className="font-semibold text-slate-500 hover:text-doc-blue cursor-pointer"
            >
              Editar
            </button>
          )}
          {!anulado && puedeAnular && (
            <button
              onClick={() => setAnulando(true)}
              aria-label={`Anular hábito: ${h.tipoHabito.descripcion}`}
              className="font-semibold text-red-700 hover:underline cursor-pointer"
            >
              Anular
            </button>
          )}
        </div>
      </div>
      {historialAbierto && <HistorialDeHabito habito={h} />}
      {!anulado && puedeAnular && (
        <DialogoDeAnularHabito
          habito={h}
          abierto={anulando}
          onCerrar={() => setAnulando(false)}
          onAnulado={(actualizado) => {
            setAnulando(false)
            onActualizado(actualizado)
          }}
        />
      )}
    </li>
  )
}

/**
 * DEF-03: el diálogo que anula un hábito. Pide el motivo con los mismos
 * límites que el backend (10 a 500 sin contar los espacios de los extremos),
 * muestra el contador y el aviso en línea, y no deja confirmar mientras el
 * motivo no sea válido. Si el backend lo rechaza (400, 403, 409), su mensaje
 * se queda dentro del diálogo con el motivo escrito intacto, y la lista no
 * cambia hasta que el servidor confirma.
 */
const DialogoDeAnularHabito: React.FC<{
  habito: HabitoDto
  abierto: boolean
  onCerrar: () => void
  onAnulado: (h: HabitoDto) => void
}> = ({ habito, abierto, onCerrar, onAnulado }) => {
  const uid = useId()
  const idCampo = `${uid}-motivo`
  const idAviso = `${uid}-aviso`
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalido = motivoDeAnulacionInvalido(motivo)
  const mostrarAviso = motivo.length > 0 && invalido

  const cerrar = () => {
    if (enviando) return
    setMotivo('')
    setError(null)
    onCerrar()
  }

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (invalido || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const actualizado = await anularHabito(habito.id, motivo.trim())
      setMotivo('')
      onAnulado(actualizado)
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo anular el hábito.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      isOpen={abierto}
      onClose={cerrar}
      title="Anular hábito"
      subtitle="El hábito no se borra: queda marcado como anulado con el motivo"
      icon="vitals"
      headerGradient="bg-gradient-to-r from-red-600 to-red-700"
      maxWidth="md"
    >
      <form onSubmit={enviar} aria-label={`Anular hábito: ${habito.tipoHabito.descripcion}`} className="space-y-4">
        <p className="text-sm text-slate-700 break-words">
          <span className="font-semibold">{habito.tipoHabito.descripcion}</span>: {habito.descripcion}
        </p>
        <div>
          <label htmlFor={idCampo} className={labelClass}>
            Motivo de la anulación
            <Obligatorio />
          </label>
          <textarea
            id={idCampo}
            rows={3}
            maxLength={MAXIMO_MOTIVO_DE_ANULACION}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={mostrarAviso}
            aria-describedby={idAviso}
            placeholder="Por qué este hábito no es válido (por ejemplo, se registró en el paciente equivocado)"
            className={`${campoBase} resize-none`}
          />
          <p id={idAviso} aria-live="polite" className={`mt-1 text-xs ${mostrarAviso ? 'text-red-700' : 'text-slate-500'}`}>
            {mostrarAviso ? `${MENSAJE_MOTIVO_DE_ANULACION}. ` : ''}
            {motivo.length}/{MAXIMO_MOTIVO_DE_ANULACION}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row">
          <button
            type="button"
            onClick={cerrar}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || invalido}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {enviando ? 'Anulando…' : 'Confirmar anulación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Las versiones anteriores de un hábito (criterio 2). Se piden al abrir, y
 * otra vez si el hábito se editó mientras estaba abierto (cambia
 * `actualizadoEn`): la versión que se acaba de reemplazar tiene que aparecer.
 */
const HistorialDeHabito: React.FC<{ habito: HabitoDto }> = ({ habito }) => {
  const [versiones, setVersiones] = useState<HabitoHistorialDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    listarHistorialDeHabito(habito.id)
      .then((lista) => {
        if (!vigente) return
        setVersiones(lista)
        setError(null)
      })
      .catch((err) => {
        if (vigente) setError(mensajeDe(err, 'No se pudo cargar el historial del hábito.'))
      })
    return () => {
      vigente = false
    }
  }, [habito.id, habito.actualizadoEn])

  return (
    <div className="mt-2 border-t border-slate-200 pt-2" aria-label={`Historial de ${habito.tipoHabito.descripcion}`}>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : versiones === null ? (
        <p className="text-xs text-slate-400">Cargando historial…</p>
      ) : versiones.length === 0 ? (
        <p className="text-xs text-slate-500">Este hábito no se ha modificado: no hay versiones anteriores.</p>
      ) : (
        <ol className="space-y-1.5">
          {versiones.map((v) => (
            <li key={v.historialId} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">
                {formatearFechaHora(v.actualizadoEn)} · {etiquetaDeNivel(v.nivel)}
                {v.actualizadoPor ? ` · ${v.actualizadoPor}` : ''}
              </p>
              <p className="break-words">{v.descripcion}</p>
              <p className="break-words">Frecuencia: {v.frecuencia}</p>
              {v.observaciones && <p className="break-words">Observaciones: {v.observaciones}</p>}
              <p className="text-[11px] text-slate-400">
                Reemplazado el {formatearFechaHora(v.reemplazadoEn)}
                {v.reemplazadoPor ? ` por ${v.reemplazadoPor}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
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
  const [frecuencia, setFrecuencia] = useState(inicial?.frecuencia ?? '')
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const texto = descripcion.trim()
    const cadaCuanto = frecuencia.trim()
    if (!tipoHabitoId || !nivel || !texto || !cadaCuanto) {
      setError('El tipo, el nivel de riesgo, la descripción y la frecuencia son obligatorios.')
      return
    }
    setEnviando(true)
    setError(null)
    const payload = {
      pacienteId,
      tipoHabitoId: Number(tipoHabitoId),
      nivel,
      descripcion: texto,
      frecuencia: cadaCuanto,
      // Opcionales: en blanco no viajan.
      ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
    }
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
            Descripción
            <Obligatorio />
          </label>
          <input
            id={id('descripcion')}
            maxLength={255}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej.: Fuma cigarrillos desde hace 5 años"
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('frecuencia')} className={labelClass}>
            Frecuencia
            <Obligatorio />
          </label>
          <input
            id={id('frecuencia')}
            maxLength={100}
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value)}
            placeholder="Ej.: A diario, 3 veces por semana"
            className={campoBase}
          />
        </div>
        <div>
          <label htmlFor={id('observaciones')} className={labelClass}>
            Observaciones
          </label>
          <input
            id={id('observaciones')}
            maxLength={500}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional"
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
