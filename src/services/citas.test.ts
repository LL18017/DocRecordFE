import { describe, expect, it } from 'vitest'
import { admiteCambios, franjasDelDia, franjasOcupadas, type CitaDto } from './citas'

function cita(parcial: Partial<CitaDto>): CitaDto {
  return {
    citaId: 1,
    fechaHora: '2026-11-03T09:00:00',
    tipoCitaId: 1,
    tipoCita: 'Consulta',
    pacienteId: 40,
    paciente: 'Rosa Martínez',
    expediente: 'EXP-000040',
    medicoId: 3,
    medico: 'Ana Rivas',
    clinicaId: 5,
    clinica: 'Sede',
    estado: 'AGENDADA',
    motivoCancelacion: null,
    ...parcial,
  }
}

describe('citas · reglas que la agenda refleja', () => {
  it('la grilla es de 30 minutos', () => {
    const franjas = franjasDelDia(8, 10)
    expect(franjas).toEqual(['08:00', '08:30', '09:00', '09:30'])
  })

  it('HU-32 c1: una cancelada libera su franja; las de otro médico no cuentan', () => {
    const ocupadas = franjasOcupadas(
      [
        cita({ citaId: 1, fechaHora: '2026-11-03T09:00:00' }),
        cita({ citaId: 2, fechaHora: '2026-11-03T10:00:00', estado: 'CANCELADA' }),
        cita({ citaId: 3, fechaHora: '2026-11-03T11:00:00', medicoId: 99 }),
      ],
      3,
    )
    expect([...ocupadas]).toEqual(['09:00'])
  })

  it('HU-32 c3: al reprogramar, la cita no choca consigo misma', () => {
    expect(franjasOcupadas([cita({ citaId: 7 })], 3, 7).size).toBe(0)
  })

  it('HU-32 c2: con menos de 4 horas, o si no está agendada, ya no admite cambios', () => {
    const ahora = new Date('2026-11-03T06:00:00')
    expect(admiteCambios(cita({ fechaHora: '2026-11-03T09:00:00' }), ahora)).toBe(false)
    expect(admiteCambios(cita({ fechaHora: '2026-11-03T10:00:00' }), ahora)).toBe(true)
    expect(admiteCambios(cita({ fechaHora: '2026-11-03T12:00:00', estado: 'ATENDIDA' }), ahora)).toBe(false)
  })
})
