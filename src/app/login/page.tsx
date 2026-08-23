'use client'

import { Icon } from '@/components/ui/Icon'
import { authService } from '@/services/auth.service'
import { IconName, LoginRequest, Role } from '@/types'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

const features: { icon: IconName; text: string }[] = [
  { icon: 'history', text: 'Historial clínico completo' },
  { icon: 'vitals', text: 'Signos vitales en tiempo real' },
  { icon: 'map', text: 'Geolocalización de clínicas' },
]

export default function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<Role>({
    roleId: 2,
    name: 'Enfermera',
  })
  const [user, setUser] = useState<LoginRequest>({
    email: '',
    password: '',
  })

  async function handleLogin (e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    
    const res = await authService.login(user)
    if(res.token)
      router.push('/select-clinica')
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
            {/* Role selector */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                Rol de acceso
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([['medico', 'Médico'], ['enfermera', 'Enfermera']]).map(([r, label]) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole({roleId: (r === 'medico') ? 1 : 2, name: label})}
                    className={`py-3 rounded-xl text-sm font-medium border-2 transition-all flex flex-col items-center gap-1.5 cursor-pointer 
                      ${role.name === label
                      ? 'border-blue-600 text-blue-700 bg-blue-50/70 font-semibold'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-slate-50/50'
                      }`}
                  >
                    <Icon
                      name={r === 'medico' ? 'consultas' : 'enfermeria'}
                      size={18}
                      color={role.name === label ? '#1d4ed8' : '#94a3b8'}
                    />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  placeholder="juan.guerra@docrecord.sv"
                  onChange={(e) => { setUser({ ...user, email: e.target.value }) }}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  onChange={(e) => { setUser({ ...user, password: e.target.value }) }}
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none 
                    focus:border-doc-blue transition-colors bg-white"
                />
              </div>
            </div>

            
            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-base bg-linear-to-r 
                from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all cursor-pointer"
            >
              Ingresar al sistema
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
