'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { IconName } from '@/types'
import { registrar } from '@/services/auth'
import { listarEspecialidades, type EspecialidadDto } from '@/services/personas'
import { ApiError } from '@/lib/api'

const features: { icon: IconName; text: string }[] = [
  { icon: 'history', text: 'Historial clínico completo' },
  { icon: 'vitals', text: 'Signos vitales en tiempo real' },
  { icon: 'map', text: 'Geolocalización de clínicas' },
]

export default function RegisterPage() {
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /** `null` mientras el formulario sigue en pantalla. */
  const [resultado, setResultado] = useState<{ correoEnviado: boolean } | null>(null)
  const [especialidades, setEspecialidades] = useState<EspecialidadDto[]>([])
  const [especialidadId, setEspecialidadId] = useState<number | null>(null)

  useEffect(() => {
    listarEspecialidades()
      .then((lista) => {
        const activas = lista.filter((e) => e.activa)
        setEspecialidades(activas)
        setEspecialidadId((actual) => actual ?? activas[0]?.especialidadId ?? null)
      })
      .catch(() => {
        // El catálogo es un detalle del formulario, no algo que deba impedir
        // registrarse: si falla, el selector simplemente queda vacío y el
        // envío se bloquea más abajo por falta de especialidadId.
      })
  }, [])

  /**
   * Manda el alta al backend. Se usa tanto al enviar el formulario como al
   * reintentar desde el aviso de «el correo no salió»: repetir el registro con
   * el mismo correo sobrescribe la cuenta sin confirmar y genera un enlace
   * nuevo, así que el propio formulario ES el mecanismo de reenvío. No hace
   * falta ningún endpoint aparte.
   */
  const enviarRegistro = async () => {
    setError(null)

    if (especialidadId === null) {
      setError('No se pudo cargar el catálogo de especialidades. Intenta de nuevo más tarde.')
      return
    }

    setEnviando(true)
    try {
      const cuenta = await registrar({ nombres, apellidos, email, password, especialidadId })
      // Se exige un `true` explícito. Si el campo faltara —un backend viejo,
      // un proxy que recorta la respuesta— lo honesto es el aviso: prometer un
      // correo que quizá no salió deja a alguien esperando indefinidamente,
      // mientras que avisar de más solo cuesta un reintento.
      setResultado({ correoEnviado: cuenta.correoDeVerificacionEnviado === true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Ocurrió un error inesperado al crear la cuenta.',
      )
    } finally {
      setEnviando(false)
    }
  }

  const handleRegister = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    await enviarRegistro()
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-doc-surface">
      {/* Right registration form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
          >
            <Icon name="back" size={16} /> Volver
          </Link>

          {resultado?.correoEnviado ? (
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-3 font-outfit">Cuenta creada</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Revisa tu correo <span className="font-semibold text-slate-800">{email}</span> para
                activar tu cuenta. No podrás iniciar sesión hasta que confirmes el enlace que te
                enviamos.
              </p>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center py-3.5 rounded-2xl font-semibold text-white text-base bg-gradient-to-r from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all cursor-pointer"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          ) : resultado ? (
            /* La cuenta existe, pero el correo no salió. Ámbar y no rojo, como
               en /confirmar: no es un error de quien se registra ni algo que se
               haya perdido, es un contratiempo con solución inmediata. El
               `role="alert"` lo anuncia a un lector de pantalla —y también los
               cambios que ocurran dentro, como el error de un reintento
               fallido—, igual que los avisos del resto de formularios. */
            <div
              role="alert"
              className="bg-white rounded-3xl p-8 shadow-xl border-2 border-amber-200"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-5">
                <Icon name="history" size={24} color="#B45309" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3 font-outfit">
                Tu cuenta se creó, pero el correo no salió
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                La cuenta de{' '}
                <span className="font-semibold text-slate-800">{email}</span> quedó registrada. Lo
                que falló fue el envío del mensaje de confirmación: no te va a llegar nada a la
                bandeja, así que no lo esperes.
              </p>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Se arregla desde aquí: al repetir el registro con este mismo correo se genera un
                enlace de confirmación nuevo. Tus datos siguen cargados.
              </p>

              <button
                type="button"
                onClick={enviarRegistro}
                disabled={enviando}
                className="w-full py-3.5 rounded-2xl font-semibold text-white text-base bg-gradient-to-r from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {enviando ? 'Reintentando el envío…' : 'Reintentar el envío del correo'}
              </button>

              {error && (
                <p className="mt-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <p className="text-xs text-slate-500 leading-relaxed mt-5">
                Si vuelve a fallar, inténtalo más tarde: tu cuenta no se pierde ni se duplica por
                reintentar.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-6 font-outfit">Datos del médico</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Nombres *
                  </label>
                  <input
                    required
                    type="text"
                    value={nombres}
                    onChange={(e) => setNombres(e.target.value)}
                    placeholder="Juan Armando"
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Apellidos *
                  </label>
                  <input
                    required
                    type="text"
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    placeholder="Guerra Guevara"
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Correo electrónico *
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    autoComplete="email"
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Contraseña *
                  </label>
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Especialidad *
                  </label>
                  <select
                    required
                    value={especialidadId ?? ''}
                    onChange={(e) => setEspecialidadId(Number(e.target.value))}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                  >
                    {especialidades.length === 0 && <option value="">Cargando especialidades…</option>}
                    {especialidades.map((e) => (
                      <option key={e.especialidadId} value={e.especialidadId}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-start gap-2 cursor-pointer pt-1">
                  <input type="checkbox" className="mt-0.5 rounded text-doc-blue" defaultChecked />
                  <span className="text-xs text-slate-500">
                    He leído y acepto las{' '}
                    <span className="font-semibold text-doc-blue">Políticas de Privacidad</span>
                  </span>
                </label>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full py-3.5 rounded-2xl font-semibold text-white text-base mt-6 bg-gradient-to-r from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Left decorative card */}
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
          <h2 className="text-3xl font-bold text-white mb-4 font-outfit">Estamos deseando que seas parte</h2>
          <p className="text-blue-200 leading-relaxed text-sm">
            Completa tus datos para crear tu cuenta en DocRecord Sv y comenzar a gestionar pacientes.
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
