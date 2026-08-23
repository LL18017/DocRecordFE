'use client'

import dynamic from 'next/dynamic'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Clinica } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useAppContext } from '@/context/AppContext'
import { ApiError } from '@/lib/api'
import { tieneUbicacion } from '@/lib/mapaClinicas'
import {
  MAX_LARGO_NOMBRE_CLINICA,
  actualizarClinica,
  clinicaDtoAClinica,
  crearClinica,
  eliminarClinica,
  formatearCoordenadas,
  listarMisClinicas,
  type ClinicaDto,
} from '@/services/clinicas'

const SIN_UBICACION = 'Sin ubicación registrada'

// Leaflet lee `document` en cuanto se importa, así que el módulo del mapa no
// puede formar parte del renderizado en servidor: 'use client' marca dónde vive
// la interactividad, pero el App Router igual prerenderiza estos componentes en
// Node. `ssr: false` es lo que lo deja fuera de ese paso y lo carga solo en el
// navegador; la opción solo se admite dentro de un componente de cliente, que es
// justo lo que es esta página.
const MapaClinicas = dynamic(() => import('@/components/mapa/MapaClinicas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-slate-500">
      Cargando mapa…
    </div>
  ),
})

export default function ClinicasPage() {
  const { activeClinic, setActiveClinic } = useAppContext()
  // La lista sale de GET /clinics/mias. Antes se sembraba con los datos de la
  // maqueta: la pantalla se veía llena aunque el backend estuviera caído y una
  // clínica recién creada desaparecía al recargar.
  const [list, setList] = useState<Clinica[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editando, setEditando] = useState<Clinica | null>(null)
  const [workModal, setWorkModal] = useState<Clinica | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Clinica | null>(null)
  const [eliminando, setEliminando] = useState(false)

  // Sin setState antes del primer await: hacerlo de forma síncrona dentro del
  // efecto provoca renders en cascada y lo prohíbe react-hooks/set-state-in-effect.
  // `cargando` ya arranca en true, así que la carga inicial no se anuncia.
  const cargarClinicas = useCallback(async () => {
    try {
      const clinicas = await listarMisClinicas()
      setList(clinicas.map(clinicaDtoAClinica))
      setError(null)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cargar la lista de clínicas.',
      )
    } finally {
      setCargando(false)
    }
  }, [])

  // Mismo caso que en la pantalla de pacientes: la regla sigue la función
  // llamada y marca los setState posteriores al await, pero aquí no hay render
  // en cascada —el estado se escribe cuando llega la respuesta, no durante el
  // render—. Se desactiva de forma acotada, no global.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarClinicas()
  }, [cargarClinicas])

  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargarClinicas()
  }

  // La selección se guarda por id y no como objeto: así la ficha de la derecha
  // sigue a la fila aunque esta se recargue o se edite, y no se queda mostrando
  // una copia vieja.
  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) ?? list[0] ?? null,
    [list, selectedId],
  )

  const handleClinicaCreada = (dto: ClinicaDto) => {
    const clinica = clinicaDtoAClinica(dto)
    setList((prev) => [...prev, clinica])
    setSelectedId(clinica.id)
    setShowNew(false)
  }

  const handleClinicaEditada = (dto: ClinicaDto) => {
    const clinica = clinicaDtoAClinica(dto)
    setList((prev) => prev.map((c) => (c.id === clinica.id ? clinica : c)))
    // Si se editó la clínica en la que se está trabajando, el contexto guarda
    // una copia propia: sin esto la barra superior seguiría con el nombre viejo.
    if (activeClinic?.id === clinica.id) setActiveClinic(clinica)
    setEditando(null)
  }

  const handleEliminar = async (clinica: Clinica) => {
    // Nada de optimismo: la fila desaparece solo cuando el servidor confirma
    // la baja. Un 403 —la clínica es de otro médico— dejaría si no una lista
    // que miente hasta el próximo refresco.
    setEliminando(true)
    setError(null)
    try {
      await eliminarClinica(clinica.id)
      setList((prev) => prev.filter((c) => c.id !== clinica.id))
      if (selectedId === clinica.id) setSelectedId(null)
      // La sede activa acaba de dejar de existir: seguir "operando" en ella
      // dejaría la sesión apuntando a una clínica borrada.
      if (activeClinic?.id === clinica.id) setActiveClinic(null)
      setDeleteConfirm(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar la clínica.')
      setDeleteConfirm(null)
    } finally {
      setEliminando(false)
    }
  }

  // El mapa decide por su cuenta cuáles puede dibujar; aquí solo se cuentan
  // las que se quedan fuera para poder decirlo.
  const sinUbicacion = list.filter((c) => !tieneUbicacion(c)).length

  return (
    <div>
      {/* Header and top state */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Gestión de Clínicas</h1>
          {activeClinic && (
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Operando en: <span className="font-semibold text-emerald-700">{activeClinic.name}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-emerald-600 hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Agregar Clínica
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

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando clínicas…
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-doc-surface flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Icon name="clinicas" size={26} />
          </div>
          <p className="font-semibold text-slate-700 font-outfit">
            Todavía no tienes clínicas registradas
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Registra tu primera sede para poder atender pacientes en ella.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-emerald-600 hover:opacity-90 shadow-sm transition-all cursor-pointer"
          >
            <Icon name="add" size={16} color="white" /> Agregar Clínica
          </button>
        </div>
      ) : (
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left clinic list */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-500 text-xs uppercase tracking-wider">
            Clínicas registradas ({list.length})
          </h3>
          {list.map((c) => {
            const isActive = activeClinic?.id === c.id
            const isSelected = selected?.id === c.id
            const coordenadas = formatearCoordenadas(c.lat, c.lng)
            return (
              <div
                key={c.id}
                className={`rounded-2xl border-2 transition-all overflow-hidden ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left p-4 cursor-pointer"
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center relative shadow-2xs ${
                        isSelected ? 'bg-doc-blue text-white' : 'bg-doc-surface text-slate-500'
                      }`}
                    >
                      <Icon name="clinicas" size={18} />
                      {isActive && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white ring-1 ring-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 text-sm truncate font-outfit">{c.name}</p>
                        {isActive && <Badge color="green">Activa</Badge>}
                      </div>
                      {/* El backend solo guarda coordenadas; no hay dirección ni
                          teléfono que mostrar, y una clínica puede no tener ni
                          coordenadas. Se dice, en vez de dejar el hueco. */}
                      <p
                        className={`text-xs truncate ${
                          coordenadas ? 'text-slate-400 font-mono' : 'text-amber-600'
                        }`}
                      >
                        {coordenadas ?? SIN_UBICACION}
                      </p>
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 px-4 pb-3">
                  <button
                    onClick={() => setWorkModal(c)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-xs cursor-pointer ${
                      isActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-doc-blue hover:bg-doc-blue-light'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Icon name="vitals" size={13} color="white" /> Clínica activa
                      </>
                    ) : (
                      <>
                        <Icon name="clinicas" size={13} color="white" /> Trabajar aquí
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setEditando(c)}
                    className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    title="Editar clínica"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(c)}
                    className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                    title="Eliminar clínica"
                  >
                    <Icon name="delete" size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Map View */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden flex flex-col">
          {selected && (
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 font-outfit">{selected.name}</h3>
                  {activeClinic?.id === selected.id && <Badge color="green">Clínica activa</Badge>}
                </div>
                <p
                  className={`text-xs mt-0.5 ${
                    formatearCoordenadas(selected.lat, selected.lng)
                      ? 'text-slate-400 font-mono'
                      : 'text-amber-600'
                  }`}
                >
                  {formatearCoordenadas(selected.lat, selected.lng) ?? SIN_UBICACION}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setWorkModal(selected)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                    activeClinic?.id === selected.id ? 'bg-emerald-600' : 'bg-doc-blue hover:opacity-90'
                  }`}
                >
                  <Icon name="clinicas" size={13} color="white" />
                  {activeClinic?.id === selected.id ? 'Activa' : 'Trabajar aquí'}
                </button>
              </div>
            </div>
          )}

          {/* `min-h` y no `h`: dentro de un flex, `flex-1` manda sobre la
              altura fija y el mapa se aplastaba a unos pocos píxeles cuando la
              columna de la izquierda traía una sola clínica.

              `isolate` no es decorativo: Leaflet apila sus capas hasta z-index
              800 y sus controles en 1000. Sin un contexto de apilamiento
              propio, las teselas se dibujarían por encima de la barra superior
              (z-20) y de los modales (z-50). */}
          <div className="relative isolate overflow-hidden min-h-96 w-full flex-1">
            <MapaClinicas
              clinicas={list}
              seleccionadaId={selected?.id ?? null}
              activaId={activeClinic?.id ?? null}
              onSeleccionar={(c) => setSelectedId(c.id)}
              onTrabajarAqui={(c) => setWorkModal(c)}
            />

            {/* Abajo a la izquierda: a la derecha está la atribución de
                OpenStreetMap y arriba a la izquierda los controles de zoom.
                `pointer-events-none` para no capturar el arrastre del mapa, y
                z-index por encima de los controles de Leaflet. */}
            {sinUbicacion > 0 && (
              <div className="pointer-events-none absolute bottom-8 left-2 z-[1000] bg-white/95 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 shadow-2xs max-w-[16rem]">
                {sinUbicacion === 1
                  ? '1 clínica no aparece en el mapa porque no tiene ubicación registrada.'
                  : `${sinUbicacion} clínicas no aparecen en el mapa porque no tienen ubicación registrada.`}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Modal: Trabajar en esta clínica */}
      <Modal
        isOpen={workModal !== null}
        onClose={() => setWorkModal(null)}
        title="Trabajar en esta clínica"
        subtitle="Cambio de sede de operaciones"
        icon="clinicas"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
      >
        {workModal && (
          <div className="text-center py-2">
            <h4 className="text-lg font-bold mb-1 text-doc-blue font-outfit">{workModal.name}</h4>
            <div className="flex items-center justify-center gap-4 text-xs mb-6 font-mono">
              <span
                className={
                  formatearCoordenadas(workModal.lat, workModal.lng)
                    ? 'text-slate-400'
                    : 'text-amber-600 font-sans'
                }
              >
                {formatearCoordenadas(workModal.lat, workModal.lng) ?? SIN_UBICACION}
              </span>
            </div>

            {activeClinic && activeClinic.id !== workModal.id && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800 text-left">
                Actualmente operando en <strong>{activeClinic.name}</strong>. Se cambiará la sesión a la nueva sede.
              </div>
            )}
            {activeClinic?.id === workModal.id && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6 text-sm text-emerald-800 flex items-center gap-2 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Esta es tu clínica activa actualmente.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setWorkModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setActiveClinic(workModal)
                  setWorkModal(null)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
              >
                {activeClinic?.id === workModal.id ? 'Continuar aquí' : 'Establecer como activa'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Confirmar eliminación */}
      <Modal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Eliminar clínica"
        icon="delete"
        headerGradient="bg-gradient-to-r from-red-500 to-red-600"
        maxWidth="sm"
      >
        {deleteConfirm && (
          <div className="text-center py-2">
            <p className="text-slate-500 text-sm mb-1">¿Estás seguro de eliminar</p>
            <p className="font-semibold text-slate-800 mb-4 font-outfit">&ldquo;{deleteConfirm.name}&rdquo;?</p>
            <p className="text-xs text-red-500 mb-6">Esta acción no se puede deshacer.</p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={eliminando}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleEliminar(deleteConfirm)}
                disabled={eliminando}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Nueva Clínica */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nueva Clínica"
        subtitle="Registro de nueva sede de atención"
        icon="clinicas"
        headerGradient="bg-gradient-to-r from-emerald-600 to-teal-700"
      >
        <FormularioClinica onGuardada={handleClinicaCreada} onCancel={() => setShowNew(false)} />
      </Modal>

      {/* Modal: Editar Clínica */}
      <Modal
        isOpen={editando !== null}
        onClose={() => setEditando(null)}
        title="Editar Clínica"
        subtitle="Actualizar datos de la sede"
        icon="edit"
        headerGradient="bg-gradient-to-r from-emerald-600 to-teal-700"
      >
        {editando && (
          <FormularioClinica
            clinica={editando}
            onGuardada={handleClinicaEditada}
            onCancel={() => setEditando(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Formulario de alta y edición ───────────────────────────────────────────
// Vive aquí y no en components/forms/ClinicForm.tsx porque aquel construye una
// Clinica en memoria (con dirección, teléfono y número de pacientes que el
// backend no conoce) y no sabe editar. Este habla con el API y refleja lo que
// `ClinicasRequestDto` acepta de verdad: nombre y coordenadas.

interface FormularioClinicaProps {
  /** Presente en edición; ausente en alta. */
  clinica?: Clinica
  onGuardada: (clinica: ClinicaDto) => void
  onCancel: () => void
}

const FormularioClinica: React.FC<FormularioClinicaProps> = ({
  clinica,
  onGuardada,
  onCancel,
}) => {
  const [form, setForm] = useState({
    name: clinica?.name ?? '',
    // Las coordenadas se guardan como texto mientras se escriben: un input
    // numérico controlado por un number no deja teclear "-" ni "13." a medias.
    lat: clinica?.lat !== null && clinica?.lat !== undefined ? String(clinica.lat) : '',
    lng: clinica?.lng !== null && clinica?.lng !== undefined ? String(clinica.lng) : '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const name = form.name.trim()
    const latitud = parsearCoordenada(form.lat, 90)
    const longitud = parsearCoordenada(form.lng, 180)

    if (!name) {
      setError('El nombre de la clínica es obligatorio.')
      return
    }
    if (name.length > MAX_LARGO_NOMBRE_CLINICA) {
      setError(`El nombre no puede superar los ${MAX_LARGO_NOMBRE_CLINICA} caracteres.`)
      return
    }
    // El backend exige ambas coordenadas aunque la columna admita nulos, así
    // que se avisa aquí en vez de dejar que responda un 400 genérico.
    if (latitud === null || longitud === null) {
      setError('Latitud y longitud son obligatorias (entre -90 y 90, y entre -180 y 180).')
      return
    }

    setGuardando(true)
    setError(null)
    try {
      const guardada = clinica
        ? await actualizarClinica(clinica.id, { name, latitud, longitud })
        : await crearClinica({ name, latitud, longitud })
      onGuardada(guardada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la clínica.')
    } finally {
      setGuardando(false)
    }
  }

  const campos: [string, 'name' | 'lat' | 'lng', string][] = [
    ['Nombre de la clínica *', 'name', 'Clínica Familiar Escalón'],
    ['Latitud *', 'lat', '13.7053'],
    ['Longitud *', 'lng', '-89.2182'],
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {clinica && formatearCoordenadas(clinica.lat, clinica.lng) === null && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Esta clínica no tiene ubicación registrada. Para guardar cambios hay que
          indicar latitud y longitud.
        </p>
      )}

      {campos.map(([label, field, ph]) => (
        <div key={field}>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
            {label}
          </label>
          <input
            required
            maxLength={field === 'name' ? MAX_LARGO_NOMBRE_CLINICA : undefined}
            placeholder={ph}
            value={form[field]}
            onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors bg-white"
          />
        </div>
      ))}

      <p className="text-xs text-slate-400">
        Las coordenadas ubican la clínica en el mapa. El sistema aún no guarda
        dirección ni teléfono.
      </p>

      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
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
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar Clínica'}
        </button>
      </div>
    </form>
  )
}

/**
 * Convierte el texto del input en coordenada, o `null` si no sirve. Se
 * comprueba el vacío aparte porque `Number('')` es 0, que además es una
 * coordenada perfectamente válida en medio del golfo de Guinea.
 */
function parsearCoordenada(texto: string, maximo: number): number | null {
  const limpio = texto.trim()
  if (!limpio) return null
  const valor = Number(limpio)
  if (!Number.isFinite(valor) || Math.abs(valor) > maximo) return null
  return valor
}
