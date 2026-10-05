// El mapa público no manda token (HU-28).
//
// Se prueba con `fetch` simulado y el `apiFetch` real, porque lo que importa es
// la cabecera que de verdad sale: un token vencido de otra visita no debe
// viajar a un endpoint público ni disparar la renovación de sesión.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearTokens, setTokens } from '@/lib/api'
import { listarClinicasDeLaRed } from './mapaDeClinicas'

const fetchSimulado = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchSimulado.mockReset()
  fetchSimulado.mockResolvedValue(new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetchSimulado)
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearTokens()
})

describe('listarClinicasDeLaRed', () => {
  it('pide GET /clinics/publicas sin cabecera Authorization aunque haya sesión', async () => {
    setTokens('token-de-otra-visita', 'refresh-viejo')

    await listarClinicasDeLaRed()

    expect(fetchSimulado).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSimulado.mock.calls[0]
    expect(String(url)).toMatch(/\/clinics\/publicas$/)
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })

  it('un 401 no intenta renovar la sesión: no hay sesión que renovar', async () => {
    setTokens('token-de-otra-visita', 'refresh-viejo')
    fetchSimulado.mockResolvedValue(new Response('{"message":"x"}', { status: 401 }))

    await expect(listarClinicasDeLaRed()).rejects.toMatchObject({ status: 401 })
    // Una sola llamada: ni /auth/refresh ni reintento.
    expect(fetchSimulado).toHaveBeenCalledTimes(1)
  })
})
