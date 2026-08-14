'use client'

import React, { useEffect } from 'react'
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

  if (!isOpen) return null

  return (
    <div
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
        <div className="p-6">{children}</div>

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
