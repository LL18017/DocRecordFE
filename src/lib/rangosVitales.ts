// ─── Rangos de los signos vitales: UN solo lugar ───────────────────────────
// Todo lo que decide «esto está fuera de rango» en la interfaz sale de aquí: el
// aviso del formulario de toma, el ámbar/rojo de la tarjeta «Últimos Signos
// Vitales», el del detalle de la toma y la marca de la gráfica de evolución. Si cada
// pantalla llevara su propia copia de los números, bastaría con que una se
// quedara atrás para que la ficha y la gráfica discreparan sobre el mismo valor.
//
// El backend NO usa los rangos normales: solo rechaza lo fisiológicamente
// imposible (ver `LIMITES_FISIOLOGICOS`) y no clasifica ninguna toma como
// «anormal», así que no hay una segunda copia que mantener allá.
//
// Hay DOS rangos por medida y no deben confundirse:
//
//   · LÍMITES FISIOLÓGICOS: lo que un ser humano puede tener. Fuera de ellos el
//     dato es un error de captura (la coma corrida de sitio, un dedo que
//     resbala) y el servidor lo RECHAZA con 400. El formulario los usa para no
//     dejar enviar.
//   · RANGOS NORMALES: lo esperable en un adulto sano. Fuera de ellos el dato
//     puede ser perfectamente real —un paciente SÍ puede llegar con 40 °C— y
//     por eso solo se ADVIERTE; nunca se bloquea el guardado (HU-16, criterio 2).
//
// Y, dentro de lo que sale del rango normal, un segundo escalón: los UMBRALES
// CRÍTICOS de NEWS2 (`RANGOS_CRITICOS`). Fuera del normal se pinta en ámbar;
// pasado el crítico, en rojo (HU-16, criterio 3). Tampoco bloquea.
//
// Los rangos normales son valores de REFERENCIA PARA ADULTOS. En menores el
// pulso, la frecuencia respiratoria y la presión normales son distintos y
// cambian con la edad; esta interfaz no los evalúa por edad.
import type { SignosVitalesDto } from '@/services/signosVitales'

/** Las medidas que el formulario captura y el servidor guarda. */
export type ClaveDeMedida =
  | 'pesoKg'
  | 'estaturaCm'
  | 'temperaturaC'
  | 'presionSistolica'
  | 'presionDiastolica'
  | 'pulsoLpm'
  | 'frecuenciaRespRpm'
  | 'saturacionPct'

/** Lo evaluable contra un rango normal: las medidas, más el IMC (derivado). */
export type ClaveDeRango = ClaveDeMedida | 'imc'

interface Intervalo {
  min: number
  max: number
}

/**
 * Espejo de los CHECK de la migración V9/V17 y de las validaciones de
 * `SignosVitalesRequestDto`. Quien manda es el servidor; repetirlos aquí solo
 * evita un viaje de ida y vuelta para decirle a la enfermera lo que se puede
 * saber en la propia pantalla.
 *
 * Peso 0.5–400 kg y talla 30–250 cm son los 0.5–400 kg y 0.3–2.5 m de HU-17
 * (criterio 3), con la talla en centímetros, que es la unidad de la columna.
 */
export const LIMITES_FISIOLOGICOS: Record<ClaveDeMedida, Intervalo> = {
  pesoKg: { min: 0.5, max: 400 },
  estaturaCm: { min: 30, max: 250 },
  temperaturaC: { min: 25, max: 45 },
  presionSistolica: { min: 40, max: 300 },
  presionDiastolica: { min: 20, max: 200 },
  pulsoLpm: { min: 20, max: 300 },
  frecuenciaRespRpm: { min: 4, max: 90 },
  saturacionPct: { min: 50, max: 100 },
}

/**
 * Rangos normales de referencia para adultos. Fuente de cada uno:
 *
 *   · Presión 90–139 / 60–89 mmHg: por debajo de 90 de sistólica se habla de
 *     hipotensión, y desde 140/90 de hipertensión (OMS e International Society
 *     of Hypertension, guía 2020; ESC/ESH 2018). Se usa el umbral de 140/90 y no
 *     el de 130/80 de la guía ACC/AHA 2017 para que una lectura de 120/80, la
 *     que se toma como ejemplo en cualquier consultorio, no salga marcada.
 *   · Pulso 60–100 lpm: frecuencia cardíaca en reposo del adulto (AHA).
 *   · Frecuencia respiratoria 12–20 rpm: adulto en reposo (valores de
 *     referencia de los textos de semiología; Harrison, Principios de Medicina
 *     Interna).
 *   · Temperatura 36.0–37.5 °C: por encima se considera febrícula o fiebre
 *     (fiebre desde 38 °C), por debajo hipotermia leve (Harrison).
 *   · Saturación de O₂ 95–100 %: por debajo de 95 % se considera hipoxemia
 *     (OMS; British Thoracic Society, objetivo 94–98 %).
 *   · IMC 18.5–24.9 kg/m²: «Normal» en la clasificación de la OMS. Solo vale
 *     para adultos: en menores de 18 años NO se evalúa (ver `imcFueraDeRango`).
 *
 * Peso y talla NO tienen rango normal, a propósito: no existe un peso normal
 * sin saber la talla, ni una talla «anormal» sin la edad. Un peso se evalúa
 * por el IMC (HU-18, criterio 4), nunca en kilos sueltos.
 */
