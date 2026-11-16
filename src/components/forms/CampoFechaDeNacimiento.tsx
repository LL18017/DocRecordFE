'use client'

import React, { useState } from 'react'
import { AYUDA_NACIMIENTO, FECHA_MINIMA_DE_NACIMIENTO } from '@/lib/validaciones'

/**
 * El campo de fecha de nacimiento, el mismo en todos los formularios que la
 * piden (alta y edición del paciente, rol Paciente en Usuarios y Roles).
 *
 * `min` y `max` acotan el calendario del navegador, pero no impiden escribir
 * a mano un año fuera de rango; por eso el formulario valida aparte con
 * `motivoNacimientoInvalido` y pasa el motivo en `error`.
 *
 * El rango se avisa al entrar al campo, no solo después de equivocarse: quien
 * escribe la fecha sabe de antemano qué se acepta. Mientras no se está en el
 * campo la ayuda queda solo para lectores de pantalla (`sr-only`), que la leen
 * como descripción del campo al llegar a él. Si hay error, el error ocupa su
 * lugar.
 */
export const CampoFechaDeNacimiento: React.FC<{
  id: string
  valor: string
  onCambio: (valor: string) => void
  /** Hoy en El Salvador (`hoyEnElSalvador`), como `YYYY-MM-DD`. */
  hoy: string
  error: string | null
  className: string
}> = ({ id, valor, onCambio, hoy, error, className }) => {
  const [enfocado, setEnfocado] = useState(false)
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <>
      <input
        id={id}
        type="date"
        required
        min={FECHA_MINIMA_DE_NACIMIENTO}
        max={hoy}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : idAyuda}
        className={className}
      />
      {error ? (
        <p id={idError} role="alert" className="text-xs text-red-600 mt-1">
          {error}
        </p>
      ) : (
        <p id={idAyuda} className={enfocado ? 'text-xs text-slate-500 mt-1' : 'sr-only'}>
          {AYUDA_NACIMIENTO}
        </p>
      )}
    </>
  )
}
