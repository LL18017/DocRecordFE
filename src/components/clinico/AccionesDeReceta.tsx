'use client'

import React, { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  anularPrescripcion,
  imprimirPrescripcion,
  type PrescripcionDto,
} from '@/services/prescripciones'
import type { SolicitudDeAnulacionDto } from '@/services/anulaciones'
import { formatearFechaHora } from '@/services/consultas'
import { DialogoDeAnulacion } from './DialogoDeAnulacion'

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
 * expediente, marcada como anulada. Pasada la ventana de anulación directa
 * queda una solicitud que aprueban los administradores; el diálogo lo avisa y
 * la receta sigue vigente (ver DialogoDeAnulacion).
 */
export const BotonAnularReceta: React.FC<{
  prescripcionId: number
  onAnulada: (receta: PrescripcionDto) => void
  onSolicitada?: (solicitud: SolicitudDeAnulacionDto) => void
}> = ({ prescripcionId, onAnulada, onSolicitada }) => {
  const [abierto, setAbierto] = useState(false)

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
      <DialogoDeAnulacion<PrescripcionDto>
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        idCampo={`motivo-anulacion-${prescripcionId}`}
        titulo={`Anular la receta #${prescripcionId}`}
        subtitulo="La receta no se borra: queda marcada como anulada"
        ayuda="Una receta emitida no se edita: para corregirla se anula y se emite una nueva. Quedan guardados el motivo, quién la anuló y cuándo."
        textoDelBoton="Anular receta"
        anular={(motivo) => anularPrescripcion(prescripcionId, motivo)}
        onAnulado={onAnulada}
        onSolicitada={onSolicitada}
      />
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
