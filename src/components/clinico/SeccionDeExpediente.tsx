'use client'

import React from 'react'
import { IconName } from '@/types'
import { Icon } from '@/components/ui/Icon'

// La tarjeta plegable de las secciones del expediente que SÍ tienen backend.
// Es la misma forma que `SeccionSinRegistro` en pacientes/[id]/page.tsx
// —título que despliega, chevron con su `aria-label`—, más un contador y una
// acción opcional en la cabecera.

export const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'
export const campoBase =
  'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'
export const Obligatorio = () => <span aria-hidden="true"> *</span>

interface SeccionDeExpedienteProps {
  icon: IconName
  titulo: string
  /** `null` mientras no se sabe cuántos hay: cargando o con error. */
  cantidad: number | null
  expanded: boolean
  onToggle: () => void
  /** Botón «Agregar» de la cabecera. Sin él, la sección es de solo lectura. */
  accion?: { etiqueta: string; onClick: () => void }
  children: React.ReactNode
}

export const SeccionDeExpediente: React.FC<SeccionDeExpedienteProps> = ({
  icon,
  titulo,
  cantidad,
  expanded,
  onToggle,
  accion,
  children,
}) => (
  <section
    aria-label={titulo}
    className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden"
  >
    <div className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
      <button className="flex items-center gap-3 flex-1 text-left cursor-pointer" onClick={onToggle}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-surface text-doc-blue">
          <Icon name={icon} size={16} />
        </div>
        <span className="font-semibold text-slate-700 text-sm font-outfit">{titulo}</span>
        {cantidad !== null && cantidad > 0 && (
          <span className="text-xs font-semibold text-slate-400">({cantidad})</span>
        )}
      </button>
      {accion && (
        <button
          onClick={accion.onClick}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-doc-surface text-doc-blue hover:bg-slate-200/80 transition-colors cursor-pointer"
        >
          {accion.etiqueta}
        </button>
      )}
      <button
        onClick={onToggle}
        aria-label={`Expandir ${titulo}`}
        className={`text-slate-400 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
      >
        <Icon name="chevron_down" size={18} />
      </button>
    </div>
    {expanded && <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3">{children}</div>}
  </section>
)

/** Aviso de error con reintento, el mismo tono rojo que el resto del expediente. */
export const ErrorDeSeccion: React.FC<{ mensaje: string; onReintentar: () => void }> = ({
  mensaje,
  onReintentar,
}) => (
  <div
    role="alert"
    className="flex items-center justify-between gap-3 rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
  >
    <span>{mensaje}</span>
    <button onClick={onReintentar} className="font-semibold underline cursor-pointer shrink-0">
      Reintentar
    </button>
  </div>
)

/** `AAAA-MM-DD` → `DD/MM/AAAA`, sin pasar por `Date`: un día no tiene zona horaria. */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : fecha
}

/** Hoy en la zona del navegador, `AAAA-MM-DD`: el tope del selector de fecha. */
export function hoy(): string {
  const d = new Date()
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

export function mensajeDe(error: unknown, porDefecto: string): string {
  return error instanceof Error && error.message ? error.message : porDefecto
}
