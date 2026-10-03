'use client'

import React, { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/types'

/**
 * Destino del enlace de confirmación que llega por correo.
 *
 * El backend procesa el token y redirige aquí con el resultado en `?estado=`,
 * en lugar de responder él mismo. Un enlace de correo lo abre una persona en su
 * navegador: dejarla en una página en blanco servida por la API, con el puerto
 * del backend a la vista, no le dice qué hacer después.
 */

type Estado = 'ok' | 'ya-confirmada' | 'expirado' | 'invalido'

interface Mensaje {
  icono: IconName
  titulo: string
  detalle: string
  /** Verde para los dos casos en que la cuenta quedó activa. */
  exito: boolean
  /** Solo se ofrece reintentar cuando volver a registrarse resuelve algo. */
  ofrecerRegistro?: boolean
}

const MENSAJES: Record<Estado, Mensaje> = {
  ok: {
    icono: 'shield',
    titulo: 'Cuenta confirmada',
    detalle: 'Tu cuenta quedó activa. Ya puedes iniciar sesión en DocRecord Sv.',
    exito: true,
  },
  // Se trata como éxito a propósito: pasa al hacer clic dos veces en el enlace,
  // o cuando el cliente de correo lo pre-visita. La cuenta está activa, así que
  // mostrar un error sería mentir.
  'ya-confirmada': {
    icono: 'shield',
    titulo: 'Tu cuenta ya estaba activa',
    detalle: 'No hace falta confirmarla otra vez. Puedes iniciar sesión cuando quieras.',
    exito: true,
  },
  expirado: {
    icono: 'history',
    titulo: 'El enlace expiró',
    detalle:
      'Por seguridad, el enlace de confirmación tiene una vigencia corta. Regístrate de nuevo con el mismo correo y te enviaremos uno nuevo.',
    exito: false,
    ofrecerRegistro: true,
  },
  invalido: {
    icono: 'close',
    titulo: 'Enlace no válido',
    detalle:
      'Este enlace no corresponde a ninguna solicitud de confirmación. Revisa que lo hayas copiado completo desde el correo.',
    exito: false,
    ofrecerRegistro: true,
  },
}

function Resultado() {
  const parametros = useSearchParams()
  const recibido = parametros.get('estado')

  // Un estado desconocido se trata como enlace inválido: es lo que se vería si
  // alguien escribe la URL a mano o si el backend cambia el contrato.
  const estado: Estado =
    recibido && recibido in MENSAJES ? (recibido as Estado) : 'invalido'
  const mensaje = MENSAJES[estado]

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
            mensaje.exito ? 'bg-emerald-50' : 'bg-amber-50'
          }`}
        >
          <Icon
            name={mensaje.icono}
            size={30}
            color={mensaje.exito ? '#059669' : '#B45309'}
          />
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-3 font-outfit">
          {mensaje.titulo}
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">{mensaje.detalle}</p>

        <Link
          href="/login"
          className="block w-full py-3.5 rounded-2xl font-semibold text-white text-base bg-gradient-to-r from-doc-blue to-doc-blue-light hover:opacity-95 shadow-md shadow-doc-blue/20 transition-all"
        >
          Iniciar sesión
        </Link>

        {mensaje.ofrecerRegistro && (
          <p className="text-center text-sm text-slate-500 mt-5">
            ¿Necesitas un enlace nuevo?{' '}
            <Link href="/register" className="font-semibold text-doc-blue hover:underline">
              Volver a registrarme
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

export default function ConfirmarPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-doc-surface">
      {/* useSearchParams exige un límite de Suspense: durante el prerenderizado
          los parámetros de la URL todavía no se conocen. */}
      <Suspense
        fallback={
          <p className="text-slate-500 text-sm">Confirmando tu cuenta…</p>
        }
      >
        <Resultado />
      </Suspense>
    </div>
  )
}
