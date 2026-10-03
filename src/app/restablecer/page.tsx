'use client'

// Pantalla donde se define la contraseña nueva (HU-04, criterios 2 y 3).
//
// La ruta NO es arbitraria: el correo que manda el backend apunta a
// `${app.frontend.url}/restablecer?token=...` (ver RUTA_DEL_FORMULARIO en
// RecuperacionDeContrasenaService). Si esta carpeta se renombra, los enlaces ya
// enviados dejan de funcionar sin que nada avise.

import React, { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ApiError } from '@/lib/api'
import { restablecerContrasena } from '@/services/auth'

const ID_PASSWORD = 'restablecer-password'
const ID_CONFIRMACION = 'restablecer-confirmacion'
const ID_ERROR = 'restablecer-error'

/** El backend exige 8 como mínimo; comprobarlo aquí evita un viaje para nada. */
const LARGO_MINIMO = 8

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40 transition-colors'
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider'

function Formulario() {
  const router = useRouter()
  const token = useSearchParams().get('token')

  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // Las dos comprobaciones locales van antes de la petición: el backend
    // también las hace, pero decirlo aquí evita quemar el enlace por una
    // errata —cada intento consume un viaje y el token es de un solo uso—.
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    if (password.length < LARGO_MINIMO) {
      setError(`La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`)
      return
    }

    setEnviando(true)
    try {
      await restablecerContrasena(token!, password)
      setListo(true)
      // Se redirige sola, pero con un momento de pausa para que se alcance a
      // leer la confirmación; quien no quiera esperar tiene el enlace.
      setTimeout(() => router.push('/login'), 2500)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo restablecer la contraseña. Intenta de nuevo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  // Sin token no hay nada que hacer, y llegar aquí a mano es lo normal: basta
  // con que alguien abra /restablecer sin el enlace. Se explica en vez de
  // mostrar un formulario que va a fallar al enviarlo.
  if (!token) {
    return (
      <Tarjeta>
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Icon name="shield" size={22} color="#B45309" />
        </div>
        <p role="alert" className="text-sm text-slate-700 leading-relaxed">
          Este enlace está incompleto. Abre el que te llegó por correo, tal cual, sin
          recortarlo.
        </p>
        <Link
          href="/recuperar"
          className="inline-block mt-6 text-sm font-semibold text-doc-blue hover:underline"
        >
          Pedir un enlace nuevo
        </Link>
      </Tarjeta>
    )
  }

  if (listo) {
    return (
      <Tarjeta>
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <Icon name="shield" size={22} color="#047857" />
        </div>
        <p role="status" className="text-sm text-slate-700 leading-relaxed">
          Tu contraseña quedó cambiada. Ya puedes iniciar sesión con la nueva.
        </p>
        <Link
          href="/login"
          className="inline-block mt-6 text-sm font-semibold text-doc-blue hover:underline"
        >
          Ir a iniciar sesión
        </Link>
      </Tarjeta>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100"
    >
      <div className="space-y-4 mb-6">
        <div>
          <label htmlFor={ID_PASSWORD} className={labelClass}>
            Contraseña nueva
          </label>
          <input
            id={ID_PASSWORD}
            type="password"
            required
            minLength={LARGO_MINIMO}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ID_ERROR : undefined}
            className={inputClass}
          />
          <p className="text-xs text-slate-500 mt-2">
            Al menos {LARGO_MINIMO} caracteres.
          </p>
        </div>
        <div>
          <label htmlFor={ID_CONFIRMACION} className={labelClass}>
            Repite la contraseña
          </label>
          <input
            id={ID_CONFIRMACION}
            type="password"
            required
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ID_ERROR : undefined}
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p
          id={ID_ERROR}
          role="alert"
          className="mb-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="w-full py-3.5 rounded-2xl font-semibold text-white text-base bg-gradient-to-r from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {enviando ? 'Guardando…' : 'Cambiar contraseña'}
      </button>

      <p className="text-center text-xs text-slate-500 mt-5 leading-relaxed">
        Si el enlace ya venció o se usó,{' '}
        <Link href="/recuperar" className="font-semibold text-doc-blue hover:underline">
          pide uno nuevo
        </Link>
        .
      </p>
    </form>
  )
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center">
      {children}
    </div>
  )
}

export default function RestablecerPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-doc-surface">
      <div className="w-full max-w-md">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <Icon name="back" size={16} /> Volver a iniciar sesión
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 font-outfit">
            Nueva contraseña
          </h1>
          <p className="text-slate-500 text-sm">Define la contraseña con la que entrarás.</p>
        </div>

        {/*
          useSearchParams() obliga a que el componente que lo usa esté dentro de
          un Suspense: sin él, `next build` falla al prerenderizar esta ruta.
        */}
        <Suspense
          fallback={
            <Tarjeta>
              <p className="text-sm text-slate-500">Cargando…</p>
            </Tarjeta>
          }
        >
          <Formulario />
        </Suspense>
      </div>
    </div>
  )
}
