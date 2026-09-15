'use client'

// HU-06 (DRS-79), criterio 3 · el aviso de que la sesión está por expirar.
//
// «Dado que faltan 2 minutos para expirar, cuando sigo en pantalla, entonces
//  aparece un aviso que me permite continuar la sesión SIN VOLVER A
//  AUTENTICARME.»
//
// Esa última parte es la razón de ser del aviso. Sin él, un médico que está
// dictando un diagnóstico pierde la sesión a mitad de frase y tiene que volver
// a teclear su contraseña delante del paciente. Con él, la alternativa es un
// botón.

import React from 'react'
import { Icon } from '@/components/ui/Icon'

export interface AvisoDeInactividadProps {
  segundosRestantes: number
  onContinuar: () => void
  onCerrarSesion: () => void
}

export function AvisoDeInactividad({
  segundosRestantes,
  onContinuar,
  onCerrarSesion,
}: AvisoDeInactividadProps) {
  const minutos = Math.floor(segundosRestantes / 60)
  const segundos = segundosRestantes % 60

  return (
    // `alertdialog` y no `dialog`: interrumpe para pedir una decisión con un
    // plazo. Un lector de pantalla lo anuncia de inmediato en vez de esperar a
    // que el foco llegue.
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="aviso-inactividad-titulo"
      aria-describedby="aviso-inactividad-detalle"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
          <Icon name="history" size={22} color="#B45309" />
        </div>

        <h2
          id="aviso-inactividad-titulo"
          className="mb-2 text-center font-outfit text-lg font-bold text-slate-800"
        >
          Tu sesión está por expirar
        </h2>

        <p
          id="aviso-inactividad-detalle"
          className="mb-1 text-center text-sm leading-relaxed text-slate-600"
        >
          Por seguridad, se cerrará sola tras un rato sin uso.
        </p>

        {/* La cuenta atrás se anuncia con `aria-live="polite"` y no `assertive`:
            interrumpir cada segundo a quien usa lector de pantalla haría el
            aviso inservible justo para quien más lo necesita. */}
        <p
          aria-live="polite"
          className="mb-5 text-center font-outfit text-3xl font-bold tabular-nums text-slate-800"
        >
          {minutos}:{String(segundos).padStart(2, '0')}
        </p>

        <button
          type="button"
          onClick={onContinuar}
          autoFocus
          className="mb-2 w-full cursor-pointer rounded-2xl bg-gradient-to-r from-doc-blue to-doc-blue-light py-3 text-base font-semibold text-white shadow-md shadow-doc-blue/20 transition-all hover:opacity-95"
        >
          Continuar trabajando
        </button>

        <button
          type="button"
          onClick={onCerrarSesion}
          className="w-full cursor-pointer rounded-2xl py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          Cerrar sesión ahora
        </button>
      </div>
    </div>
  )
}
