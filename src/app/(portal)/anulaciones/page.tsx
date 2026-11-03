'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  NOMBRE_DE_TIPO,
  MAXIMO_MOTIVO,
  MINIMO_MOTIVO,
  actualizarParametros,
  aprobarSolicitud,
  avanceDeAprobaciones,
  listarSolicitudes,
  obtenerParametros,
  rechazarSolicitud,
  type EstadoSolicitudDeAnulacion,
  type ParametroDeAnulacionDto,
  type SolicitudDeAnulacionDto,
} from '@/services/anulaciones'
import { formatearFechaHora } from '@/services/consultas'

const COLOR_DE_ESTADO: Record<EstadoSolicitudDeAnulacion, string> = {
  PENDIENTE: 'yellow',
  APROBADA: 'green',
  RECHAZADA: 'red',
  CANCELADA: 'gray',
}

/**
 * Anulaciones de consultas y recetas (HU-21, HU-22 c3). Solo la ve el
 * Administrador (ver `RUTAS_DEL_PORTAL`).
 *
 * Dos cosas en una pantalla porque se leen juntas: las solicitudes que
 * esperan aprobación y las reglas que deciden cuándo hace falta pedirla. Quien
 * se pregunta «¿por qué esta anulación necesita mi visto bueno?» encuentra la
 * respuesta debajo.
 *
 * El servidor decide quién puede resolver cada solicitud (`puedeResolver`): un
 * administrador distinto de quien la pidió y que no la aprobó ya. Aquí solo se
 * ofrecen los botones cuando el servidor dice que sí.
 */
