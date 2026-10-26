'use client'

import React, { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import {
  anularPrescripcion,
  imprimirPrescripcion,
  MINIMO_MOTIVO_DE_ANULACION,
  type PrescripcionDto,
} from '@/services/prescripciones'
import { formatearFechaHora } from '@/services/consultas'

/** HU-22 c4: baja el PDF de la receta para imprimirla. */
export const BotonImprimirReceta: React.FC<{ prescripcionId: number }> = ({ prescripcionId }) => {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imprimir = async () => {
    setGenerando(true)
    setError(null)
    try {
      await imprimirPrescripcion(prescripcionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF de la receta.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={imprimir}
        disabled={generando}
        aria-label={`Imprimir o descargar en PDF la receta ${prescripcionId}`}
        className="h-8 px-3 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-60"
      >
        {generando ? 'Generando…' : 'Imprimir / PDF'}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * HU-22 c3: anula una receta con su motivo. NO la borra: sigue en el
 * expediente, marcada como anulada. Pide el motivo antes de enviar, igual que
 * el servidor lo exige (10 a 500 caracteres).
 */
export const BotonAnularReceta: React.FC<{
  prescripcionId: number
  onAnulada: (receta: PrescripcionDto) => void
}> = ({ prescripcionId, onAnulada }) => {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cerrar = () => {
    setAbierto(false)
    setMotivo('')
    setError(null)
  }

  const enviar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (motivo.trim().length < MINIMO_MOTIVO_DE_ANULACION) {
      setError(`Escriba el motivo de la anulación (al menos ${MINIMO_MOTIVO_DE_ANULACION} caracteres).`)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const anulada = await anularPrescripcion(prescripcionId, motivo)
      cerrar()
      onAnulada(anulada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la receta.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Anular la receta ${prescripcionId}`}
        title="Anular receta"
        className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
      >
        <Icon name="delete" size={14} />
      </button>
      <Modal
        isOpen={abierto}
        onClose={cerrar}
        title={`Anular la receta #${prescripcionId}`}
        subtitle="La receta no se borra: queda marcada como anulada"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-red-600 to-red-700"
        maxWidth="md"
      >
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
              htmlFor={`motivo-anulacion-${prescripcionId}`}
              className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide"
            >
              Motivo de la anulación<span aria-hidden="true"> *</span>
            </label>
            <textarea
              id={`motivo-anulacion-${prescripcionId}`}
              required
              maxLength={500}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-red-400 focus-visible:ring-2 focus-visible:ring-red-400/40 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">
              Una receta emitida no se edita: para corregirla se anula y se emite una nueva. Quedan
              guardados el motivo, quién la anuló y cuándo.
            </p>
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
              {enviando ? 'Anulando…' : 'Anular receta'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/**
 * La marca de una receta anulada, con su rastro (HU-22 c3: «siguen visibles
 * marcadas»). No pinta nada si la receta está vigente.
 */
export const AvisoDeAnulacion: React.FC<{ receta: PrescripcionDto }> = ({ receta }) => {
  if (receta.estado !== 'ANULADA') return null
  return (
    <p
      role="note"
      className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
    >
      <span className="font-semibold">Receta anulada</span>
      {receta.anuladaEn && <> el {formatearFechaHora(receta.anuladaEn)}</>}
      {receta.anuladaPor && <> por {receta.anuladaPor}</>}. Motivo: {receta.motivoAnulacion}
    </p>
  )
}
