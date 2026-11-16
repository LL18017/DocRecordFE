'use client'

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { campoBase, labelClass, Obligatorio } from '@/components/clinico/SeccionDeExpediente'
import {
  MAX_DESCRIPCION_TIPO_CITA,
  MAX_DESCRIPCION_TIPO_HABITO,
  MAX_NOMBRE_TIPO_CITA,
  actualizarTipoDeCita,
  actualizarTipoDeHabito,
  crearTipoDeCita,
  crearTipoDeHabito,
  eliminarTipoDeCita,
  eliminarTipoDeHabito,
  listarTiposDeCita,
  listarTiposDeHabito,
  ordenarPorNombre,
  yaExiste,
  type TipoDeCitaDto,
  type TipoDeHabitoDto,
} from '@/services/catalogos'

/**
 * Catálogos (DEF-01 · HU-14 y HU-30). Solo la ve el Administrador (ver
 * `RUTAS_DEL_PORTAL`): es quien mantiene las dos listas de las que dependen la
 * agenda (tipos de cita) y la sección de hábitos del expediente (tipos de
 * hábito). Cuando alguna está vacía, esas pantallas mandan aquí.
 *
 * El backend no tiene «desactivar» para ninguno de los dos: solo borrar, y
 * rechaza borrar un tipo que ya se usa. Ese rechazo se muestra con su mensaje.
 */
export default function CatalogosPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Catálogos</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Las listas que usan la agenda y el expediente. Lo que no esté aquí no se puede elegir.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SeccionDeCatalogo config={TIPOS_DE_CITA} />
        <SeccionDeCatalogo config={TIPOS_DE_HABITO} />
      </div>
    </div>
  )
}

// ─── Configuración de cada catálogo ─────────────────────────────────────────
//
// Los dos catálogos se presentan igual, pero el backend los nombra distinto:
// el tipo de cita tiene `tipoCitaId`, `nombre` y `descripcion` opcional; el de
// hábito tiene `id` y su nombre visible se llama `descripcion`. Cada uno se
// adapta aquí a la misma forma, para que la sección sea una sola.

interface Elemento {
  id: number
  nombre: string
  /** Solo los tipos de cita la tienen. */
  descripcion: string | null
}

interface DatosDelFormulario {
  nombre: string
  descripcion: string
}

interface ConfigDeCatalogo {
  clave: string
  titulo: string
  ayuda: string
  /** «tipo de cita», para los mensajes. */
  singular: string
  etiquetaNombre: string
  ejemploNombre: string
  maxNombre: number
  /** Campo de descripción opcional (solo tipos de cita). */
  descripcion?: { etiqueta: string; ejemplo: string; max: number }
  vacio: string
  avisoAlEliminar: string
  listar: () => Promise<Elemento[]>
  crear: (datos: DatosDelFormulario) => Promise<Elemento>
  actualizar: (id: number, datos: DatosDelFormulario) => Promise<Elemento>
  eliminar: (id: number) => Promise<void>
}

const deCita = (t: TipoDeCitaDto): Elemento => ({
  id: t.tipoCitaId,
  nombre: t.nombre,
  descripcion: t.descripcion,
})
const deHabito = (t: TipoDeHabitoDto): Elemento => ({
  id: t.id,
  nombre: t.descripcion,
  descripcion: null,
})
/** La descripción vacía no viaja: el backend la guarda como null. */
const payloadDeCita = (d: DatosDelFormulario) => ({
  nombre: d.nombre.trim(),
  ...(d.descripcion.trim() ? { descripcion: d.descripcion.trim() } : {}),
})

const TIPOS_DE_CITA: ConfigDeCatalogo = {
  clave: 'tipos-cita',
  titulo: 'Tipos de cita',
  ayuda: 'Lo que se elige al agendar. Sin al menos uno, la agenda no deja agendar.',
  singular: 'tipo de cita',
  etiquetaNombre: 'Nombre',
  ejemploNombre: 'Consulta general',
  maxNombre: MAX_NOMBRE_TIPO_CITA,
  descripcion: {
    etiqueta: 'Descripción (opcional)',
    ejemplo: 'Primera consulta o control',
    max: MAX_DESCRIPCION_TIPO_CITA,
  },
  vacio: 'No hay tipos de cita. Registra el primero para que se pueda agendar.',
  avisoAlEliminar:
    'Se borra del catálogo. Si ya hay citas con este tipo, el sistema no dejará eliminarlo.',
  listar: async () => (await listarTiposDeCita()).map(deCita),
  crear: async (d) => deCita(await crearTipoDeCita(payloadDeCita(d))),
  actualizar: async (id, d) => deCita(await actualizarTipoDeCita(id, payloadDeCita(d))),
  eliminar: (id) => eliminarTipoDeCita(id),
}