export default function AnulacionesPage() {
  const [vista, setVista] = useState<'pendientes' | 'historial'>('pendientes')
  const [solicitudes, setSolicitudes] = useState<SolicitudDeAnulacionDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolviendo, setResolviendo] = useState<number | null>(null)
  const [porRechazar, setPorRechazar] = useState<SolicitudDeAnulacionDto | null>(null)

  const cargar = useCallback(async () => {
    try {
      setSolicitudes(
        await listarSolicitudes(vista === 'pendientes' ? { estado: 'PENDIENTE' } : {}),
      )
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.')
    } finally {
      setCargando(false)
    }
  }, [vista])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver medicamentos/page.tsx
    void cargar()
  }, [cargar])

  const cambiarVista = (nueva: 'pendientes' | 'historial') => {
    if (nueva === vista) return
    setCargando(true)
    setVista(nueva)
  }

  /** Reemplaza la solicitud por la que devolvió el servidor; si ya no está pendiente, sale de la lista de pendientes. */
  const reflejar = (actualizada: SolicitudDeAnulacionDto) => {
    setSolicitudes((prev) =>
      vista === 'pendientes' && actualizada.estado !== 'PENDIENTE'
        ? prev.filter((s) => s.solicitudId !== actualizada.solicitudId)
        : prev.map((s) => (s.solicitudId === actualizada.solicitudId ? actualizada : s)),
    )
  }

  const aprobar = async (solicitud: SolicitudDeAnulacionDto) => {
    setResolviendo(solicitud.solicitudId)
    setError(null)
    try {
      reflejar(await aprobarSolicitud(solicitud.solicitudId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aprobar la solicitud.')
    } finally {
      setResolviendo(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Anulaciones</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Consultas y recetas que se pidió anular después del tiempo de anulación directa.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div role="tablist" aria-label="Solicitudes" className="flex gap-2 mb-4">
        {(['pendientes', 'historial'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={vista === v}
            onClick={() => cambiarVista(v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              vista === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {v === 'pendientes' ? 'Pendientes' : 'Historial'}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando solicitudes…
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-12 text-center text-sm text-slate-400 italic">
          {vista === 'pendientes'
            ? 'No hay anulaciones esperando aprobación.'
            : 'Todavía no se ha pedido ninguna anulación fuera de la ventana.'}
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Solicitudes de anulación">
          {solicitudes.map((s) => (
            <li key={s.solicitudId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm font-outfit">
                    {NOMBRE_DE_TIPO[s.tipo]}{' '}
                    {s.tipo === 'RECETA' ? `#${s.prescripcionId} (consulta #${s.consultaId})` : `#${s.consultaId}`}
                    {' · '}
                    {s.paciente.nombres} {s.paciente.apellidos} ({s.paciente.expediente}){' '}
                    <Badge color={COLOR_DE_ESTADO[s.estado]}>{s.estado}</Badge>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Pedida por {s.solicitadaPor} el {formatearFechaHora(s.solicitadaEn)} ·{' '}
                    {avanceDeAprobaciones(s)}
                  </p>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">Motivo: {s.motivo}</p>
                  {s.aprobaciones.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Aprobaron:{' '}
                      {s.aprobaciones
                        .map((a) => `${a.administrador} (${formatearFechaHora(a.aprobadaEn)})`)
                        .join(', ')}
                    </p>
                  )}
                  {s.estado === 'RECHAZADA' && (
                    <p className="text-xs text-red-700 mt-1">
                      Rechazada por {s.resueltaPor}: {s.motivoRechazo}
                    </p>
                  )}
                  {s.estado === 'CANCELADA' && (
                    <p className="text-xs text-slate-500 mt-1">
                      Sin efecto: el documento se anuló por otro camino (por ejemplo, junto con su consulta).
                    </p>
                  )}
                </div>
                {s.puedeResolver && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPorRechazar(s)}
                      disabled={resolviendo === s.solicitudId}
                      aria-label={`Rechazar la anulación ${s.solicitudId}`}
                      className="px-3 py-2 rounded-xl text-xs font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => void aprobar(s)}
                      disabled={resolviendo === s.solicitudId}
                      aria-label={`Aprobar la anulación ${s.solicitudId}`}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {resolviendo === s.solicitudId ? 'Aprobando…' : 'Aprobar'}
                    </button>
                  </div>
                )}
                {!s.puedeResolver && s.estado === 'PENDIENTE' && (
                  <p className="text-xs text-slate-400 italic shrink-0">
                    La pidió usted o ya la aprobó: falta otro administrador.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReglasDeAnulacion />

      <DialogoDeRechazo
        solicitud={porRechazar}
        onCerrar={() => setPorRechazar(null)}
        onRechazada={(rechazada) => {
          setPorRechazar(null)
          reflejar(rechazada)
        }}
      />
    </div>
  )
}

const DialogoDeRechazo: React.FC<{
  solicitud: SolicitudDeAnulacionDto | null
  onCerrar: () => void
  onRechazada: (solicitud: SolicitudDeAnulacionDto) => void
}> = ({ solicitud, onCerrar, onRechazada }) => {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cerrar = () => {
    setMotivo('')
    setError(null)
    onCerrar()
  }

  const enviar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!solicitud) return
    if (motivo.trim().length < MINIMO_MOTIVO) {
      setError(`Escriba por qué se rechaza (al menos ${MINIMO_MOTIVO} caracteres).`)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const rechazada = await rechazarSolicitud(solicitud.solicitudId, motivo)
      setMotivo('')
      onRechazada(rechazada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar la solicitud.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      isOpen={solicitud !== null}
      onClose={cerrar}
      title="Rechazar la anulación"
      subtitle="El documento sigue vigente; quien la pidió verá el motivo"
      icon="shield"
      headerGradient="bg-gradient-to-r from-slate-700 to-slate-800"
      maxWidth="md"
    >
      <form onSubmit={enviar} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            {error}
          </p>
        )}
        <div>
          <label
            htmlFor="motivo-rechazo"
            className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide"
          >
            Motivo del rechazo<span aria-hidden="true"> *</span>
          </label>
          <textarea
            id="motivo-rechazo"
            required
            maxLength={MAXIMO_MOTIVO}
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-slate-400 resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={cerrar}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
          >
            {enviando ? 'Rechazando…' : 'Rechazar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Las reglas de anulación, una tarjeta por tipo de documento. Cambiarlas no
 * mueve las solicitudes en curso: cada una conserva las aprobaciones que
 * pedía cuando se hizo.
 */
const ReglasDeAnulacion: React.FC = () => {
  const [parametros, setParametros] = useState<ParametroDeAnulacionDto[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    obtenerParametros()
      .then((p) => vigente && setParametros(p))
      .catch((err) => vigente && setError(err instanceof Error ? err.message : 'No se pudieron cargar las reglas.'))
    return () => {
      vigente = false
    }
  }, [])

  return (
    <section aria-label="Reglas de anulación" className="mt-8">
      <h2 className="text-lg font-bold text-slate-800 font-outfit">Reglas de anulación</h2>
      <p className="text-sm text-slate-500 mt-0.5 mb-4">
        Dentro de los minutos de anulación directa, el médico que firmó o un administrador anula al
        momento. Después hace falta la aprobación de otros administradores. Pasado el tope de días,
        ya no se anula.
      </p>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {parametros.map((p) => (
          <TarjetaDeRegla
            key={p.tipo}
            parametro={p}
            onGuardado={(nuevo) => setParametros((prev) => prev.map((x) => (x.tipo === nuevo.tipo ? nuevo : x)))}
          />
        ))}
      </div>
    </section>
  )
}

const TarjetaDeRegla: React.FC<{
  parametro: ParametroDeAnulacionDto
  onGuardado: (parametro: ParametroDeAnulacionDto) => void
}> = ({ parametro, onGuardado }) => {
  const uid = useId()
  const [minutos, setMinutos] = useState(String(parametro.minutosAnulacionDirecta))
  const [aprobaciones, setAprobaciones] = useState(String(parametro.aprobacionesRequeridas))
  const [dias, setDias] = useState(parametro.diasMaximos === null ? '' : String(parametro.diasMaximos))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const guardar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGuardando(true)
    setMensaje(null)
    try {
      const guardado = await actualizarParametros(parametro.tipo, {
        minutosAnulacionDirecta: Number(minutos),
        aprobacionesRequeridas: Number(aprobaciones),
        diasMaximos: dias.trim() === '' ? null : Number(dias),
      })
      onGuardado(guardado)
      setMensaje({ tipo: 'ok', texto: 'Reglas guardadas.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudieron guardar las reglas.' })
    } finally {
      setGuardando(false)
    }
  }

  const campo =
    'w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-slate-400'
  const etiqueta = 'block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide'

  return (
    <form
      onSubmit={guardar}
      aria-label={`Reglas de ${NOMBRE_DE_TIPO[parametro.tipo].toLowerCase()}`}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3"
    >
      <h3 className="text-sm font-bold text-slate-800 font-outfit">
        {parametro.tipo === 'CONSULTA' ? 'Consultas' : 'Recetas'}
      </h3>
      <div>
        <label htmlFor={`${uid}-minutos`} className={etiqueta}>
          Minutos de anulación directa
        </label>
        <input
          id={`${uid}-minutos`}
          type="number"
          min={0}
          max={1440}
          required
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          className={campo}
        />
        <p className="text-xs text-slate-400 mt-1">0 = toda anulación necesita aprobación.</p>
      </div>
      <div>
        <label htmlFor={`${uid}-aprobaciones`} className={etiqueta}>
          Aprobaciones requeridas
        </label>
        <input
          id={`${uid}-aprobaciones`}
          type="number"
          min={1}
          max={5}
          required
          value={aprobaciones}
          onChange={(e) => setAprobaciones(e.target.value)}
          className={campo}
        />
        <p className="text-xs text-slate-400 mt-1">
          De administradores distintos de quien la pide. Asegúrese de que haya tantos administradores
          activos.
        </p>
      </div>
      <div>
        <label htmlFor={`${uid}-dias`} className={etiqueta}>
          Tope de días
        </label>
        <input
          id={`${uid}-dias`}
          type="number"
          min={1}
          max={3650}
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          placeholder="Sin tope"
          className={campo}
        />
        <p className="text-xs text-slate-400 mt-1">Vacío = sin tope.</p>
      </div>
      {parametro.actualizadoPor && parametro.actualizadoEn && (
        <p className="text-xs text-slate-400">
          Último cambio: {parametro.actualizadoPor}, {formatearFechaHora(parametro.actualizadoEn)}
        </p>
      )}
      {mensaje && (
        <p
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
          className={`text-xs ${mensaje.tipo === 'error' ? 'text-red-600' : 'text-green-700'}`}
        >
          {mensaje.texto}
        </p>
      )}
      <button
        type="submit"
        disabled={guardando}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
