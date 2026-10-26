'use client'

import React, { useId } from 'react'
import type { FiltroDeConsultas } from '@/services/consultas'

/** Un médico que se puede elegir en el filtro. */
export interface OpcionMedico {
  personaId: number
  nombre: string
}

interface FiltrosDeConsultasProps {
  filtro: FiltroDeConsultas
  /**
   * Los médicos que se pueden elegir. No hay un catálogo del personal médico
   * que estas pantallas puedan consultar (`GET /user/all` es solo del
   * administrador), así que se arma con los médicos que ya aparecen en las
   * consultas cargadas; ver quien lo monta (`medicosDeConsultas`).
   */
  medicos: OpcionMedico[]
  onChange: (filtro: FiltroDeConsultas) => void
}

const campo =
  'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'

/**
 * HU-20 c2: filtro del historial de consultas por rango de fechas y por
 * médico. Es controlado: quien lo monta decide si filtra en el servidor
 * (listado general) o en el cliente (el expediente de un paciente).
 */
export const FiltrosDeConsultas: React.FC<FiltrosDeConsultasProps> = ({
  filtro,
  medicos,
  onChange,
}) => {
  const uid = useId()
  const hayFiltros = Boolean(filtro.desde || filtro.hasta || filtro.medicoId !== undefined)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filtros</h2>
        {hayFiltros && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs font-semibold text-doc-blue hover:underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${uid}-desde`} className="block text-xs text-slate-500 mb-1">
            Desde
          </label>
          <input
            id={`${uid}-desde`}
            type="date"
            value={filtro.desde ?? ''}
            max={filtro.hasta || undefined}
            onChange={(e) => onChange({ ...filtro, desde: e.target.value || undefined })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-hasta`} className="block text-xs text-slate-500 mb-1">
            Hasta
          </label>
          <input
            id={`${uid}-hasta`}
            type="date"
            value={filtro.hasta ?? ''}
            min={filtro.desde || undefined}
            onChange={(e) => onChange({ ...filtro, hasta: e.target.value || undefined })}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-medico`} className="block text-xs text-slate-500 mb-1">
            Médico
          </label>
          <select
            id={`${uid}-medico`}
            value={filtro.medicoId === undefined ? '' : String(filtro.medicoId)}
            onChange={(e) =>
              onChange({
                ...filtro,
                medicoId: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className={campo}
          >
            <option value="">Todos los médicos</option>
            {medicos.map((m) => (
              <option key={m.personaId} value={String(m.personaId)}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