export const RANGOS_NORMALES: Partial<Record<ClaveDeRango, Intervalo>> = {
  presionSistolica: { min: 90, max: 139 },
  presionDiastolica: { min: 60, max: 89 },
  pulsoLpm: { min: 60, max: 100 },
  frecuenciaRespRpm: { min: 12, max: 20 },
  temperaturaC: { min: 36.0, max: 37.5 },
  saturacionPct: { min: 95, max: 100 },
  imc: { min: 18.5, max: 24.9 },
}

/**
 * Umbrales CRÍTICOS: fuera de estos intervalos el valor no solo es anormal,
 * sino que pide atención inmediata. Son los puntos de corte que puntúan 3 en la
 * escala NEWS2 (Royal College of Physicians, *National Early Warning Score 2*,
 * 2017):
 *
 *   · Saturación de O₂ ≤ 91 %.
 *   · Pulso < 40 o > 130 lpm.
 *   · Frecuencia respiratoria ≤ 8 o ≥ 25 rpm.
 *   · Temperatura ≤ 35.0 °C; por arriba se usa > 39.0 °C (NEWS2 da 2 puntos
 *     desde 39.1 °C, el máximo que asigna a la fiebre).
 *   · Presión sistólica ≤ 90 o ≥ 220 mmHg.
 *   · Presión diastólica ≥ 120 mmHg: NEWS2 no puntúa la diastólica; 120 es el
 *     umbral de la crisis hipertensiva (ACC/AHA 2017) y se añade para que una
 *     toma de 180/125 no quede solo en ámbar.
 *
 * Los extremos de cada intervalo están DENTRO (no son críticos). El intervalo
 * crítico va siempre por fuera del normal salvo en un caso: la sistólica de 90
 * es «normal» para `RANGOS_NORMALES` (90–139) pero crítica para NEWS2 (≤ 90).
 * Ahí manda lo crítico: `clasificarValor` lo evalúa primero.
 *
 * El IMC, el peso y la talla no tienen umbral crítico: no son signos de alarma
 * aguda.
 */
export const RANGOS_CRITICOS: Partial<Record<ClaveDeRango, Intervalo>> = {
  saturacionPct: { min: 92, max: 100 },
  pulsoLpm: { min: 40, max: 130 },
  frecuenciaRespRpm: { min: 9, max: 24 },
  temperaturaC: { min: 35.1, max: 39.0 },
  presionSistolica: { min: 91, max: 219 },
  presionDiastolica: { min: 0, max: 119 },
}

/**
 * Los tres niveles con que se presenta un valor:
 *
 *   · `normal`: dentro del rango normal (o sin rango, o sin valor).
 *   · `fuera-de-rango`: fuera del rango normal, sin llegar a crítico. Ámbar.
 *   · `critico`: fuera del umbral crítico NEWS2. Rojo.
 */
export type NivelDeValor = 'normal' | 'fuera-de-rango' | 'critico'

const GRAVEDAD: Record<NivelDeValor, number> = { normal: 0, 'fuera-de-rango': 1, critico: 2 }

/** Clasifica un valor. Una medida ausente es `normal`: no hay nada que marcar. */
export function clasificarValor(
  clave: ClaveDeRango,
  valor: number | null | undefined,
): NivelDeValor {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return 'normal'
  const critico = RANGOS_CRITICOS[clave]
  if (critico && (valor < critico.min || valor > critico.max)) return 'critico'
  return fueraDeRangoNormal(clave, valor) ? 'fuera-de-rango' : 'normal'
}

/** El más grave de varios niveles (`normal` si no hay ninguno). */
export function nivelMasGrave(niveles: Iterable<NivelDeValor>): NivelDeValor {
  let peor: NivelDeValor = 'normal'
  for (const n of niveles) if (GRAVEDAD[n] > GRAVEDAD[peor]) peor = n
  return peor
}

