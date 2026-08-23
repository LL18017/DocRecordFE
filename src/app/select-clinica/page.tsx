'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clinica } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { useAppContext } from '@/context/AppContext'
import { ApiError } from '@/lib/api'
import { clinicaDtoAClinica, formatearCoordenadas, listarMisClinicas } from '@/services/clinicas'

export default function SelectClinicaPage() {
  const router = useRouter()
  const { user, cargandoSesion, setActiveClinic } = useAppContext()
  const [hovered, setHovered] = useState<number | null>(null)
  // Las clínicas salen de GET /clinics/mias. Con los datos de maqueta esta
  // pantalla ofrecía sedes que el usuario no tiene: se elegía una y el resto
  // del sistema trabajaba contra una clínica inexistente.
  const [clinicas, setClinicas] = useState<Clinica[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Esta pantalla es el paso siguiente al login, así que sin sesión no tiene
  // nada que mostrar.
  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/login')
  }, [cargandoSesion, user, router])

  const cargarClinicas = useCallback(async () => {
    try {
      const misClinicas = await listarMisClinicas()
      setClinicas(misClinicas.map(clinicaDtoAClinica))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus clínicas.')
    } finally {
      setCargando(false)
    }
  }, [])

  // Igual que en las demás pantallas: cargar datos remotos al montar es el
  // caso que react-hooks/set-state-in-effect no puede modelar; el setState
  // ocurre al llegar la respuesta, no durante el render.
  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver comentario arriba
    void cargarClinicas()
  }, [user, cargarClinicas])

  if (!user) return null

  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargarClinicas()
  }

  const select = (c: Clinica) => {
    setActiveClinic(c)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-doc-navy to-doc-navy-light">
      {/* Brand Bar */}
      <div className="flex items-center gap-3 px-8 py-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-doc-amber shadow-sm">
            <Icon name="shield" size={16} color="white" />
          </div>
          <span className="text-white font-bold text-lg font-outfit">
            DocRecord <span className="text-doc-amber">Sv</span>
          </span>
        </Link>
      </div>

      {/* Selector Container */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-doc-amber flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
              <Icon name="clinicas" size={28} color="white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 font-outfit">Selecciona tu clínica</h1>
            <p className="text-blue-200">
              Bienvenido, <span className="font-semibold text-white">{user.name}</span>. ¿En qué clínica vas a operar hoy?
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between gap-4 rounded-2xl border-2 border-red-400/40 bg-red-500/10 px-5 py-4 text-sm text-red-100"
            >
              <span>{error}</span>
              <button
                onClick={reintentar}
                className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
              >
                Reintentar
              </button>
            </div>
          )}

          {cargando ? (
            <p className="text-center text-blue-200 py-10">Cargando tus clínicas…</p>
          ) : clinicas.length === 0 && !error ? (
            /* Sin este bloque la pantalla se quedaba en blanco justo después
               del login y no había forma de saber que el problema era no tener
               ninguna clínica registrada. */
            <div className="rounded-2xl border-2 border-white/12 bg-white/6 px-6 py-10 text-center backdrop-blur-xs">
              <p className="text-white font-bold text-lg font-outfit mb-2">
                Todavía no tienes clínicas registradas
              </p>
              <p className="text-blue-200 text-sm mb-6">
                Para empezar a atender pacientes, registra primero la sede donde vas a trabajar.
              </p>
              <Link
                href="/clinicas"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-amber hover:opacity-90 shadow-sm transition-all"
              >
                <Icon name="add" size={16} color="white" /> Registrar una clínica
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {clinicas.map((c) => {
                const coordenadas = formatearCoordenadas(c.lat, c.lng)
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c)}
                    onMouseEnter={() => setHovered(c.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="w-full text-left rounded-2xl p-5 border-2 transition-all duration-200 flex items-center gap-5 cursor-pointer backdrop-blur-xs"
                    style={{
                      background: hovered === c.id ? 'rgba(232,168,56,0.15)' : 'rgba(255,255,255,0.06)',
                      borderColor: hovered === c.id ? '#E8A838' : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ background: hovered === c.id ? '#E8A838' : 'rgba(255,255,255,0.1)' }}
                    >
                      <Icon name="clinicas" size={24} color="white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-lg font-outfit">{c.name}</p>
                      {/* Una clínica sin coordenadas se puede elegir igual: lo
                          único que falta es dónde está, no si sirve. */}
                      <p
                        className={`text-xs mt-1.5 ${
                          coordenadas ? 'font-mono text-blue-300' : 'text-amber-300'
                        }`}
                      >
                        {coordenadas ?? 'Sin ubicación registrada'}
                      </p>
                    </div>
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                        hovered === c.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'
                      }`}
                      style={{ background: '#E8A838' }}
                    >
                      <Icon name="chevron_right" size={20} color="white" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <p className="text-center text-blue-300 text-sm mt-8">
            ¿Deseas gestionar las sedes?{' '}
            <Link
              href="/clinicas"
              className="text-doc-amber font-semibold hover:text-amber-300 transition-colors"
            >
              Gestionar clínicas
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
