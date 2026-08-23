// ─── Cifras del panel ──────────────────────────────────────────────────────
// Todo lo que el dashboard muestra como número sale de aquí, y todo lo que
// sale de aquí se calcula a partir de lo que devolvió el API. Ni una constante
// escrita a mano.
//
// POR QUÉ ESTO VIVE FUERA DE LA PANTALLA: el panel llevaba «48 pacientes
// activos / 12 consultas hoy / 7 prescripciones hoy / 3 clínicas» escritos
// literalmente en el JSX, sin una sola llamada al backend; la realidad en ese
// momento era 6 / 2 / 1 / 1. Un número inventado es peor que un hueco porque
// se ve exactamente igual que uno verdadero: el usuario no tiene forma de
// saber cuál está leyendo. Sacar el cálculo a un módulo puro permite que una
// prueba lo fije contra datos concretos y se ponga roja si alguien vuelve a
// sembrar una cifra fija.
//
// El «hoy» siempre entra por parámetro y nunca se lee de `new Date()` aquí
// dentro: si no, ninguna de estas funciones sería comprobable sin congelar el
// reloj del proceso.

import { parsearFechaCivil } from '@/lib/pacienteAdapter'
import type { ConsultaDto } from '@/services/consultas'

/** Un punto de la gráfica de pacientes atendidos. */
export interface PuntoDeGrafica {
  /** Etiqueta del eje X, ya formateada («23 ago»). */
  day: string
  /** Personas DISTINTAS atendidas ese día. */
  pacientes: number
}

/** Cuántos días cubre la gráfica del panel. */
export const DIAS_DE_LA_GRAFICA = 30

/**
 * Clave de día civil en horario local (`2026-8-23`).
 *
 * No se usa `toISOString().slice(0, 10)`: eso convierte a UTC y en El Salvador
 * (UTC-6) una consulta de las 19:00 caería en el día siguiente. Es el mismo
 * desfase que ya hizo retroceder un día las fechas de nacimiento y que
 * `parsearFechaCivil` existe para evitar.
 */
function claveDeDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`
}

/**
 * Consultas registradas el mismo día civil que `hoy`.
 *
 * El backend no ofrece filtro por fecha (`GET /consultas` solo acepta
 * `pacienteId`), así que el recorte se hace aquí sobre la lista completa que
 * ya llegó. Eso es contar lo que el API devolvió, no estimarlo.
 *
 * Una consulta cuya `fecha` no se puede interpretar NO se cuenta: sumarla
 * «por si acaso» sería inventar, y descartarla solo puede hacer que el número
 * se quede corto de forma visible, nunca que afirme algo falso de más.
 */
export function contarConsultasDeHoy(consultas: ConsultaDto[], hoy: Date): number {
  const claveDeHoy = claveDeDia(hoy)
  return consultas.filter((c) => {
    const fecha = parsearFechaCivil(c.fecha)
    return fecha !== null && claveDeDia(fecha) === claveDeHoy
  }).length
}

/**
 * Serie diaria de personas distintas atendidas en los últimos `dias` días,
 * de la más antigua a la más reciente y con `hoy` como último punto.
 *
 * Se cuentan pacientes DISTINTOS y no consultas porque eso es lo que dice el
 * título de la tarjeta («Pacientes atendidos»): dos consultas del mismo
 * paciente en un día son una persona atendida, no dos.
 *
 * Los días sin actividad valen 0 y aparecen igual. Un hueco de treinta ceros
 * es una respuesta legítima —el sistema lleva pocas consultas— y es
 * exactamente lo que la curva inventada de la maqueta tapaba.
 */
export function serieDePacientesAtendidos(
  consultas: ConsultaDto[],
  hoy: Date,
  dias: number = DIAS_DE_LA_GRAFICA,
): PuntoDeGrafica[] {
  const atendidosPorDia = new Map<string, Set<number>>()

  for (const consulta of consultas) {
    const fecha = parsearFechaCivil(consulta.fecha)
    if (!fecha) continue
    const clave = claveDeDia(fecha)
    const yaAtendidos = atendidosPorDia.get(clave) ?? new Set<number>()
    yaAtendidos.add(consulta.paciente.personaId)
    atendidosPorDia.set(clave, yaAtendidos)
  }

  const puntos: PuntoDeGrafica[] = []
  for (let atras = dias - 1; atras >= 0; atras--) {
    // Aritmética sobre los componentes locales, no restando milisegundos: un
    // día no siempre dura 24 horas y el constructor de tres argumentos
    // normaliza el desbordamiento de mes hacia atrás sin pasar por UTC.
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras)
    puntos.push({
      day: dia.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' }),
      pacientes: atendidosPorDia.get(claveDeDia(dia))?.size ?? 0,
    })
  }
  return puntos
}

/**
 * Cuántas consultas tiene registrada cada persona, indexado por `personaId`.
 *
 * Existe para la columna «Consultas» de la lista de pacientes: `GET
 * /pacientes` no trae ese conteo y la columna estaba fija en 0, de modo que un
 * paciente con dos consultas seguía mostrando un cero que se lee como «este
 * paciente nunca ha venido» —una afirmación clínica falsa—. Con la lista
 * completa de consultas, que ya viene en una sola petición, el conteo es real
 * y no hace falta una petición por paciente.
 *
 * Un `personaId` ausente del mapa significa cero consultas de verdad, no
 * «no se sabe». La diferencia entre ambos casos la marca quien llama: si esta
 * función no llegó a ejecutarse porque `GET /consultas` falló, la columna debe
 * mostrar un hueco, nunca un cero.
 */
export function contarConsultasPorPaciente(consultas: ConsultaDto[]): Map<number, number> {
  const conteo = new Map<number, number>()
  for (const consulta of consultas) {
    const id = consulta.paciente.personaId
    conteo.set(id, (conteo.get(id) ?? 0) + 1)
  }
  return conteo
}
