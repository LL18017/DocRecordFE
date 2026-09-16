// HU-08, criterio 2 · buscar sin distinguir mayúsculas ni tildes.
import { describe, expect, it } from 'vitest'
import { sinTildes } from './texto'

describe('sinTildes', () => {
  it('quita las tildes de las vocales', () => {
    expect(sinTildes('Martínez')).toBe('martinez')
    expect(sinTildes('José Antonio Hernández Cruz')).toBe('jose antonio hernandez cruz')
  })

  it('también baja a minúsculas', () => {
    expect(sinTildes('LÓPEZ')).toBe('lopez')
  })

  it('trata la ñ como n, igual que unaccent en PostgreSQL', () => {
    // Si el cliente y el servidor no coincidieran aquí, la misma búsqueda
    // daría resultados distintos según quién la resolviera.
    expect(sinTildes('Muñoz')).toBe('munoz')
  })

  it('deja intacto lo que no lleva acento', () => {
    expect(sinTildes('Cruz')).toBe('cruz')
    expect(sinTildes('01234567-8')).toBe('01234567-8')
  })

  it('el texto ya normalizado no cambia al volver a normalizarlo', () => {
    expect(sinTildes(sinTildes('Ramírez Flores'))).toBe('ramirez flores')
  })

  it('el caso que motivó el arreglo: «Martinez» encuentra a «Martínez»', () => {
    const consulta = sinTildes('Martinez')
    const enLaBase = sinTildes('Ana Gabriela Martínez Rivas')

    expect(enLaBase.includes(consulta)).toBe(true)
  })

  it('y al revés: «Martínez» con tilde encuentra a quien está sin ella', () => {
    expect(sinTildes('Martinez Rivas').includes(sinTildes('Martínez'))).toBe(true)
  })
})
