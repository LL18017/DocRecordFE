'use client'

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import {
  MAX_LARGO_MEDICAMENTO,
  actualizarMedicamento,
  cambiarEstadoMedicamento,
  coincideConBusqueda,
  crearMedicamento,
  listarMedicamentos,
  type GuardarMedicamentoPayload,
  type MedicamentoCatalogoDto,
} from '@/services/medicamentos'

/**
 * Catálogo de medicamentos (HU-23). Solo la ve el Administrador (ver
 * `RUTAS_DEL_PORTAL`), que es quien lo mantiene; los médicos lo usan desde el
 * formulario de la receta, no desde aquí.
 *
 * Se piden también los DESACTIVADOS: esta es la única pantalla desde la que se
 * pueden reactivar, y una lista que los escondiera haría parecer que se
 * borraron. Se muestran detrás de un interruptor para que la vista normal sea
 * la misma lista que ve el médico al recetar.
 */
export default function MedicamentosPage() {
  const [lista, setLista] = useState<MedicamentoCatalogoDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [verDesactivados, setVerDesactivados] = useState(false)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [editando, setEditando] = useState<MedicamentoCatalogoDto | null>(null)
  const [porDesactivar, setPorDesactivar] = useState<MedicamentoCatalogoDto | null>(null)
  const [cambiandoEstado, setCambiandoEstado] = useState<number | null>(null)

  const uid = useId()

  const cargar = useCallback(async () => {
    try {
      setLista(await listarMedicamentos({ incluirInactivos: true }))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo de medicamentos.')
    } finally {
      setCargando(false)
    }
  }, [])

  // Mismo caso que en la pantalla de clínicas: la regla marca los setState
  // posteriores al await, pero aquí no hay render en cascada.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargar()
  }, [cargar])

  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargar()
  }

  const desactivados = lista.filter((m) => !m.activo).length

  // Se filtra en el cliente, con el mismo criterio sin tildes que el backend
  // (`coincideConBusqueda`): la lista entera ya está cargada, y así la caja
  // responde en cada tecla.
  const visibles = useMemo(
    () =>
      lista.filter((m) => (verDesactivados || m.activo) && coincideConBusqueda(m, busqueda)),
    [lista, verDesactivados, busqueda],
  )

  /** Reemplaza la fila por la que devolvió el servidor, o la agrega si es nueva. */
  const reflejar = (guardado: MedicamentoCatalogoDto) => {
    setLista((prev) =>
      prev.some((m) => m.medicamentoId === guardado.medicamentoId)
        ? prev.map((m) => (m.medicamentoId === guardado.medicamentoId ? guardado : m))
        : [...prev, guardado],
    )
  }

  const cambiarEstado = async (medicamento: MedicamentoCatalogoDto, activo: boolean) => {
    // Sin optimismo: el estado cambia en pantalla cuando el servidor confirma.
    setCambiandoEstado(medicamento.medicamentoId)
    setError(null)
    try {
      reflejar(await cambiarEstadoMedicamento(medicamento.medicamentoId, activo))
      setPorDesactivar(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado del medicamento.')
      setPorDesactivar(null)
    } finally {
      setCambiandoEstado(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Catálogo de medicamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            La lista desde la que los médicos recetan. Lo que no esté aquí no se puede recetar.
          </p>
        </div>
        <button
          onClick={() => setMostrarAlta(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Agregar medicamento
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button
            onClick={reintentar}
            className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <label htmlFor={`${uid}-buscar`} className="sr-only">
            Buscar en el catálogo
          </label>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" size={16} />
          </span>
          <input
            id={`${uid}-buscar`}
            type="search"
            placeholder="Buscar por nombre genérico, comercial o principio activo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl pl-9 pr-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verDesactivados}
            onChange={(e) => setVerDesactivados(e.target.checked)}
            className="w-4 h-4 accent-purple-600"
          />
          Mostrar desactivados ({desactivados})
        </label>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando catálogo…
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          {lista.length === 0
            ? 'El catálogo está vacío. Registra el primer medicamento para que se pueda recetar.'
            : 'Ningún medicamento coincide con la búsqueda.'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th scope="col" className="px-4 py-3 font-semibold">Nombre genérico</th>
                <th scope="col" className="px-4 py-3 font-semibold">Nombre comercial</th>
                <th scope="col" className="px-4 py-3 font-semibold">Principio activo</th>
                <th scope="col" className="px-4 py-3 font-semibold">Presentación</th>
                <th scope="col" className="px-4 py-3 font-semibold">Concentración</th>
                <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => (
                <tr
                  key={m.medicamentoId}
                  className={`border-b border-slate-50 last:border-0 ${m.activo ? '' : 'bg-slate-50/70 text-slate-400'}`}
                >
                  <td className="px-4 py-3 font-medium">{m.nombreGenerico}</td>
                  <td className="px-4 py-3">{m.nombreComercial}</td>
                  <td className="px-4 py-3">{m.principioActivo}</td>
                  <td className="px-4 py-3">{m.presentacion}</td>
                  <td className="px-4 py-3">{m.concentracion}</td>
                  <td className="px-4 py-3">
                    {m.activo ? <Badge color="green">Activo</Badge> : <Badge color="gray">Desactivado</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditando(m)}
                        aria-label={`Editar ${m.descripcion}`}
                        className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      {m.activo ? (
                        <button
                          onClick={() => setPorDesactivar(m)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
                          aria-label={`Desactivar ${m.descripcion}`}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => void cambiarEstado(m, true)}
                          disabled={cambiandoEstado === m.medicamentoId}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-60"
                          aria-label={`Reactivar ${m.descripcion}`}
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* La baja se confirma porque saca el medicamento de las recetas de
          todos los médicos a la vez; y se dice lo que NO hace —borrar— para
          que nadie dude en usarla por miedo a perder el historial. */}
      <Modal
        isOpen={porDesactivar !== null}
        onClose={() => setPorDesactivar(null)}
        title="Desactivar medicamento"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-amber-500 to-amber-600"
        maxWidth="sm"
      >
        {porDesactivar && (
          <div className="text-center py-2">
            <p className="font-semibold text-slate-800 mb-4 font-outfit">{porDesactivar.descripcion}</p>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Deja de ofrecerse al emitir recetas nuevas. No se borra: las recetas emitidas antes lo
              siguen mostrando, y puedes reactivarlo cuando quieras.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPorDesactivar(null)}
                disabled={cambiandoEstado !== null}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void cambiarEstado(porDesactivar, false)}
                disabled={cambiandoEstado !== null}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-all cursor-pointer disabled:opacity-60"
              >
                {cambiandoEstado !== null ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={mostrarAlta}
        onClose={() => setMostrarAlta(false)}
        title="Nuevo medicamento"
        subtitle="Alta en el catálogo"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
      >
        <FormularioMedicamento
          onGuardado={(m) => {
            reflejar(m)
            setMostrarAlta(false)
          }}
          onCancel={() => setMostrarAlta(false)}
        />
      </Modal>

      <Modal
        isOpen={editando !== null}
        onClose={() => setEditando(null)}
        title="Editar medicamento"
        subtitle="Las recetas ya emitidas conservan el nombre con el que se recetó"
        icon="edit"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
      >
        {editando && (
          <FormularioMedicamento
            medicamento={editando}
            onGuardado={(m) => {
              reflejar(m)
              setEditando(null)
            }}
            onCancel={() => setEditando(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Formulario de alta y edición ───────────────────────────────────────────

type Campo = keyof GuardarMedicamentoPayload

/** Los cinco datos que exige HU-23 criterio 1, en el orden en que se piensan. */
const CAMPOS: readonly [Campo, string, string][] = [
  ['nombreGenerico', 'Nombre genérico', 'Amoxicilina'],
  ['nombreComercial', 'Nombre comercial', 'Amoxil'],
  ['principioActivo', 'Principio activo', 'Amoxicilina'],
  ['presentacion', 'Presentación', 'Cápsula'],
  ['concentracion', 'Concentración', '500 mg'],
]

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40 transition-colors'
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

interface FormularioMedicamentoProps {
  /** Presente en edición; ausente en alta. */
  medicamento?: MedicamentoCatalogoDto
  onGuardado: (medicamento: MedicamentoCatalogoDto) => void
  onCancel: () => void
}

const FormularioMedicamento: React.FC<FormularioMedicamentoProps> = ({
  medicamento,
  onGuardado,
  onCancel,
}) => {
  const [form, setForm] = useState<GuardarMedicamentoPayload>({
    nombreGenerico: medicamento?.nombreGenerico ?? '',
    nombreComercial: medicamento?.nombreComercial ?? '',
    principioActivo: medicamento?.principioActivo ?? '',
    presentacion: medicamento?.presentacion ?? '',
    concentracion: medicamento?.concentracion ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Qué campos señala el error: el vacío, o los tres de la clave si es un duplicado. */
  const [camposDelError, setCamposDelError] = useState<readonly Campo[]>([])

  // Un prefijo por instancia: la pantalla monta este formulario en dos modales.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`
  const idError = id('error')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Criterio 1, comprobado aquí para señalar el campo concreto en vez de
    // esperar el 400 del backend con la lista entera. En blanco cuenta como
    // vacío, igual que en el servidor.
    const vacio = CAMPOS.find(([campo]) => !form[campo].trim())
    if (vacio) {
      setError(`${vacio[1]} es obligatorio.`)
      setCamposDelError([vacio[0]])
      return
    }

    setGuardando(true)
    setError(null)
    setCamposDelError([])
    try {
      const guardado = medicamento
        ? await actualizarMedicamento(medicamento.medicamentoId, form)
        : await crearMedicamento(form)
      onGuardado(guardado)
    } catch (err) {
      // Criterio 2: el 409 llega con el medicamento que ya existe nombrado, y
      // se muestra tal cual. Se señalan los tres campos que forman la clave,
      // que son los que hay que cambiar para que deje de ser un duplicado.
      setError(err instanceof Error ? err.message : 'No se pudo guardar el medicamento.')
      setCamposDelError(
        err instanceof ApiError && err.status === 409
          ? ['nombreComercial', 'presentacion', 'concentracion']
          : [],
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {CAMPOS.map(([campo, etiqueta, ejemplo]) => {
        const senalado = camposDelError.includes(campo)
        return (
          <div key={campo}>
            <label htmlFor={id(campo)} className={labelClass}>
              {etiqueta}
              <Obligatorio />
            </label>
            <input
              id={id(campo)}
              required
              maxLength={MAX_LARGO_MEDICAMENTO[campo]}
              placeholder={ejemplo}
              value={form[campo]}
              onChange={(e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }))}
              aria-invalid={senalado ? true : undefined}
              aria-describedby={senalado ? idError : undefined}
              className={inputClass}
            />
          </div>
        )
      })}

      <p className="text-xs text-slate-400">
        Si el producto lleva varios principios activos, sepáralos con « + » (por ejemplo,
        «Amoxicilina + Ácido clavulánico»).
      </p>

      {error && (
        <p
          id={idError}
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={guardando}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar medicamento'}
        </button>
      </div>
    </form>
  )
}
