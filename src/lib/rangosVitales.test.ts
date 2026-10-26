// HU-16 (DRS-26) · criterios 2 y 3 · HU-17 (DRS-88) · HU-18 (DRS-89) criterio 4.
//
// Estas pruebas fijan las decisiones de `rangosVitales.ts`: qué es «fuera de
// rango», qué NO se evalúa nunca (el peso) y qué no se evalúa en menores (el IMC).
import { describe, expect, it } from 'vitest'
import type { SignosVitalesDto } from '@/services/signosVitales'
import {
  LIMITES_FISIOLOGICOS,
  RANGOS_NORMALES,
  esAvisoDePercentiles,
  fueraDeRangoNormal,
  imcFueraDeRango,
  rangoNormalComoTexto,
  valoresFueraDeRango,
} from './rangosVitales'

const PERCENTILES =
  'La clasificación de adultos no aplica en menores de 18 años; debe interpretarse por percentiles'

function toma(cambios: Partial<SignosVitalesDto> = {}): SignosVitalesDto {
  return {
    signosVitalesId: 1,
    tomadoEn: '2026-09-02T07:45:00',
    paciente: { personaId: 1, expediente: 'EXP-1', nombres: 'Ana', apellidos: 'Rivas' },
    enfermera: { personaId: 2, nombres: 'Marta', apellidos: 'Guevara' },
    consultaId: null,
    pesoKg: 70,
    estaturaCm: 175,
    temperaturaC: 36.8,
    presionSistolica: 120,
    presionDiastolica: 80,
    pulsoLpm: 72,
    frecuenciaRespRpm: 16,
    saturacionPct: 98,
    observaciones: null,
    imc: 22.9,
    clasificacionImc: 'Normal',
    estado: 'ACTIVA',
    motivoAnulacion: null,
    anuladaEn: null,
    anuladaPor: null,
    ...cambios,
  }
}

describe('límites fisiológicos', () => {
  it('peso y talla son los de HU-17: 0.5–400 kg y 0.3–2.5 m (30–250 cm)', () => {
    expect(LIMITES_FISIOLOGICOS.pesoKg).toEqual({ min: 0.5, max: 400 })
    expect(LIMITES_FISIOLOGICOS.estaturaCm).toEqual({ min: 30, max: 250 })
  })
})

describe('fueraDeRangoNormal', () => {
  it('una toma normal no marca nada', () => {
    expect(valoresFueraDeRango(toma()).size).toBe(0)
  })

  it('los extremos del rango normal están DENTRO', () => {
    expect(fueraDeRangoNormal('pulsoLpm', 60)).toBe(false)
    expect(fueraDeRangoNormal('pulsoLpm', 100)).toBe(false)
    expect(fueraDeRangoNormal('pulsoLpm', 59)).toBe(true)
    expect(fueraDeRangoNormal('pulsoLpm', 101)).toBe(true)
  })

  it('120/80, la lectura de ejemplo de cualquier consultorio, no sale marcada', () => {
    expect(fueraDeRangoNormal('presionSistolica', 120)).toBe(false)
    expect(fueraDeRangoNormal('presionDiastolica', 80)).toBe(false)
  })

  it('40 °C y 88 % de saturación sí', () => {
    // Valores reales que HU-16 quiere poder guardar: se marcan, no se rechazan.
    expect(fueraDeRangoNormal('temperaturaC', 40)).toBe(true)
    expect(fueraDeRangoNormal('saturacionPct', 88)).toBe(true)
  })

  it('una medida ausente no está fuera de rango: está ausente', () => {
    expect(fueraDeRangoNormal('pulsoLpm', null)).toBe(false)
    expect(fueraDeRangoNormal('pulsoLpm', undefined)).toBe(false)
  })

  it('el peso y la talla NO tienen rango normal y nunca se marcan', () => {
    expect(RANGOS_NORMALES.pesoKg).toBeUndefined()
    expect(RANGOS_NORMALES.estaturaCm).toBeUndefined()
    expect(fueraDeRangoNormal('pesoKg', 400)).toBe(false)
    expect(fueraDeRangoNormal('pesoKg', 0.5)).toBe(false)
    expect(valoresFueraDeRango(toma({ pesoKg: 399, estaturaCm: 250 })).has('pesoKg')).toBe(false)
  })

  it('escribe el rango con su unidad', () => {
    expect(rangoNormalComoTexto('presionSistolica')).toBe('90–139 mmHg')
    expect(rangoNormalComoTexto('imc')).toBe('18.5–24.9 kg/m²')
    expect(rangoNormalComoTexto('pesoKg')).toBeNull()
  })
})

describe('valoresFueraDeRango', () => {
  it('lista solo lo que se sale', () => {
    const fuera = valoresFueraDeRango(
      toma({ temperaturaC: 40, presionSistolica: 150, saturacionPct: 88 }),
    )
    expect([...fuera].sort()).toEqual(['presionSistolica', 'saturacionPct', 'temperaturaC'])
  })
})

describe('IMC fuera de rango (criterio 4 de HU-18: el peso se juzga por el IMC)', () => {
  it('un adulto con sobrepeso queda marcado', () => {
    expect(imcFueraDeRango({ imc: 27.8, clasificacionImc: 'Sobrepeso' })).toBe(true)
    expect(valoresFueraDeRango(toma({ imc: 27.8, clasificacionImc: 'Sobrepeso' })).has('imc')).toBe(
      true,
    )
  })

  it('un adulto con bajo peso queda marcado', () => {
    expect(imcFueraDeRango({ imc: 17.3, clasificacionImc: 'Bajo peso' })).toBe(true)
  })

  it('un IMC normal no', () => {
    expect(imcFueraDeRango({ imc: 22.9, clasificacionImc: 'Normal' })).toBe(false)
  })

  it('en un menor de 18 años NO se marca, aunque el número caiga fuera del 18.5–24.9', () => {
    // Un niño de 8 años con IMC 16 está sano; marcarlo sería el mismo error
    // clínico que HU-17 criterio 2 evita en el backend.
    expect(imcFueraDeRango({ imc: 16, clasificacionImc: PERCENTILES })).toBe(false)
  })

  it('sin IMC no hay nada que marcar', () => {
    expect(imcFueraDeRango({ imc: null, clasificacionImc: null })).toBe(false)
  })

  it('reconoce el aviso de percentiles que manda el servidor', () => {
    expect(esAvisoDePercentiles(PERCENTILES)).toBe(true)
    expect(esAvisoDePercentiles('Normal')).toBe(false)
    expect(esAvisoDePercentiles(null)).toBe(false)
  })
})
