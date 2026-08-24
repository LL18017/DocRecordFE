'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'
import type { OpcionPaciente } from '@/components/forms/ConsultationForm'
import { listarPacientes } from '@/services/pacientes'
import { formatearFechaHora } from '@/services/consultas'
import {
  eliminarPrescripcion,
  listarHistoricoDePrescripciones,
  nombreDeMedicoQueReceta,
  nombreDePacienteDeReceta,
  textoOpcional,
  type FiltroHistoricoDeRecetas,
  type PrescripcionDto,
  type PrescripcionMedicoDto,
} from '@/services/prescripciones'

const CABECERAS = ['Medicamento', 'Dosis', 'Frecuencia', 'Duración']

export default function PrescripcionesPage() {
  // Catálogo de pacientes, para el filtro y para el formulario de emisión. Es
  // un catálogo REAL: todo paciente existe ahí, tenga o no recetas.
  const [pacientes, setPacientes] = useState<OpcionPaciente[]>([])
  const [cargandoPacientes, setCargandoPacientes] = useState(true)

  // `prescripciones` acumula TODAS las páginas pedidas hasta el momento (la
  // primera al montar o al cambiar un filtro, más las que sume «Cargar más»).
  // `paginaActual`/`totalPaginas`/`totalElementos` vienen del último sobre
  // recibido y describen el conjunto completo en el backend, no solo lo que
  // ya se acumuló en pantalla.
  const [prescripciones, setPrescripciones] = useState<PrescripcionDto[]>([])
  const [paginaActual, setPaginaActual] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(0)
  const [totalElementos, setTotalElementos] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)

  // Filtros del histórico. Los cuatro vacíos = histórico completo, que es lo
  // que se pide al montar: ya no hace falta elegir un paciente primero.
  const [pacienteId, setPacienteId] = useState('')
  const [medicoId, setMedicoId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const hayFiltrosActivos = Boolean(pacienteId || medicoId || desde || hasta)

  const cargarPacientes = useCallback(async () => {
    try {
      const lista = await listarPacientes()
      setPacientes(
        lista.map((p) => ({
          personaId: p.personaId,
          nombre: `${p.persona.nombres} ${p.persona.apellidos}`.trim(),
          expediente: p.expediente,
        })),
      )
    } catch (err) {
      setError(describir('No se pudo cargar el catálogo de pacientes', err))
    } finally {
      setCargandoPacientes(false)
    }
  }, [])

  /**
   * Pide una página del histórico con los filtros vigentes.
   *
   * `pagina === 0` REEMPLAZA la lista acumulada (es el caso de montar la
   * pantalla o cambiar/limpiar un filtro); cualquier página posterior se
   * SUMA a lo ya mostrado, que es lo que hace «Cargar más».
   */
  const cargarRecetas = useCallback(
    async (pagina: number) => {
      const filtro: FiltroHistoricoDeRecetas = {
        pacienteId: pacienteId ? Number(pacienteId) : undefined,
        medicoId: medicoId ? Number(medicoId) : undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        pagina,
      }
      try {
        const resultado = await listarHistoricoDePrescripciones(filtro)
        setPrescripciones((prev) =>
          pagina === 0 ? resultado.contenido : [...prev, ...resultado.contenido],
        )
        setPaginaActual(resultado.paginaActual)
        setTotalPaginas(resultado.totalPaginas)
        setTotalElementos(resultado.totalElementos)
        setError(null)
      } catch (err) {
        if (pagina === 0) setPrescripciones([])
        setError(describir('No se pudieron cargar las recetas', err))
      } finally {
        setCargando(false)
        setCargandoMas(false)
      }
    },
    [pacienteId, medicoId, desde, hasta],
  )

  // Ver el comentario equivalente en (portal)/pacientes/page.tsx: la regla
  // rastrea los setState posteriores al await, pero cargar datos remotos al
  // montar no produce el render en cascada que la regla persigue.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarPacientes()
  }, [cargarPacientes])

  // Este efecto corre al montar (histórico completo) y cada vez que cambia
  // algún filtro, porque `cargarRecetas` cambia de identidad con ellos.
  // `cargando` ya arranca en `true`, y los manejadores de cada filtro lo
  // vuelven a poner en `true` antes de disparar el cambio de estado que
  // dispara este efecto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarRecetas(0)
  }, [cargarRecetas])

  const reintentar = () => {
    setError(null)
    if (pacientes.length === 0) {
      setCargandoPacientes(true)
      void cargarPacientes()
    }
    setCargando(true)
    void cargarRecetas(0)
  }

  /** Pide la página siguiente a la última cargada y la suma a la lista. */
  const handleCargarMas = () => {
    setCargandoMas(true)
    void cargarRecetas(paginaActual + 1)
  }

  const handleCambioDePaciente = (valor: string) => {
    setPacienteId(valor)
    setCargando(true)
  }

  const handleCambioDeMedico = (valor: string) => {
    setMedicoId(valor)
    setCargando(true)
  }

  const handleCambioDesde = (valor: string) => {
    setDesde(valor)
    setCargando(true)
  }

  const handleCambioHasta = (valor: string) => {
    setHasta(valor)
    setCargando(true)
  }

  const handleLimpiarFiltros = () => {
    setPacienteId('')
    setMedicoId('')
    setDesde('')
    setHasta('')
    setCargando(true)
  }

  const handleEmitida = () => {
    setEmitiendo(false)
    // Se recarga el histórico con los FILTROS VIGENTES en este momento, no
    // «las recetas del paciente que se estaba mirando»: ese era el bug
    // reportado (el selector se quedaba en otro paciente y la receta nueva no
    // encajaba ahí). Si hay un filtro de paciente activo que no coincide con
    // quien recibió la receta nueva, es correcto que no aparezca: el filtro
    // está diciendo la verdad, no hay nada que esconder recargando distinto.
    setCargando(true)
    void cargarRecetas(0)
  }

  const handleAnular = async (prescripcionId: number) => {
    // Igual que en consultas: la tarjeta desaparece solo cuando el servidor
    // confirmó la baja.
    try {
      await eliminarPrescripcion(prescripcionId)
      setPrescripciones((prev) => prev.filter((p) => p.prescripcionId !== prescripcionId))
      // El total que reporta el backend también baja: si no se ajusta aquí,
      // «Mostrando N de TOTAL» miente hasta la próxima recarga.
      setTotalElementos((prev) => Math.max(0, prev - 1))
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo anular la receta.'))
    }
  }

  /**
   * Médicos disponibles para el filtro.
   *
   * El <select> de médico NO es un catálogo completo del personal médico: no
   * existe ningún endpoint que esta pantalla pueda consultar para armarlo (no
   * hay `/medicos` ni nada equivalente expuesto aquí; lo único con roles de
   * personal es `GET /user/all`, que es EXCLUSIVO DE ADMIN, y esta pantalla la
   * usan médicos, no solo administradores). Inventar una lista completa
   * prometería un filtro que no se puede armar de verdad.
   *
   * La salida honesta es filtrar por los médicos que YA aparecen en el
   * histórico cargado hasta el momento (dedupe por `personaId`, usando
   * `prescripcion.medico`): solo se puede elegir un médico que ya se vio
   * recetar algo en lo que está a la vista, nunca uno que todavía no aparece
   * en los resultados. No es un catálogo del personal, y este comentario
   * existe para que nadie lo confunda con un descuido más adelante.
   */
  const medicos = useMemo(() => {
    const mapa = new Map<number, PrescripcionMedicoDto>()
    for (const rx of prescripciones) {
      if (!mapa.has(rx.medico.personaId)) mapa.set(rx.medico.personaId, rx.medico)
    }
    return Array.from(mapa.values())
  }, [prescripciones])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">
            Prescripción de Medicamentos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Control y emisión de recetas médicas</p>
        </div>
        <button
          onClick={() => setEmitiendo(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-purple-600 hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nueva Prescripción
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

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Filtros
          </h2>
          {hayFiltrosActivos && (
            <button
              onClick={handleLimpiarFiltros}
              className="text-xs font-semibold text-purple-600 hover:underline cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="filtro-paciente" className="block text-xs text-slate-500 mb-1">
              Paciente
            </label>
            <select
              id="filtro-paciente"
              value={pacienteId}
              onChange={(e) => handleCambioDePaciente(e.target.value)}
              disabled={cargandoPacientes}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Todos los pacientes</option>
              {pacientes.map((p) => (
                <option key={p.personaId} value={String(p.personaId)}>
                  {p.expediente ? `${p.nombre} (${p.expediente})` : p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-medico" className="block text-xs text-slate-500 mb-1">
              Médico
            </label>
            <select
              id="filtro-medico"
              value={medicoId}
              onChange={(e) => handleCambioDeMedico(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40"
            >
              <option value="">Todos los médicos</option>
              {medicos.map((m) => (
                <option key={m.personaId} value={String(m.personaId)}>
                  {m.nombres} {m.apellidos}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-desde" className="block text-xs text-slate-500 mb-1">
              Desde
            </label>
            <input
              id="filtro-desde"
              type="date"
              value={desde}
              onChange={(e) => handleCambioDesde(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40"
            />
          </div>

          <div>
            <label htmlFor="filtro-hasta" className="block text-xs text-slate-500 mb-1">
              Hasta
            </label>
            <input
              id="filtro-hasta"
              type="date"
              value={hasta}
              onChange={(e) => handleCambioHasta(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40"
            />
          </div>
        </div>
      </div>

      {!cargando && prescripciones.length > 0 && (
        <p className="text-xs text-slate-500 mb-3">
          Mostrando {prescripciones.length} de {totalElementos} receta
          {totalElementos === 1 ? '' : 's'}
        </p>
      )}

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando recetas…
        </div>
      ) : prescripciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-400 italic">
          {hayFiltrosActivos ? (
            <>
              <p>No hay recetas con estos filtros.</p>
              <button
                onClick={handleLimpiarFiltros}
                className="not-italic mt-2 font-semibold text-purple-600 hover:underline cursor-pointer"
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <p>Todavía no hay recetas registradas en el sistema.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {prescripciones.map((rx) => (
            <div
              key={rx.prescripcionId}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80 hover:border-slate-200 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 font-outfit text-base">
                    Receta #{rx.prescripcionId}
                  </h3>
                  {/* Antes no se podía mostrar el paciente aquí: `PrescripcionDto`
                      no traía ese campo y la pantalla solo se veía filtrada por un
                      único paciente elegido de antemano. Ahora el histórico junta
                      recetas de varios pacientes a la vez, así que cada tarjeta
                      tiene que decir de quién es, con el mismo peso visual que
                      quién la firmó. */}
                  <p className="text-sm font-semibold text-slate-700 mt-1">
                    {nombreDePacienteDeReceta(rx)}
                    {rx.paciente.expediente && (
                      <span className="text-slate-400 font-normal"> ({rx.paciente.expediente})</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatearFechaHora(rx.fecha)} · Firmada por {nombreDeMedicoQueReceta(rx)} ·
                    Consulta #{rx.consultaId}
                  </p>
                </div>
                <button
                  onClick={() => handleAnular(rx.prescripcionId)}
                  aria-label={`Anular la receta ${rx.prescripcionId}`}
                  title="Anular receta"
                  className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {CABECERAS.map((h) => (
                        <th
                          key={h}
                          className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider pr-6"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rx.medicamentos.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 text-sm font-medium text-slate-800 pr-6">
                          {m.medicamento}
                        </td>
                        {/* dosis, frecuencia y duración son opcionales al
                            crear, así que vuelven null: `textoOpcional` evita
                            que la receta muestre «null» camino a la farmacia. */}
                        <td className="py-2.5 text-sm text-slate-600 pr-6 font-mono text-xs">
                          {textoOpcional(m.dosis)}
                        </td>
                        <td className="py-2.5 text-sm text-slate-600 pr-6">
                          {textoOpcional(m.frecuencia)}
                        </td>
                        <td className="py-2.5 text-sm text-slate-600">
                          {textoOpcional(m.duracion)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {paginaActual + 1 < totalPaginas && (
            <div className="text-center pt-2">
              <button
                onClick={handleCargarMas}
                disabled={cargandoMas}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-purple-600 border-2 border-purple-100 hover:bg-purple-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {cargandoMas ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={emitiendo}
        onClose={() => setEmitiendo(false)}
        title="Nueva Prescripción"
        subtitle="Emisión de receta con dosificación e indicaciones"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
        maxWidth="xl"
      >
        <PrescriptionForm
          pacientes={pacientes}
          pacienteIdPorDefecto={pacienteId ? Number(pacienteId) : undefined}
          onCreada={handleEmitida}
          onCancel={() => setEmitiendo(false)}
        />
      </Modal>
    </div>
  )
}

/**
 * Mensaje que verá el usuario ante un fallo. Se conserva siempre el motivo del
 * error: `lib/api.ts` ya extrae el del backend y el servicio solo lo sustituye
 * cuando puede ser más preciso.
 */
function mensajeDe(causa: unknown, respaldo: string): string {
  return causa instanceof Error && causa.message ? causa.message : respaldo
}

/**
 * Igual que `mensajeDe`, pero anteponiendo QUÉ se estaba haciendo: en esta
 * pantalla se piden dos cosas distintas (el catálogo de pacientes y el
 * histórico de recetas) y «Error del servidor (500).» a secas no dice cuál
 * falló. Se AÑADE contexto, nunca se reemplaza el motivo.
 */
function describir(contexto: string, causa: unknown): string {
  const motivo = causa instanceof Error && causa.message ? causa.message : null
  return motivo ? `${contexto}: ${motivo}` : `${contexto}.`
}
