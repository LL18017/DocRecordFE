'use client'

import React, { useEffect, useRef } from 'react'
import { IconName } from '@/types'
import { Icon } from './Icon'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: IconName
  headerGradient?: string
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  children: React.ReactNode
  footer?: React.ReactNode
}

// Lo que puede recibir el foco con Tab dentro de la ventana.
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function enfocables(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  )
}

const maxWidthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerGradient = 'bg-gradient-to-r from-doc-blue to-doc-blue-light',
  maxWidth = 'md',
  children,
  footer,
}) => {
  const ventana = useRef<HTMLDivElement>(null)
  const contenido = useRef<HTMLDivElement>(null)

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // HU-35 c5 (DEF-18): quien usa solo el teclado tiene que quedar DENTRO de la
  // ventana al abrirla. Sin esto el foco seguía en la página de fondo y había
  // que pasar con Tab por controles tapados antes de llegar al formulario.
  // Al abrir, el foco va al primer campo del contenido (o, si no hay, al botón
  // de cerrar); Tab y Shift+Tab giran dentro de la ventana; al cerrar, el foco
  // vuelve al control que la abrió.
  useEffect(() => {
    if (!isOpen) return
    const previo = document.activeElement as HTMLElement | null
    const raiz = ventana.current
    // Si un campo del contenido ya tomó el foco (autoFocus), se respeta.
    if (!raiz?.contains(document.activeElement)) {
      const primero =
        (contenido.current && enfocables(contenido.current)[0]) ?? (raiz && enfocables(raiz)[0])
      primero?.focus()
    }

    const atrapar = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !raiz) return
      const lista = enfocables(raiz)
      if (lista.length === 0) return
      const inicio = lista[0]
      const fin = lista[lista.length - 1]
      const activo = document.activeElement
      if (e.shiftKey && (activo === inicio || !raiz.contains(activo))) {
        e.preventDefault()
        fin.focus()
      } else if (!e.shiftKey && (activo === fin || !raiz.contains(activo))) {
        e.preventDefault()
        inicio.focus()
      }
    }
    document.addEventListener('keydown', atrapar)
    return () => {
      document.removeEventListener('keydown', atrapar)
      previo?.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      ref={ventana}
      className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`bg-white rounded-3xl shadow-2xl w-full ${maxWidthMap[maxWidth]} overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8`}
      >
        {/* Header */}
        <div className={`flex items-center gap-4 px-6 py-5 ${headerGradient} text-white`}>
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shadow-xs flex-shrink-0">
              <Icon name={icon} size={20} color="white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 id="modal-title" className="text-white font-bold text-lg font-outfit truncate">
              {title}
            </h3>
            {subtitle && <p className="text-white/80 text-xs mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 cursor-pointer"
            aria-label="Cerrar modal"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Content */}
        <div ref={contenido} className="p-6">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
