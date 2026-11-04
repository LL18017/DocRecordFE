'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  avanceDeAprobaciones,
  avisoDeSolicitudEnviada,
  esSolicitudDeAnulacion,
  MAXIMO_MOTIVO,
  MINIMO_MOTIVO,
  type SolicitudDeAnulacionDto,
} from '@/services/anulaciones'
import { formatearFechaHora } from '@/services/consultas'

interface DialogoDeAnulacionProps<T> {
  abierto: boolean
  onCerrar: () => void
  /** Id del textarea, único en la página. */
  idCampo: string
  titulo: string
  subtitulo: string
  /** Qué pasa con el documento; va debajo del campo del motivo. */
  ayuda: string
  textoDelBoton: string
  anular: (motivo: string) => Promise<T | SolicitudDeAnulacionDto>
  /** El documento quedó anulado al momento (dentro de la ventana). */
  onAnulado: (documento: T) => void
  /** Quedó una solicitud esperando aprobación; se llama al cerrar el aviso. */
  onSolicitada?: (solicitud: SolicitudDeAnulacionDto) => void
}

/**
 * El diálogo para anular una consulta (HU-21) o una receta (HU-22 c3).
 *
 * Pide el motivo con los mismos límites que el servidor (10 a 500). Si el
 * documento ya pasó la ventana de anulación directa, el servidor no lo anula
 * sino que deja una solicitud; el diálogo lo dice en vez de cerrarse como si
 * se hubiera anulado, porque el documento sigue vigente y quien lo pidió
 * tiene que saberlo.
 */
export function DialogoDeAnulacion<T>({
  abierto,
  onCerrar,
  idCampo,
  titulo,
  subtitulo,
  ayuda,
  textoDelBoton,
  anular,
  onAnulado,
  onSolicitada,
}: DialogoDeAnulacionProps<T>) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [solicitud, setSolicitud] = useState<SolicitudDeAnulacionDto | null>(null)

  const cerrar = () => {
    if (solicitud) onSolicitada?.(solicitud)
    setMotivo('')
    setError(null)
    setSolicitud(null)
    onCerrar()
  }

  const enviar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (motivo.trim().length < MINIMO_MOTIVO) {
      setError(`Escriba el motivo de la anulación (al menos ${MINIMO_MOTIVO} caracteres).`)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const resultado = await anular(motivo)
      if (esSolicitudDeAnulacion(resultado)) {
        setSolicitud(resultado)
      } else {
        setMotivo('')
        onCerrar()
        onAnulado(resultado)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      isOpen={abierto}
      onClose={cerrar}
      title={titulo}
      subtitle={subtitulo}
      icon="prescripciones"
      headerGradient="bg-gradient-to-r from-red-600 to-red-700"
      maxWidth="md"
    >
      {solicitud ? (
        <div className="space-y-4">
          <p
            role="status"
            className="rounded-xl border-2 border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"
          >
            {avisoDeSolicitudEnviada(solicitud)}
          </p>
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={cerrar}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {error && (
            <p
              role="alert"
              className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
            >
              {error}
            </p>
          )}
          <div>
            <label
              htmlFor={idCampo}
              className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide"
            >
              Motivo de la anulación<span aria-hidden="true"> *</span>
            </label>
            <textarea
              id={idCampo}
              required
              maxLength={MAXIMO_MOTIVO}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-red-400 focus-visible:ring-2 focus-visible:ring-red-400/40 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">{ayuda}</p>
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
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {enviando ? 'Anulando…' : textoDelBoton}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/**
 * Aviso de una anulación pedida y todavía sin aprobar. El documento sigue
 * vigente; esto solo cuenta que alguien pidió anularlo y cuánto le falta.
 */
export const AvisoDeAnulacionPendiente: React.FC<{ solicitud: SolicitudDeAnulacionDto }> = ({
  solicitud,
}) => (
  <p
    role="note"
    className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
  >
    <span className="font-semibold">Anulación pendiente de aprobación</span> ({avanceDeAprobaciones(solicitud)}).
    Pedida por {solicitud.solicitadaPor} el {formatearFechaHora(solicitud.solicitadaEn)}. Motivo:{' '}
    {solicitud.motivo}
  </p>
)
