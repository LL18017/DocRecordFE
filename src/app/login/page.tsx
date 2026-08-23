'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Role, IconName } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { useAppContext } from '@/context/AppContext'
import { ApiError } from '@/lib/api'

const features: { icon: IconName; text: string }[] = [
  { icon: 'history', text: 'Historial clínico completo' },
  { icon: 'vitals', text: 'Signos vitales en tiempo real' },
  { icon: 'map', text: 'Geolocalización de clínicas' },
]

// TODO: LoginResponseDto no distingue médico de enfermera todavía (la tabla
// `role` solo tiene ADMIN), así que mapearRol cae a este valor por defecto.
// Eliminar este respaldo cuando el backend agregue el dato a la respuesta.
const ROL_POR_DEFECTO: Role = 'medico'

// Ids fijos, sin `useId()`: esta es una ruta con un solo formulario y no hay
// forma de que se monte dos veces a la vez, así que no hay ids que puedan
// chocar. Donde sí hace falta es en los formularios de components/forms, que
// son componentes reutilizables.
const ID_EMAIL = 'login-email'
const ID_PASSWORD = 'login-password'
const ID_ERROR = 'login-error'

// Clases de los campos. Lo único que se agrega a las que ya había es
// `focus-visible:ring-*`, que acompaña al `focus:outline-none`: quitar el
// contorno del navegador sin reponer nada deja a quien navega con teclado sin
// saber dónde está parado.
const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40 transition-colors'
const labelClass =
  'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider'

export default function LoginPage() {
  const router = useRouter()
  const { iniciarSesion } = useAppContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      await iniciarSesion(email, password, ROL_POR_DEFECTO)
      router.push('/select-clinica')
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Ocurrió un error inesperado al iniciar sesión.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-doc-surface">
      {/* Left login form*/}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
          >
            <Icon name="back" size={16} /> Volver
          </Link>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2 font-outfit">Iniciar sesión</h1>
            <p className="text-slate-500 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
            {/* Form fields */}
            <div className="space-y-4 mb-6">
              <div>
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
                  placeholder="usuario@docrecord.sv"
                  // El rechazo del servidor es sobre la pareja correo/clave: no
                  // dice cuál de los dos falló, así que se enlaza a ambos. Suelto
                  // se anunciaría una vez; enlazado se relee al volver al campo.
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? ID_ERROR : undefined}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={ID_PASSWORD} className={labelClass}>
                  Contraseña
                </label>
                <input
                  id={ID_PASSWORD}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
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
              {enviando ? 'Ingresando…' : 'Ingresar al sistema'}
            </button>

            <p className="text-center text-sm text-slate-500 mt-5">
              ¿Sin cuenta?{' '}
              <Link
                href="/register"
                className="font-semibold text-doc-blue hover:underline cursor-pointer"
              >
                Registrarme como médico
              </Link>
            </p>
          </form>

        </div>
      </div>

      {/* Right branding banner */}
      <div className="lg:flex flex-col justify-center items-center p-12 bg-gradient-to-br from-doc-navy to-doc-navy-light text-white">
        <Link href="/" className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-doc-amber shadow-sm">
            <Icon name="shield" size={20} color="white" />
          </div>
          <span className="text-white font-bold text-2xl font-outfit">
            DocRecord <span className="text-doc-amber">Sv</span>
          </span>
        </Link>

        <div className="text-center max-w-xs">
          <h2 className="text-3xl font-bold text-white mb-4 font-outfit">Bienvenido de regreso</h2>
          <p className="text-blue-200 leading-relaxed text-sm">
            Accede a tu sistema de gestión clínica centralizado para El Salvador.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 w-full max-w-xs">
          {features.map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 backdrop-blur-xs">
              <Icon name={icon} size={16} color="#E8A838" />
              <span className="text-blue-100 text-sm font-medium">{text}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
