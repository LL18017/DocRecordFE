// HU-16 (DRS-26) · criterios 2 y 3 · HU-17 (DRS-88) · HU-18 (DRS-89) criterio 4.
//
// Estas pruebas fijan las decisiones de `rangosVitales.ts`: qué es «fuera de
// rango», qué NO se evalúa nunca (el peso) y qué no se evalúa en menores (el IMC).
import { describe, expect, it } from 'vitest'
import type { SignosVitalesDto } from '@/services/signosVitales'
import {
  LIMITES_FISIOLOGICOS,
  RANGOS_CRITICOS,
  RANGOS_NORMALES,
  clasificarValor,
  esAvisoDePercentiles,
  nivelMasGrave,
  nivelesDeLaToma,
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
    clinica: null,
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

// DEF-02 · HU-16 criterio 3: dos niveles, ámbar (fuera de rango) y rojo
// (crítico, umbrales NEWS2 del Royal College of Physicians, 2017).
describe('clasificarValor · normal, fuera de rango y crítico (NEWS2)', () => {
  it('los umbrales críticos son los de NEWS2', () => {
    expect(RANGOS_CRITICOS).toEqual({
      saturacionPct: { min: 92, max: 100 },
      pulsoLpm: { min: 40, max: 130 },
      frecuenciaRespRpm: { min: 9, max: 24 },
      temperaturaC: { min: 35.1, max: 39.0 },
      presionSistolica: { min: 91, max: 219 },
      presionDiastolica: { min: 0, max: 119 },
    })
  })

  it('saturación: 97 normal, 94 fuera de rango, 92 aún fuera de rango, 91 crítico', () => {
    expect(clasificarValor('saturacionPct', 97)).toBe('normal')
    expect(clasificarValor('saturacionPct', 94)).toBe('fuera-de-rango')
    expect(clasificarValor('saturacionPct', 92)).toBe('fuera-de-rango')
    expect(clasificarValor('saturacionPct', 91)).toBe('critico')
    expect(clasificarValor('saturacionPct', 88)).toBe('critico')
  })

  it('pulso: 110 fuera de rango, 131 y 39 críticos', () => {
    expect(clasificarValor('pulsoLpm', 72)).toBe('normal')
    expect(clasificarValor('pulsoLpm', 110)).toBe('fuera-de-rango')
    expect(clasificarValor('pulsoLpm', 130)).toBe('fuera-de-rango')
    expect(clasificarValor('pulsoLpm', 131)).toBe('critico')
    expect(clasificarValor('pulsoLpm', 39)).toBe('critico')
  })

  it('frecuencia respiratoria: 22 fuera de rango, 25 y 8 críticos', () => {
    expect(clasificarValor('frecuenciaRespRpm', 22)).toBe('fuera-de-rango')
    expect(clasificarValor('frecuenciaRespRpm', 24)).toBe('fuera-de-rango')
    expect(clasificarValor('frecuenciaRespRpm', 25)).toBe('critico')
    expect(clasificarValor('frecuenciaRespRpm', 8)).toBe('critico')
  })

  it('temperatura: 38.5 fuera de rango, 39.1 y 35.0 críticos', () => {
    expect(clasificarValor('temperaturaC', 38.5)).toBe('fuera-de-rango')
    expect(clasificarValor('temperaturaC', 39.0)).toBe('fuera-de-rango')
    expect(clasificarValor('temperaturaC', 39.1)).toBe('critico')
    expect(clasificarValor('temperaturaC', 35.1)).toBe('fuera-de-rango')
    expect(clasificarValor('temperaturaC', 35.0)).toBe('critico')
  })

  it('presión: 150 fuera de rango, 220 y 90 de sistólica críticos; 120 de diastólica crítica', () => {
    expect(clasificarValor('presionSistolica', 120)).toBe('normal')
    expect(clasificarValor('presionSistolica', 150)).toBe('fuera-de-rango')
    expect(clasificarValor('presionSistolica', 220)).toBe('critico')
    // 90 es el borde del rango normal, pero NEWS2 ya lo puntúa como crítico: manda lo crítico.
    expect(clasificarValor('presionSistolica', 90)).toBe('critico')
    expect(clasificarValor('presionDiastolica', 95)).toBe('fuera-de-rango')
    expect(clasificarValor('presionDiastolica', 120)).toBe('critico')
  })

  it('sin valor es normal, y lo que no tiene umbral crítico nunca llega a crítico', () => {
    expect(clasificarValor('saturacionPct', null)).toBe('normal')
    expect(clasificarValor('saturacionPct', undefined)).toBe('normal')
    expect(clasificarValor('imc', 45)).toBe('fuera-de-rango')
    expect(clasificarValor('pesoKg', 399)).toBe('normal')
  })

  it('nivelMasGrave se queda con el peor', () => {
    expect(nivelMasGrave([])).toBe('normal')
    expect(nivelMasGrave(['normal', 'fuera-de-rango'])).toBe('fuera-de-rango')
    expect(nivelMasGrave(['fuera-de-rango', 'critico', 'normal'])).toBe('critico')
  })

  it('nivelesDeLaToma da el nivel de cada valor que no es normal', () => {
    const niveles = nivelesDeLaToma(toma({ saturacionPct: 88, pulsoLpm: 110 }))
    expect(niveles.get('saturacionPct')).toBe('critico')
    expect(niveles.get('pulsoLpm')).toBe('fuera-de-rango')
    expect(niveles.has('temperaturaC')).toBe(false)
  })
})