const TIPOS_DE_HABITO: ConfigDeCatalogo = {
  clave: 'tipos-habito',
  titulo: 'Tipos de hábito',
  ayuda:
    'Lo que se elige al anotar un hábito en el expediente (tabaquismo, alcohol, actividad física…).',
  singular: 'tipo de hábito',
  etiquetaNombre: 'Nombre del hábito',
  ejemploNombre: 'Tabaquismo',
  maxNombre: MAX_DESCRIPCION_TIPO_HABITO,
  vacio: 'No hay tipos de hábito. Registra el primero para que se puedan anotar hábitos.',
  avisoAlEliminar:
    'Se borra del catálogo. Si ya hay hábitos registrados con este tipo, el sistema no dejará eliminarlo.',
  listar: async () => (await listarTiposDeHabito()).map(deHabito),
  crear: async (d) => deHabito(await crearTipoDeHabito({ descripcion: d.nombre.trim() })),
  actualizar: async (id, d) =>
    deHabito(await actualizarTipoDeHabito(id, { descripcion: d.nombre.trim() })),
  eliminar: (id) => eliminarTipoDeHabito(id),
}

const mensajeDe = (error: unknown, porDefecto: string) =>
  error instanceof Error && error.message ? error.message : porDefecto

// ─── Una sección: lista, alta, edición y borrado ────────────────────────────

