import { describe, expect, it } from 'vitest'
import { formatoDeJuntaValido } from './registroJunta'

describe('formatoDeJuntaValido', () => {
  it('acepta los formatos que conviven en la Junta', () => {
    for (const valor of ['JVPM-1234', '12345', 'JVPM-ENF-4471', 'jvpm-77', '  JVPM-9  ']) {
      expect(formatoDeJuntaValido(valor), valor).toBe(true)
    }
  })

  it('rechaza lo vacío, lo corto, lo que no tiene números, lo largo y los símbolos', () => {
    for (const valor of ['', '   ', 'A1', 'SIN-NUMERO', 'JVPM-12345678901234567', 'JVPM 1234', 'JVPM#1234']) {
      expect(formatoDeJuntaValido(valor), valor).toBe(false)
    }
  })
})
