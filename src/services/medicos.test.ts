// Guardas del servicio de fichas de médico (HU-02): lo que viaja y cómo se
// nombra el estado del acceso.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearMedico, darAcceso, estadoDeAcceso, type MedicoDto } from './medicos'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

const FICHA: MedicoDto = {
  personaId: 42,
  nombres: 'Lucía',
  apellidos: 'Mejía',
  telefono: null,
  especialidadId: 1,
  especialidad: 'Medicina General',
  registroJunta: 'JVPM-4471',
  activo: true,
  cuenta: null,
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(FICHA)
})

describe('medicos · lo que viaja al backend', () => {
  it('la ficha viaja recortada y sin teléfono cuando viene vacío', async () => {
    await crearMedico({ nombres: ' Lucía ', apellidos: ' Mejía ', telefono: '  ', especialidadId: 1, registroJunta: ' jvpm-4471 ' })
    expect(apiFetch).toHaveBeenCalledWith('/medicos', {
      method: 'POST',
      body: { nombres: 'Lucía', apellidos: 'Mejía', especialidadId: 1, registroJunta: 'jvpm-4471' },
    })
  })

  it('el acceso solo manda el correo y la sede que vienen', async () => {
    await darAcceso(42, { email: ' lucia@docrecord.sv ', clinicaId: 11 })
    expect(apiFetch).toHaveBeenLastCalledWith('/medicos/42/acceso', {
      method: 'POST',
      body: { email: 'lucia@docrecord.sv', clinicaId: 11 },
    })

    await darAcceso(42, { email: '' })
    expect(apiFetch).toHaveBeenLastCalledWith('/medicos/42/acceso', { method: 'POST', body: {} })
  })
})

describe('medicos · estado del acceso', () => {
  const cuenta = { userId: 7, email: 'l@d.sv', estado: 'ACTIVA' as const, conRolMedico: true, sedes: [] }

  it('nombra cada estado', () => {
    expect(estadoDeAcceso(FICHA).texto).toBe('Sin acceso')
    expect(estadoDeAcceso({ ...FICHA, cuenta: { ...cuenta, estado: 'SIN_ACTIVAR' } }).texto).toBe('Invitación enviada')
    expect(estadoDeAcceso({ ...FICHA, cuenta }).texto).toBe('Con acceso')
    expect(estadoDeAcceso({ ...FICHA, cuenta: { ...cuenta, conRolMedico: false } }).texto).toBe('Sin rol Médico')
    expect(estadoDeAcceso({ ...FICHA, cuenta: { ...cuenta, estado: 'DESACTIVADA' } }).texto).toBe('Cuenta desactivada')
  })
})
