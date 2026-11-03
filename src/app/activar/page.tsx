'use client'

// Pantalla donde se activa una cuenta abierta por el administrador (HU-02).
//
// Desde que no hay registro público, la cuenta de un médico la crea el
// administrador desde su ficha y la persona recibe una invitación por correo
// para elegir aquí su contraseña. Al guardarla la cuenta queda activa. Sirve
// igual para el paciente.
//
// La ruta NO es arbitraria: el correo apunta a
// `${app.frontend.url}/activar?token=...` (RUTA_DEL_FORMULARIO en
// InvitacionService). Si esta carpeta se renombra, las invitaciones ya
// enviadas dejan de funcionar sin que nada avise.

import React, { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { ApiError } from '@/lib/api'
import { activarInvitacion } from '@/services/auth'
import { AYUDA_CONTRASENA, LARGO_MINIMO_CONTRASENA, motivoContrasenaInvalida } from '@/lib/contrasena'

const ID_PASSWORD = 'activar-password'
const ID_CONFIRMACION = 'activar-confirmacion'
const ID_ERROR = 'activar-error'

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
    // también las hace, pero decirlo aquí ahorra un viaje por una errata.
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    // La regla completa (8 caracteres, mayúscula y número) vive en
    // lib/contrasena.ts y es la misma que aplica el backend.
    const motivo = motivoContrasenaInvalida(password)
    if (motivo) {
      setError(motivo)
      return
    }

    setEnviando(true)
    try {
      await activarInvitacion(token!, password)
      setListo(true)
      // Se redirige sola, pero con un momento de pausa para que se alcance a
      // leer la confirmación; quien no quiera esperar tiene el enlace.
      setTimeout(() => router.push('/login'), 2500)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo activar la cuenta. Intenta de nuevo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  // Sin token no hay nada que hacer: se explica en vez de mostrar un
  // formulario que va a fallar al enviarlo.
  if (!token) {
    return (
      <Tarjeta>
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Icon name="shield" size={22} color="#B45309" />
        </div>
        <p role="alert" className="text-sm text-slate-700 leading-relaxed">
          Este enlace está incompleto. Abre el que te llegó por correo, tal cual, sin
          recortarlo. Si ya no lo tienes, pide al administrador de tu clínica que te mande
          otra invitación.
        </p>
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
          Tu cuenta quedó activa. Ya puedes iniciar sesión con tu correo y la contraseña que
          elegiste.
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
            Tu contraseña
          </label>
          <input
            id={ID_PASSWORD}
            type="password"
            required
            minLength={LARGO_MINIMO_CONTRASENA}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ID_ERROR : undefined}
            className={inputClass}
          />
          <p className="text-xs text-slate-500 mt-2">{AYUDA_CONTRASENA}</p>
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
        {enviando ? 'Activando…' : 'Activar mi cuenta'}
      </button>

      <p className="text-center text-xs text-slate-500 mt-5 leading-relaxed">
        Si el enlace ya venció o se usó, pide al administrador de tu clínica que te mande otra
        invitación.
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

export default function ActivarPage() {
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
            Activa tu cuenta
          </h1>
          <p className="text-slate-500 text-sm">Elige la contraseña con la que vas a entrar.</p>
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
