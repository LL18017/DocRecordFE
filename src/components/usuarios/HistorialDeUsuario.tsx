'use client'

// ─── HU-05 criterio 5 · Historial de administración de una cuenta ───────────
// Quién y cuándo dio de alta la cuenta, la activó o desactivó, y le asignó o
// quitó roles. Lo escribe el backend en cada una de esas operaciones; aquí solo
// se lee.

import React, { useEffect, useState } from 'react'
import { bitacoraDeUsuario, type RegistroDeBitacoraDto } from '@/services/usuarios'

const ETIQUETAS: Record<RegistroDeBitacoraDto['accion'], string> = {
  ALTA: 'Alta de la cuenta',
  ACTIVACION: 'Cuenta activada',
  DESACTIVACION: 'Cuenta desactivada',
  ROL_ASIGNADO: 'Rol asignado',
  ROL_RETIRADO: 'Rol retirado',
}

function fechaLegible(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return fecha.toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' })
}

interface Props {
  userId: number
  userName: string
  onCerrar: () => void
}

export const HistorialDeUsuario: React.FC<Props> = ({ userId, userName, onCerrar }) => {
  const [registros, setRegistros] = useState<RegistroDeBitacoraDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    bitacoraDeUsuario(userId)
      .then((lista) => {
        if (vigente) setRegistros(lista)
      })
      .catch((err) => {
        if (vigente) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'No se pudo cargar el historial.',
          )
        }
      })
    // Si el modal se cierra o cambia de cuenta antes de que llegue la
    // respuesta, esa respuesta ya no corresponde a lo que se ve.
    return () => {
      vigente = false
    }
  }, [userId])

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Altas, cambios de estado y de rol de{' '}
        <span className="font-semibold text-slate-700">{userName}</span>, lo más reciente primero.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : registros === null ? (
        <p className="py-8 text-center text-sm text-slate-500">Cargando historial…</p>
      ) : registros.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Esta cuenta no tiene acciones registradas. Las anteriores a la auditoría no se guardaron.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {registros.map((r, i) => (
            <li key={`${r.realizadoEn}-${i}`} className="px-4 py-3 text-sm">
              <p className="font-semibold text-slate-800">
                {ETIQUETAS[r.accion] ?? r.accion}
                {r.detalle && <span className="font-normal text-slate-500"> · {r.detalle}</span>}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {fechaLegible(r.realizadoEn)} · por {r.realizadoPor}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCerrar}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
