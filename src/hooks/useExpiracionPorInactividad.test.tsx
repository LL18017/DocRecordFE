// HU-06 (DRS-79), criterios 2 y 3 · expiración por inactividad.
//
// Se usan temporizadores falsos y se avanza el reloj: esperar veinte minutos de
// verdad no es una prueba, es una tarde.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  ANTELACION_DEL_AVISO_MS,
  INACTIVIDAD_MS,
  useExpiracionPorInactividad,
} from './useExpiracionPorInactividad'

describe('Expiración por inactividad', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Avanza el reloj Y los temporizadores: el hook compara marcas de tiempo. */
  function avanzar(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('los plazos son los que pide la historia: 20 minutos y aviso a los 2', () => {
    expect(INACTIVIDAD_MS).toBe(20 * 60 * 1000)
    expect(ANTELACION_DEL_AVISO_MS).toBe(2 * 60 * 1000)
  })

  // ── Criterio 2 · a los 20 minutos se cierra ───────────────────────────────

  it('cierra la sesión tras 20 minutos sin actividad', () => {
    const alExpirar = vi.fn()
    renderHook(() => useExpiracionPorInactividad({ activa: true, alExpirar }))

    avanzar(19 * 60 * 1000)
    expect(alExpirar).not.toHaveBeenCalled()

    avanzar(61 * 1000)
    expect(alExpirar).toHaveBeenCalledTimes(1)
  })

  it('no la cierra más de una vez', () => {
    // Sin la guarda, el intervalo seguiría disparando cada diez segundos y
    // encadenaría redirecciones a /login.
    const alExpirar = vi.fn()
    renderHook(() => useExpiracionPorInactividad({ activa: true, alExpirar }))

    avanzar(INACTIVIDAD_MS + 60 * 1000)
    expect(alExpirar).toHaveBeenCalledTimes(1)
  })

  it('sin sesión el temporizador no corre', () => {
    const alExpirar = vi.fn()
    renderHook(() => useExpiracionPorInactividad({ activa: false, alExpirar }))

    avanzar(INACTIVIDAD_MS * 2)
    expect(alExpirar).not.toHaveBeenCalled()
  })

  // ── Criterio 3 · el aviso previo ─────────────────────────────────────────

  it('avisa 2 minutos antes de expirar', () => {
    const { result } = renderHook(() =>
      useExpiracionPorInactividad({ activa: true, alExpirar: vi.fn() }),
    )

    avanzar(17 * 60 * 1000)
    expect(result.current.avisando).toBe(false)

    avanzar(2 * 60 * 1000)
    expect(result.current.avisando).toBe(true)
    expect(result.current.segundosRestantes).toBeGreaterThan(0)
    expect(result.current.segundosRestantes).toBeLessThanOrEqual(120)
  })

  it('«Continuar» reinicia la cuenta sin volver a autenticarse', () => {
    // Esta es la razón de ser del aviso: sin él, un médico que está dictando un
    // diagnóstico tendría que teclear su contraseña delante del paciente.
    const alExpirar = vi.fn()
    const { result } = renderHook(() =>
      useExpiracionPorInactividad({ activa: true, alExpirar }),
    )

    avanzar(19 * 60 * 1000)
    expect(result.current.avisando).toBe(true)

    act(() => result.current.continuar())
    expect(result.current.avisando).toBe(false)

    // Y quedan otros 20 minutos completos por delante.
    avanzar(19 * 60 * 1000)
    expect(alExpirar).not.toHaveBeenCalled()

    avanzar(2 * 60 * 1000)
    expect(alExpirar).toHaveBeenCalledTimes(1)
  })

  // ── La actividad reinicia la cuenta ──────────────────────────────────────

  it('teclear reinicia el contador', () => {
    const alExpirar = vi.fn()
    renderHook(() => useExpiracionPorInactividad({ activa: true, alExpirar }))

    avanzar(15 * 60 * 1000)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })

    // Si el contador no se hubiera reiniciado, a los 15 + 10 = 25 minutos ya
    // habría expirado.
    avanzar(10 * 60 * 1000)
    expect(alExpirar).not.toHaveBeenCalled()
  })

  it('mover el ratón NO cuenta como actividad', () => {
    // Decisión deliberada, no un descuido. En un consultorio compartido, alguien
    // que pasa y roza el escritorio mantendría viva la sesión del médico
    // anterior indefinidamente — que es exactamente lo que la historia quiere
    // evitar.
    const alExpirar = vi.fn()
    renderHook(() => useExpiracionPorInactividad({ activa: true, alExpirar }))

    for (let minuto = 0; minuto < 25; minuto++) {
      avanzar(60 * 1000)
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove'))
      })
    }

    expect(alExpirar).toHaveBeenCalled()
  })

  it('mientras el aviso está visible, la actividad no lo cancela sola', () => {
    // El criterio 3 pide una decisión explícita. Si un desplazamiento
    // cualquiera cancelara el aviso, sería un parpadeo que nadie llega a leer.
    const { result } = renderHook(() =>
      useExpiracionPorInactividad({ activa: true, alExpirar: vi.fn() }),
    )

    avanzar(19 * 60 * 1000)
    expect(result.current.avisando).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })
    avanzar(10 * 1000)

    expect(result.current.avisando).toBe(true)
  })
})