function SeccionDeCatalogo({ config }: { config: ConfigDeCatalogo }) {
  const [lista, setLista] = useState<Elemento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Elemento | null>(null)
  const [porEliminar, setPorEliminar] = useState<Elemento | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const idTitulo = useId()

  const { listar, titulo } = config
  const cargar = useCallback(async () => {
    try {
      setLista(await listar())
      setError(null)
    } catch (err) {
      setError(mensajeDe(err, `No se pudo cargar ${titulo.toLowerCase()}.`))
    } finally {
      setCargando(false)
    }
  }, [listar, titulo])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver medicamentos/page.tsx
    void cargar()
  }, [cargar])

  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargar()
  }

  const ordenada = useMemo(() => ordenarPorNombre(lista, (e) => e.nombre), [lista])

  /** Reemplaza el elemento por el que devolvió el servidor, o lo agrega si es nuevo. */
  const reflejar = (guardado: Elemento) => {
    setLista((prev) =>
      prev.some((e) => e.id === guardado.id)
        ? prev.map((e) => (e.id === guardado.id ? guardado : e))
        : [...prev, guardado],
    )
  }

  const eliminar = async (elemento: Elemento) => {
    // Sin optimismo: desaparece de la lista cuando el servidor lo confirma.
    setEliminando(true)
    setError(null)
    try {
      await config.eliminar(elemento.id)
      setLista((prev) => prev.filter((e) => e.id !== elemento.id))
      if (editando?.id === elemento.id) setEditando(null)
    } catch (err) {
      setError(mensajeDe(err, `No se pudo eliminar el ${config.singular}.`))
    } finally {
      setEliminando(false)
      setPorEliminar(null)
    }
  }

  return (
    <section
      aria-labelledby={idTitulo}
      className="min-w-0 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
    >
      <h2 id={idTitulo} className="font-outfit text-base font-bold text-slate-800">
        {config.titulo}
      </h2>
      <p className="mt-0.5 mb-4 text-xs text-slate-500">{config.ayuda}</p>

      <FormularioDeCatalogo
        // La `key` vacía el formulario al pasar de editar a crear (o de un
        // elemento a otro) sin tener que sincronizar estado a mano.
        key={editando ? `editar-${editando.id}` : 'nuevo'}
        config={config}
        lista={lista}
        editando={editando}
        onGuardado={(e) => {
          reflejar(e)
          setEditando(null)
        }}
        onCancelar={() => setEditando(null)}
      />

      {error && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-2 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="break-words">{error}</span>
          <button
            type="button"
            onClick={reintentar}
            className="self-start whitespace-nowrap font-semibold underline underline-offset-2 cursor-pointer sm:self-auto"
          >
            Recargar
          </button>
        </div>
      )}

      <div className="mt-4">
        {cargando ? (
          <p className="py-6 text-center text-sm text-slate-500">Cargando…</p>
        ) : ordenada.length === 0 ? (
          !error && (
            <p
              role="status"
              className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500"
            >
              {config.vacio}
            </p>
          )
        ) : (
          <ul aria-label={config.titulo} className="divide-y divide-slate-100">
            {ordenada.map((e) => (
              <li
                key={e.id}
                className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  editando?.id === e.id ? 'bg-purple-50/60 -mx-2 px-2 rounded-lg' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-slate-800">{e.nombre}</p>
                  {e.descripcion && (
                    <p className="break-words text-xs text-slate-500">{e.descripcion}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditando(e)}
                    aria-label={`Editar ${e.nombre}`}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <Icon name="edit" size={12} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPorEliminar(e)}
                    aria-label={`Eliminar ${e.nombre}`}
                    className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <Icon name="delete" size={12} /> Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={porEliminar !== null}
        onClose={() => (eliminando ? undefined : setPorEliminar(null))}
        title={`Eliminar ${config.singular}`}
        icon="delete"
        headerGradient="bg-gradient-to-r from-red-600 to-red-700"
        maxWidth="sm"
      >
        {porEliminar && (
          <div className="py-2 text-center">
            <p className="mb-4 break-words font-outfit font-semibold text-slate-800">
              {porEliminar.nombre}
            </p>
            <p className="mb-6 text-xs leading-relaxed text-slate-500">{config.avisoAlEliminar}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setPorEliminar(null)}
                disabled={eliminando}
                className="flex-1 rounded-xl border-2 border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void eliminar(porEliminar)}
                disabled={eliminando}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-all cursor-pointer disabled:opacity-60"
              >
                {eliminando ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

// ─── Formulario de alta y edición ───────────────────────────────────────────

interface FormularioProps {
  config: ConfigDeCatalogo
  lista: readonly Elemento[]
  /** Presente en edición; `null` en alta. */
  editando: Elemento | null
  onGuardado: (elemento: Elemento) => void
  onCancelar: () => void
}

function FormularioDeCatalogo({ config, lista, editando, onGuardado, onCancelar }: FormularioProps) {
  const [datos, setDatos] = useState<DatosDelFormulario>({
    nombre: editando?.nombre ?? '',
    descripcion: editando?.descripcion ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`
  const idError = id('error')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (guardando) return

    // En blanco cuenta como vacío, igual que en el servidor (`@NotBlank`).
    if (!datos.nombre.trim()) {
      setError(`${config.etiquetaNombre} es obligatorio.`)
      return
    }
    // El backend no impide los repetidos; se evita aquí comparando contra la
    // lista cargada, sin distinguir mayúsculas ni tildes.
    if (yaExiste(lista, datos.nombre, (x) => x.nombre, (x) => x.id, editando?.id)) {
      setError(`Ya existe un ${config.singular} llamado «${datos.nombre.trim()}».`)
      return
    }

    setGuardando(true)
    setError(null)
    try {
      const guardado = editando
        ? await config.actualizar(editando.id, datos)
        : await config.crear(datos)
      onGuardado(guardado)
      if (!editando) setDatos({ nombre: '', descripcion: '' })
    } catch (err) {
      // El mensaje del backend tal cual (validación, 403, 404…).
      setError(mensajeDe(err, `No se pudo guardar el ${config.singular}.`))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={editando ? `Editar ${config.singular}` : `Nuevo ${config.singular}`}
      className="space-y-3 rounded-xl bg-slate-50 p-4"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {editando ? `Editar «${editando.nombre}»` : `Nuevo ${config.singular}`}
      </p>

      {/* Una sola columna siempre: en un teléfono nada se sale de la pantalla. */}
      <div>
        <label htmlFor={id('nombre')} className={labelClass}>
          {config.etiquetaNombre}
          <Obligatorio />
        </label>
        <input
          id={id('nombre')}
          required
          maxLength={config.maxNombre}
          placeholder={config.ejemploNombre}
          value={datos.nombre}
          onChange={(e) => setDatos((prev) => ({ ...prev, nombre: e.target.value }))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className={`${campoBase} w-full min-w-0`}
        />
      </div>

      {config.descripcion && (
        <div>
          <label htmlFor={id('descripcion')} className={labelClass}>
            {config.descripcion.etiqueta}
          </label>
          <input
            id={id('descripcion')}
            maxLength={config.descripcion.max}
            placeholder={config.descripcion.ejemplo}
            value={datos.descripcion}
            onChange={(e) => setDatos((prev) => ({ ...prev, descripcion: e.target.value }))}
            className={`${campoBase} w-full min-w-0`}
          />
        </div>
      )}

      {error && (
        <p
          id={idError}
          role="alert"
          className="break-words rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {editando && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={guardando}
          className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {!editando && <Icon name="add" size={14} color="white" />}
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar'}
        </button>
      </div>
    </form>
  )
}