/** Texto accesible de cada nivel: el color nunca va solo. */
export const TEXTO_DEL_NIVEL: Record<Exclude<NivelDeValor, 'normal'>, string> = {
  critico: 'Valor crítico',
  'fuera-de-rango': 'Fuera de rango',
}

/** Unidad con que se escribe el rango («90–139 mmHg»). */
const UNIDADES: Record<ClaveDeRango, string> = {
  pesoKg: 'kg',
  estaturaCm: 'cm',
  temperaturaC: '°C',
  presionSistolica: 'mmHg',
  presionDiastolica: 'mmHg',
  pulsoLpm: 'lpm',
  frecuenciaRespRpm: 'rpm',
  saturacionPct: '%',
  imc: 'kg/m²',
}

/** El rango normal escrito para una persona, o `null` si la medida no tiene. */
export function rangoNormalComoTexto(clave: ClaveDeRango): string | null {
  const rango = RANGOS_NORMALES[clave]
  return rango ? `${rango.min}–${rango.max} ${UNIDADES[clave]}` : null
}

/**
 * ¿Este valor sale del rango normal?
 *
 * `false` cuando no hay valor (una medida que no se tomó no está «fuera de
 * rango», está ausente) y cuando la medida no tiene rango normal.
 */
export function fueraDeRangoNormal(
  clave: ClaveDeRango,
  valor: number | null | undefined,
): boolean {
  const rango = RANGOS_NORMALES[clave]
  if (!rango || valor === null || valor === undefined || Number.isNaN(valor)) return false
  return valor < rango.min || valor > rango.max
}

/**
 * ¿La clasificación del IMC es el aviso de «no aplica en menores»?
 *
 * El backend no marca la edad aparte: en un menor de 18 años (o sin fecha de
 * nacimiento) devuelve en `clasificacionImc` el aviso de que la tabla de
 * adultos no aplica y de que debe interpretarse por percentiles. Ese texto
 * siempre nombra los percentiles, y es lo que se busca.
 */
export function esAvisoDePercentiles(clasificacion: string | null | undefined): boolean {
  return !!clasificacion && clasificacion.toLowerCase().includes('percentiles')
}

/**
 * ¿El IMC de esta toma sale del rango de la OMS?
 *
 * Solo si se puede clasificar como adulto. En un menor de 18 años el 18.5–24.9
 * no significa nada —un niño de 8 años con IMC 16 está sano—, así que ahí no se
 * marca nada: lo que corresponde es leerlo por percentiles. Es la misma razón
 * por la que el backend no le pone «Bajo peso» a un niño.
 */
export function imcFueraDeRango(
  toma: Pick<SignosVitalesDto, 'imc' | 'clasificacionImc'>,
): boolean {
  if (toma.imc === null || esAvisoDePercentiles(toma.clasificacionImc)) return false
  return fueraDeRangoNormal('imc', toma.imc)
}

/**
 * El nivel de cada valor de la toma que NO es normal.
 *
 * El peso no aparece nunca: se juzga por el IMC (ver `RANGOS_NORMALES`), que
 * solo llega a `fuera-de-rango` (no tiene umbral crítico). La tensión arterial
 * trae sus dos cifras por separado; quien la pinte en una sola celda debe
 * quedarse con la más grave (`nivelMasGrave`).
 */
export function nivelesDeLaToma(toma: SignosVitalesDto): Map<ClaveDeRango, NivelDeValor> {
  const niveles = new Map<ClaveDeRango, NivelDeValor>()
  const medidas: ClaveDeMedida[] = [
    'presionSistolica',
    'presionDiastolica',
    'pulsoLpm',
    'temperaturaC',
    'saturacionPct',
    'frecuenciaRespRpm',
  ]
  for (const clave of medidas) {
    const nivel = clasificarValor(clave, toma[clave])
    if (nivel !== 'normal') niveles.set(clave, nivel)
  }
  if (imcFueraDeRango(toma)) niveles.set('imc', 'fuera-de-rango')
  return niveles
}

/**
 * Qué valores de la toma no son normales (fuera de rango o críticos).
 *
 * El peso no aparece nunca: se juzga por el IMC (ver `RANGOS_NORMALES`). La
 * tensión arterial se considera fuera de rango si cualquiera de sus dos cifras
 * lo está, así que el llamador puede preguntar por `presionSistolica` y
 * `presionDiastolica` por separado o por las dos juntas.
 */
export function valoresFueraDeRango(toma: SignosVitalesDto): Set<ClaveDeRango> {
  return new Set(nivelesDeLaToma(toma).keys())
}
