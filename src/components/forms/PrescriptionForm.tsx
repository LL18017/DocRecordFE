'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  formatearFechaHora,
  listarConsultas,
  textoOpcional,
  type ConsultaDto,
} from '@/services/consultas'
import {
  buscarAlertasDeAlergia,
  crearPrescripcion,
  datoQueFalta,
  normalizarMedicamentos,
  MAXIMO_JUSTIFICACION_ALERGIA,
  MENSAJE_ALERTAS_NO_COMPROBADAS,
  MENSAJE_FALTA_CONFIRMACION,
  MENSAJE_FALTA_JUSTIFICACION,
  MENSAJE_RECETA_VACIA,
  mensajeFueraDelCatalogo,
  registrarDesistimientoDeAlerta,
  type AlertaDeAlergiaDto,
  type MedicamentoPayload,
  type PrescripcionDto,
} from '@/services/prescripciones'
import { etiquetaDeSeveridad } from '@/services/alergias'
import { listarMedicamentos, type MedicamentoCatalogoDto } from '@/services/medicamentos'
import type { OpcionPaciente } from './ConsultationForm'
import { SelectorDeMedicamento } from './SelectorDeMedicamento'

interface PrescriptionFormProps {
  /** Pacientes elegibles. Se ignora si la receta ya nace atada a una consulta. */
  pacientes: OpcionPaciente[]
  /** Consulta fija: emitir la receta desde una consulta concreta. */
  consulta?: ConsultaDto
  /** Preselección del paciente cuando no hay consulta fija. */
  pacienteIdPorDefecto?: number
  /** Se llama cuando el servidor confirmó la emisión. */
  onCreada: (prescripcion: PrescripcionDto) => void
  onCancel: () => void
}

/**
 * Línea del formulario.
 *
 * `texto` es lo que hay escrito en la casilla del medicamento y `medicamento`
 * la opción del catálogo que se eligió; son cosas distintas a propósito (ver
 * SelectorDeMedicamento). Una línea con texto y sin medicamento es un valor
 * fuera del catálogo, y no se envía.
 */
interface LineaMedicamento {
  texto: string
  medicamento: MedicamentoCatalogoDto | null
  dosis: string
  viaAdministracion: string
  frecuencia: string
  duracion: string
}

const LINEA_VACIA: LineaMedicamento = {
  texto: '',
  medicamento: null,
  dosis: '',
  viaAdministracion: '',
  frecuencia: '',
  duracion: '',
}

/** Vías de administración más comunes; se puede escribir otra (el campo es libre). */
const VIAS_DE_ADMINISTRACION = [
  'Oral',
  'Intramuscular',
  'Intravenosa',
  'Subcutánea',
  'Tópica',
  'Oftálmica',
  'Inhalada',
  'Rectal',
  'Sublingual',
]

const campoBase =
  'border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40'
const inputClass = `w-full ${campoBase}`
const inputLineaClass =
  'w-full border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-purple-400 focus-visible:ring-2 focus-visible:ring-purple-400/40'
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

/**
 * Cómo se lee una consulta en la lista desplegable.
 *
 * `motivo` PUEDE SER NULL, y una plantilla de cadena no perdona: interpolarlo
 * a secas ponía literalmente «23 ago 2026, 02:30 p.m. · null» entre las
 * opciones de un formulario de recetas. `textoOpcional` deja el mismo guion
 * que el resto de la aplicación usa para lo que falta; la fecha y la hora
 * bastan para distinguir una consulta de otra.
 */
function etiquetaDeConsulta(c: ConsultaDto): string {
  return `${formatearFechaHora(c.fecha)} · ${textoOpcional(c.motivo)}`
}

