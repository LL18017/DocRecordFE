'use client'

// Pantalla donde se pide el enlace de restablecimiento (HU-04, criterios 1 y 4).
//
// ── Por qué la confirmación no dice si el correo existe ──────────────────────
// El backend responde 202 con el mismo mensaje exista o no la cuenta, para no
// revelar qué correos están registrados. Esta pantalla tiene que sostener esa
// decisión: si mostrara «te enviamos el enlace» para unos y «ese correo no está
// registrado» para otros, el trabajo del backend no serviría de nada —quien
// quiera averiguar si alguien tiene cuenta solo tendría que probar aquí—.
//
// Por eso el mensaje de éxito empieza por «Si el correo está registrado…», que
// es verdad en los dos casos y no obliga a mentir en ninguno.

import React, { useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { ApiError } from '@/lib/api'
import { solicitarRecuperacion } from '@/services/auth'

const ID_EMAIL = 'recuperar-email'
const ID_ERROR = 'recuperar-error'

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40 transition-colors'
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider'

export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const { mensaje } = await solicitarRecuperacion(email)
      setConfirmacion(mensaje)
    } catch (err) {
      // Un fallo aquí es de red o del servidor, nunca «ese correo no existe»:
      // ese caso responde 202 como cualquier otro.
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.',
      )
    } finally {
      setEnviando(false)
    }
  }

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
            Recuperar contraseña
          </h1>
          <p className="text-slate-500 text-sm">
            Te enviaremos un enlace para que definas una nueva.
          </p>
        </div>

        {confirmacion ? (
          // El formulario desaparece al confirmar: dejarlo visible invita a
          // reenviar en bucle, y cada envío quema el enlace anterior.
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <Icon name="bell" size={22} color="#047857" />
            </div>
            <p role="status" className="text-sm text-slate-700 leading-relaxed">
              {confirmacion}
            </p>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              El enlace vence en una hora y solo puede usarse una vez. Si no llega, revisa
              la carpeta de correo no deseado.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 text-sm font-semibold text-doc-blue hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100"
          >
            <div className="mb-6">
              <label htmlFor={ID_EMAIL} className={labelClass}>
                Correo electrónico
              </label>
              <input
                id={ID_EMAIL}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="usuario@ues.edu.sv"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? ID_ERROR : undefined}
                className={inputClass}
              />
              <p className="text-xs text-slate-500 mt-2">
                Escribe el correo con el que inicias sesión.
              </p>
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
              {enviando ? 'Enviando…' : 'Enviarme el enlace'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
