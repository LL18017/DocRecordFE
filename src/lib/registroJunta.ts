// Formato del número de junta de vigilancia (HU-02 criterio 1).

/**
 * Formato básico del número de junta, el mismo que valida el backend: de 3 a
 * 20 letras, números o guiones, con al menos un número. Es deliberadamente
 * laxo —conviven «JVPM-1234», «12345» y «JVPM-ENF-4471»—: rechazar uno
 * legítimo es peor que dejar pasar uno raro.
 */
export function formatoDeJuntaValido(valor: string): boolean {
  return /^(?=.*\d)[A-Za-z0-9-]{3,20}$/.test(valor.trim())
}
