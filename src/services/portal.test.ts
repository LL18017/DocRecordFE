// Guardas del servicio del portal del paciente (HU-34): qué viaja al backend
// y, sobre todo, qué NO viaja —ningún id en las llamadas del paciente—.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  darAccesoAlPortal,
  descargarMiExpedientePdf,
  estadoDelAccesoAlPortal,
  obtenerMiExpediente,
  type AccesoAlPortalDto,
} from './portal'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

beforeEach(() => {
  apiFetch.mockReset()
})

describe('portal · lo que pide el paciente', () => {
  /**
   * Criterio 2 visto desde el cliente: el expediente se pide sin id. Si algún
   * día esta llamada llevara uno, el portal dependería de que el backend lo
   * ignore; así ni siquiera hay un número que cambiar.
   */
  it('pide su expediente sin ningún id', async () => {
    apiFetch.mockResolvedValue({})
    await obtenerMiExpediente()
    expect(apiFetch).toHaveBeenCalledWith('/mi/expediente')
  })

  it('baja el PDF como binario y lo guarda con el número de expediente', async () => {
    apiFetch.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    const crear = vi.fn(() => 'blob:expediente')
    Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    let descargado = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargado = this.download
    })

    await descargarMiExpedientePdf('P-000042')

    expect(apiFetch).toHaveBeenCalledWith('/mi/expediente/pdf', { formato: 'blob' })
    expect(crear).toHaveBeenCalled()
    expect(descargado).toBe('expediente-P-000042.pdf')
  })

  it('deja pasar el motivo del 403 cuando el servidor lo explica', async () => {
    apiFetch.mockRejectedValue(new ApiError(403, 'Su cuenta no está vinculada a un expediente de paciente'))
    await expect(obtenerMiExpediente()).rejects.toThrow('no está vinculada a un expediente')

    apiFetch.mockRejectedValue(new ApiError(403, 'Acceso denegado'))
    await expect(obtenerMiExpediente()).rejects.toThrow('no tiene acceso al portal')
  })
})

describe('portal · el acceso que da el personal', () => {
  it('manda el correo recortado, o nada para usar el de contacto', async () => {
    apiFetch.mockResolvedValue({})
    await darAccesoAlPortal(42, '  ana@correo.sv ')
    expect(apiFetch).toHaveBeenLastCalledWith('/pacientes/42/acceso-portal', {
      method: 'POST',
      body: { email: 'ana@correo.sv' },
    })

    await darAccesoAlPortal(42)
    expect(apiFetch).toHaveBeenLastCalledWith('/pacientes/42/acceso-portal', { method: 'POST', body: {} })
  })

  it('nombra cada estado del acceso', () => {
    const base: AccesoAlPortalDto = {
      pacienteId: 42,
      correoDeContacto: null,
      cuenta: null,
      invitacionEnviada: false,
      correoEnviado: false,
    }
    const cuenta = { userId: 7, email: 'a@c.sv', estado: 'ACTIVA' as const, conRolPaciente: true }
    expect(estadoDelAccesoAlPortal(base).texto).toBe('Sin acceso al portal')
    expect(estadoDelAccesoAlPortal({ ...base, cuenta }).texto).toBe('Con acceso al portal')
    expect(estadoDelAccesoAlPortal({ ...base, cuenta: { ...cuenta, estado: 'SIN_ACTIVAR' } }).texto).toBe(
      'Invitación enviada',
    )
    expect(estadoDelAccesoAlPortal({ ...base, cuenta: { ...cuenta, estado: 'DESACTIVADA' } }).texto).toBe(
      'Cuenta desactivada',
    )
    // Una cuenta del personal sin el rol todavía no entra al portal.
    expect(estadoDelAccesoAlPortal({ ...base, cuenta: { ...cuenta, conRolPaciente: false } }).texto).toBe(
      'Sin acceso al portal',
    )
  })
})