export const PrescriptionForm: React.FC<PrescriptionFormProps> = ({
  pacientes,
  consulta,
  pacienteIdPorDefecto,
  onCreada,
  onCancel,
}) => {
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  // SIN paciente preseleccionado cuando no se sabe cuál es. Antes caía en
  // `pacientes[0]` —quien el catálogo pusiera primero—, y aquí eso es lo más
  // grave de los tres formularios: una receta lleva firma de médico y es el
  // documento con el que alguien se toma un medicamento. Emitida al paciente
  // equivocado por un desplegable que ya venía relleno, no se distingue
  // después de una real.
  //
  // `pacienteIdPorDefecto` sí se respeta: ahí el paciente viene de haber
  // abierto el formulario desde su propio expediente, no del orden de la lista.
  const [pacienteId, setPacienteId] = useState<string>(() => {
    if (pacienteIdPorDefecto !== undefined) return String(pacienteIdPorDefecto)
    return ''
  })

  // Una receta cuelga siempre de una consulta, así que hay que elegir cuál.
  // Con `consulta` fija no se pide nada: ni la lista ni el desplegable.
  const [consultas, setConsultas] = useState<ConsultaDto[]>([])
  const [consultaId, setConsultaId] = useState<string>(
    consulta ? String(consulta.consultaId) : '',
  )
  const [cargandoConsultas, setCargandoConsultas] = useState(consulta === undefined)
  const [errorConsultas, setErrorConsultas] = useState<string | null>(null)

  const [lineas, setLineas] = useState<LineaMedicamento[]>([{ ...LINEA_VACIA }])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Índice de la línea que provocó el error de arriba, para señalarla. */
  const [lineaDelError, setLineaDelError] = useState<number | null>(null)

  // El catálogo ACTIVO, una sola vez al abrir el formulario: con unos cientos
  // de productos cabe de sobra en memoria, y filtrar en el cliente hace que el
  // autocompletado responda en cada tecla sin un viaje al servidor. Lo que no
  // está aquí —un medicamento desactivado— no se puede elegir (criterio 4).
  const [catalogo, setCatalogo] = useState<MedicamentoCatalogoDto[]>([])
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

  // ── HU-24 · Alerta de alergia ────────────────────────────────────────────
  // Las alertas se piden al ELEGIR un medicamento (en el manejador, no en un
  // efecto: es una consecuencia de un gesto del médico) y se guardan por
  // paciente+medicamento. Lo que se muestra se DERIVA de las líneas actuales,
  // así que quitar el medicamento o teclear de nuevo hace desaparecer su aviso
  // sin ningún código de limpieza. Una respuesta vieja de otro paciente
  // tampoco se cuela: la llave incluye al paciente.
  const [alertasPorLlave, setAlertasPorLlave] = useState<Record<string, AlertaDeAlergiaDto[]>>({})
  const [alertasNoComprobadas, setAlertasNoComprobadas] = useState(false)
  const [justificacion, setJustificacion] = useState('')
  const [confirmaSevera, setConfirmaSevera] = useState(false)

  const llaveDeAlerta = (idPaciente: number, medicamentoId: number) =>
    `${idPaciente}:${medicamentoId}`

  /** El paciente de la receta: el de la consulta fija o el elegido en el desplegable. */
  const pacienteDeLaReceta = (valor: string): number | null => {
    if (consulta) return consulta.paciente.personaId
    return valor ? Number(valor) : null
  }

  // Criterio 5: cuando el médico ve la alerta y NO receta, queda en la
  // bitácora. Se guarda qué desistimientos ya se registraron para no repetir
  // el mismo (quitar la línea y luego cancelar es una sola decisión); volver a
  // elegir el medicamento reabre la decisión y lo borra de aquí.
  const desistimientosRegistrados = useRef(new Set<string>())

  /**
   * Registra el desistimiento de cada medicamento con alerta que deja de
   * estar en la receta. `quedan` son los ids que siguen en otras líneas: si el
   * mismo medicamento sigue recetándose, no se desistió de él.
   */
  const registrarDesistimientos = (medicamentoIds: number[], quedan: number[] = []) => {
    const idPaciente = pacienteDeLaReceta(pacienteId)
    if (idPaciente === null) return
    for (const medicamentoId of new Set(medicamentoIds)) {
      const llave = llaveDeAlerta(idPaciente, medicamentoId)
      if (quedan.includes(medicamentoId)) continue
      if ((alertasPorLlave[llave] ?? []).length === 0) continue
      if (desistimientosRegistrados.current.has(llave)) continue
      desistimientosRegistrados.current.add(llave)
      void registrarDesistimientoDeAlerta(idPaciente, medicamentoId)
    }
  }

  /** Ids de los medicamentos elegidos en las líneas, salvo la `salvo`. */
  const idsEnLineas = (salvo?: number) =>
    lineas.flatMap((l, i) => (i !== salvo && l.medicamento ? [l.medicamento.medicamentoId] : []))

  const pedirAlertas = async (idPaciente: number, medicamentoId: number) => {
    try {
      const alertas = await buscarAlertasDeAlergia(idPaciente, medicamentoId)
      setAlertasPorLlave((prev) => ({ ...prev, [llaveDeAlerta(idPaciente, medicamentoId)]: alertas }))
    } catch {
      setAlertasNoComprobadas(true)
    }
  }

  const cargarCatalogo = useCallback(async () => {
    try {
      // El backend ya devuelve solo los activos; el filtro se repite porque
      // ofrecer un desactivado aquí sería ofrecer algo que el backend va a
      // rechazar al emitir, y es barato no fiarse.
      setCatalogo((await listarMedicamentos()).filter((m) => m.activo))
      setErrorCatalogo(null)
    } catch (err) {
      setErrorCatalogo(
        err instanceof Error ? err.message : 'No se pudo cargar el catálogo de medicamentos.',
      )
    } finally {
      setCargandoCatalogo(false)
    }
  }, [])

  // Mismo patrón «cargar datos remotos al montar» que el de las consultas de
  // más abajo; ver el comentario de ese efecto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarCatalogo()
  }, [cargarCatalogo])

  /**
   * Trae las consultas del paciente elegido y preselecciona la más reciente
   * (el backend las devuelve en ese orden), que es casi siempre la que se está
   * recetando. No se preselecciona nada si la lista viene vacía: sin consulta
   * no hay receta posible, y el formulario lo dice en vez de dejar un
   * desplegable que parece elegible.
   */
  const cargarConsultas = useCallback(async (idPaciente: string) => {
    if (!idPaciente) {
      setConsultas([])
      setConsultaId('')
      setCargandoConsultas(false)
      return
    }
    try {
      const lista = await listarConsultas(Number(idPaciente))
      setConsultas(lista)
      setConsultaId(lista[0] ? String(lista[0].consultaId) : '')
      setErrorConsultas(null)
    } catch (err) {
      setConsultas([])
      setConsultaId('')
      setErrorConsultas(
        err instanceof Error ? err.message : 'No se pudieron cargar las consultas del paciente.',
      )
    } finally {
      setCargandoConsultas(false)
    }
  }, [])

  // Mismo caso que en la pantalla de pacientes: la regla
  // react-hooks/set-state-in-effect rastrea los setState que ocurren tras el
  // await, pero aquí no hay render en cascada —el estado se escribe cuando la
  // respuesta llega, no durante el render—. Es el patrón «cargar datos
  // remotos al montar» que la regla no puede modelar; se desactiva acotado.
  useEffect(() => {
    if (consulta) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarConsultas(pacienteId)
  }, [cargarConsultas, consulta, pacienteId])

  const handlePacienteChange = (valor: string) => {
    setPacienteId(valor)
    setCargandoConsultas(true)
    setConsultaId('')
    // Las alergias son de ESE paciente: cambiarlo invalida lo que se mostraba
    // y obliga a comprobar de nuevo los medicamentos ya elegidos.
    setAlertasNoComprobadas(false)
    const idNuevo = pacienteDeLaReceta(valor)
    if (idNuevo !== null) {
      for (const l of lineas) {
        if (l.medicamento) void pedirAlertas(idNuevo, l.medicamento.medicamentoId)
      }
    }
  }

  const elegirMedicamento = (indice: number, m: MedicamentoCatalogoDto) => {
    actualizarLinea(indice, { texto: m.descripcion, medicamento: m })
    const idPaciente = pacienteDeLaReceta(pacienteId)
    if (idPaciente !== null) {
      desistimientosRegistrados.current.delete(llaveDeAlerta(idPaciente, m.medicamentoId))
      setAlertasNoComprobadas(false)
      void pedirAlertas(idPaciente, m.medicamentoId)
    }
  }

  const actualizarLinea = (indice: number, cambios: Partial<LineaMedicamento>) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, ...cambios } : l)))
    // Tocar la línea señalada es corregirla: deja de marcarse como inválida.
    if (indice === lineaDelError) setLineaDelError(null)
  }

  // Alertas vigentes: las de los medicamentos que HAY en la receta ahora,
  // sin repetir un medicamento que esté en dos líneas.
  const idDelPaciente = pacienteDeLaReceta(pacienteId)
  const idsElegidos = [
    ...new Set(lineas.flatMap((l) => (l.medicamento ? [l.medicamento.medicamentoId] : []))),
  ]
  const alertas: AlertaDeAlergiaDto[] =
    idDelPaciente === null
      ? []
      : idsElegidos.flatMap((m) => alertasPorLlave[llaveDeAlerta(idDelPaciente, m)] ?? [])
  const alertasSeveras = alertas.filter((a) => a.severidad === 'SEVERA')

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()

    // HU-23 criterio 3: no se acepta un valor fuera del catálogo. Una línea
    // con algo escrito que no se eligió de la lista NO se descarta en
    // silencio como si estuviera vacía: el médico escribió un medicamento y
    // la receta saldría sin él sin que nadie se lo dijera.
    const fuera = lineas.findIndex((l) => l.medicamento === null && l.texto.trim() !== '')
    if (fuera !== -1) {
      setError(mensajeFueraDelCatalogo(lineas[fuera].texto))
      setLineaDelError(fuera)
      return
    }

    // Regla de negocio: una receta sin medicamentos no es una receta. Se
    // comprueba con `normalizarMedicamentos`, el mismo criterio que aplica el
    // servicio, para que «tres líneas en blanco» cuente como cero y no como
    // tres. El aviso se muestra en vez de deshabilitar el botón: un botón
    // apagado sin explicación deja al médico adivinando qué le falta.
    const medicamentos: MedicamentoPayload[] = normalizarMedicamentos(
      lineas.map((l) => ({
        medicamentoId: l.medicamento?.medicamentoId ?? null,
        dosis: l.dosis,
        viaAdministracion: l.viaAdministracion,
        frecuencia: l.frecuencia,
        duracion: l.duracion,
      })),
    )
    setLineaDelError(null)
    if (medicamentos.length === 0) {
      setError(MENSAJE_RECETA_VACIA)
      return
    }
    // HU-22 c2: dosis, vía, frecuencia y duración son obligatorias en CADA
    // medicamento. Se señala la línea y se dice qué dato falta; el servidor
    // vuelve a exigirlo.
    const incompleta = medicamentos.findIndex((m) => datoQueFalta(m) !== null)
    if (incompleta !== -1) {
      setError(`Cada medicamento debe indicar ${datoQueFalta(medicamentos[incompleta])}.`)
      return
    }
    if (!consultaId) {
      setError('Elige la consulta a la que pertenece esta receta.')
      return
    }

    // HU-24 criterios 2 y 3: con una alerta de alergia no se emite sin una
    // justificación escrita y, si la alergia es severa, sin la casilla
    // marcada. El backend lo vuelve a exigir; esto evita el viaje de ida y
    // vuelta y dice qué falta.
    if (alertas.length > 0) {
      if (justificacion.trim() === '') {
        setError(MENSAJE_FALTA_JUSTIFICACION)
        return
      }
      if (alertasSeveras.length > 0 && !confirmaSevera) {
        setError(MENSAJE_FALTA_CONFIRMACION)
        return
      }
    }

    setError(null)
    setEnviando(true)
    try {
      const emitida = await crearPrescripcion({
        consultaId: Number(consultaId),
        medicamentos,
        // Sin alerta no viaja nada de esto, aunque se hubiera escrito antes de
        // quitar el medicamento: una justificación huérfana no es de nadie.
        ...(alertas.length > 0
          ? {
              justificacionAlergia: justificacion,
              confirmaAlergiaSevera: alertasSeveras.length > 0 && confirmaSevera,
            }
          : {}),
      })
      onCreada(emitida)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ocurrió un error inesperado al emitir la receta.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {error && (
        <p
          id={id('error')}
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
        >
          {error}
        </p>
      )}

      {consulta ? (
        <div>
          <span className={labelClass}>Consulta</span>
          <p className="rounded-xl border-2 border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
            {etiquetaDeConsulta(consulta)}
          </p>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={id('paciente')} className={labelClass}>
              Paciente
              <Obligatorio />
            </label>
            <select
              id={id('paciente')}
              required
              value={pacienteId}
              onChange={(e) => handlePacienteChange(e.target.value)}
              className={inputClass}
            >
              {/* La opción vacía obliga a elegir a conciencia; con `required`
                  el navegador no deja enviar mientras siga puesta. */}
              <option value="">
                {pacientes.length === 0
                  ? 'No hay pacientes registrados'
                  : 'Selecciona un paciente…'}
              </option>
              {pacientes.map((p) => (
                <option key={p.personaId} value={String(p.personaId)}>
                  {p.expediente ? `${p.nombre} (${p.expediente})` : p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={id('consulta')} className={labelClass}>
              Consulta
              <Obligatorio />
            </label>
            <select
              id={id('consulta')}
              required
              value={consultaId}
              onChange={(e) => setConsultaId(e.target.value)}
              disabled={cargandoConsultas || consultas.length === 0}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            >
              {cargandoConsultas && <option value="">Cargando consultas…</option>}
              {!cargandoConsultas && consultas.length === 0 && (
                <option value="">Este paciente no tiene consultas registradas</option>
              )}
              {consultas.map((c) => (
                <option key={c.consultaId} value={String(c.consultaId)}>
                  {etiquetaDeConsulta(c)}
                </option>
              ))}
            </select>
            {errorConsultas ? (
              <p role="alert" className="text-xs text-red-600 mt-1">
                {errorConsultas}
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Toda receta pertenece a una consulta; si no aparece ninguna, regístrala primero.
              </p>
            )}
          </div>
        </>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={`${labelClass} mb-0`}>Medicamentos</span>
          <button
            type="button"
            onClick={() => setLineas((prev) => [...prev, { ...LINEA_VACIA }])}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer"
          >
            <Icon name="add" size={12} color="#7C3AED" /> Agregar medicamento
          </button>
        </div>

        {errorCatalogo && (
          <p role="alert" className="text-xs text-red-600 mb-2">
            {errorCatalogo}
          </p>
        )}

        <div className="space-y-2">
          {lineas.map((linea, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70"
            >
              <div className="col-span-2">
                <label htmlFor={id(`medicamento-${i}`)} className="sr-only">
                  Medicamento {i + 1}
                </label>
                <SelectorDeMedicamento
                  id={id(`medicamento-${i}`)}
                  catalogo={catalogo}
                  texto={linea.texto}
                  seleccionado={linea.medicamento}
                  // Teclear de nuevo deshace la elección: lo escrito vuelve a
                  // ser solo una búsqueda hasta que se elija otra opción.
                  onCambiarTexto={(texto) => {
                    // Teclear sobre un medicamento ya elegido lo quita de la
                    // receta: si tenía alerta, el médico desistió de él.
                    if (linea.medicamento) {
                      registrarDesistimientos([linea.medicamento.medicamentoId], idsEnLineas(i))
                    }
                    actualizarLinea(i, { texto, medicamento: null })
                  }}
                  onElegir={(m) => elegirMedicamento(i, m)}
                  invalido={lineaDelError === i}
                  descritoPor={lineaDelError === i ? id('error') : undefined}
                  deshabilitado={cargandoCatalogo || errorCatalogo !== null}
                  placeholder={
                    cargandoCatalogo
                      ? 'Cargando catálogo…'
                      : 'Busca en el catálogo (ej: amoxicilina, Panadol)'
                  }
                  className={inputLineaClass}
                />
                {linea.medicamento && (
                  <p className="text-xs text-slate-400 mt-1">
                    Principio activo: {linea.medicamento.principioActivo}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={id(`dosis-${i}`)} className="sr-only">
                  Dosis del medicamento {i + 1}
                </label>
                <input
                  id={id(`dosis-${i}`)}
                  placeholder="Dosis (500 mg)"
                  value={linea.dosis}
                  onChange={(e) => actualizarLinea(i, { dosis: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              <div>
                <label htmlFor={id(`via-${i}`)} className="sr-only">
                  Vía de administración del medicamento {i + 1}
                </label>
                <input
                  id={id(`via-${i}`)}
                  list={id('vias')}
                  placeholder="Vía (oral, intramuscular…)"
                  value={linea.viaAdministracion}
                  onChange={(e) => actualizarLinea(i, { viaAdministracion: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              <div>
                <label htmlFor={id(`frecuencia-${i}`)} className="sr-only">
                  Frecuencia del medicamento {i + 1}
                </label>
                <input
                  id={id(`frecuencia-${i}`)}
                  placeholder="Frecuencia (cada 8 h)"
                  value={linea.frecuencia}
                  onChange={(e) => actualizarLinea(i, { frecuencia: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              <div>
                <label htmlFor={id(`duracion-${i}`)} className="sr-only">
                  Duración del medicamento {i + 1}
                </label>
                <input
                  id={id(`duracion-${i}`)}
                  placeholder="Duración (7 días)"
                  value={linea.duracion}
                  onChange={(e) => actualizarLinea(i, { duracion: e.target.value })}
                  className={inputLineaClass}
                />
              </div>
              {lineas.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (linea.medicamento) {
                      registrarDesistimientos([linea.medicamento.medicamentoId], idsEnLineas(i))
                    }
                    setLineas((prev) => prev.filter((_, j) => j !== i))
                    // Los índices se corren al quitar una línea; la marca de
                    // error podría quedar sobre otra que no tiene nada malo.
                    setLineaDelError(null)
                  }}
                  aria-label={`Quitar el medicamento ${i + 1}`}
                  className="col-span-2 flex items-center justify-center gap-1 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors bg-white cursor-pointer"
                >
                  <Icon name="delete" size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {alertasNoComprobadas && (
          <p role="alert" className="text-xs text-amber-700 mt-2">
            {MENSAJE_ALERTAS_NO_COMPROBADAS}
          </p>
        )}

        <datalist id={id('vias')}>
          {VIAS_DE_ADMINISTRACION.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>

        <p className="text-xs text-slate-400 mt-2">
          El medicamento se elige del catálogo. Dosis, vía de administración, frecuencia y duración
          son obligatorias en cada medicamento.
        </p>
      </div>

      {alertas.length > 0 && (
        <section
          role="alert"
          aria-labelledby={id('alerta-titulo')}
          className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 space-y-3"
        >
          <h3 id={id('alerta-titulo')} className="text-sm font-bold text-red-800">
            Alergia registrada del paciente
          </h3>
          <ul className="space-y-2 text-sm text-red-900">
            {alertas.map((a) => (
              <li key={`${a.alergiaId}-${a.medicamentoId}`}>
                <span className="font-semibold">{a.sustancia}</span>
                {' · '}Severidad: <span className="font-semibold">{etiquetaDeSeveridad(a.severidad)}</span>
                {' · '}Reacción: {a.reaccion}
                <span className="block text-xs text-red-700">En: {a.medicamento}</span>
              </li>
            ))}
          </ul>

          <div>
            <label htmlFor={id('justificacion')} className={labelClass}>
              Justificación para recetarlo de todos modos
              <Obligatorio />
            </label>
            <textarea
              id={id('justificacion')}
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              maxLength={MAXIMO_JUSTIFICACION_ALERGIA}
              rows={3}
              aria-required="true"
              className={`${inputClass} resize-y`}
            />
            <p className="text-xs text-red-700 mt-1">
              Queda guardada junto a la receta y esta decisión se registra en la bitácora.
            </p>
          </div>

          {alertasSeveras.length > 0 && (
            <label className="flex items-start gap-2 text-sm font-semibold text-red-900 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmaSevera}
                onChange={(e) => setConfirmaSevera(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Confirmo que receto {[...new Set(alertasSeveras.map((a) => a.medicamento))].join(', ')} pese
                a la alergia severa a {[...new Set(alertasSeveras.map((a) => a.sustancia))].join(', ')}
              </span>
            </label>
          )}
        </section>
      )}

      {/* Sin campo de «indicaciones adicionales»: el contrato de
          `POST /prescripciones` no lo tiene, así que lo que se escribiera ahí
          se perdería al enviar. La maqueta lo ofrecía y no guardaba nada. */}

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => {
            // Cancelar la receta con alertas a la vista es desistir de cada
            // medicamento que las provocó.
            registrarDesistimientos(idsElegidos)
            onCancel()
          }}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {enviando ? 'Emitiendo…' : 'Emitir prescripción'}
        </button>
      </div>
    </form>
  )
}
