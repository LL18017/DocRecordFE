// Guardas de las cifras del panel.
//
// El fallo que estas pruebas persiguen no es un cálculo mal hecho: es que NO
// HABÍA cálculo. El panel llevaba «48 pacientes activos / 12 consultas hoy /
// 7 prescripciones hoy / 3 clínicas» escritos a mano en el JSX mientras la
// realidad era 6 / 2 / 1 / 1. Aquí se fija que cada número sale de la lista
// que devolvió el API y de ninguna otra parte.
//
// El «hoy» entra siempre por parámetro: una prueba que dependa del reloj del
// proceso no puede fijar nada.

import { describe, expect, it } from 'vitest'
import type { ConsultaDto } from '@/services/consultas'
import {
  DIAS_DE_LA_GRAFICA,
  contarConsultasDeHoy,
  contarConsultasPorPaciente,
  serieDePacientesAtendidos,
} from './resumenPanel'

const HOY = new Date(2026, 7, 23) // 23 de agosto de 2026, hora local.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Instante local del día `hoy` desplazado `atras` días, a la hora indicada. */
function instante(atras: number, hora: string): string {
  const d = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - atras)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`
}

function consulta(cambios: Partial<ConsultaDto> & { pacienteId?: number } = {}): ConsultaDto {
  const { pacienteId = 42, ...resto } = cambios
  return {
    consultaId: 1,
    fecha: instante(0, '10:00:00'),
    motivo: 'Dolor de garganta',
    diagnostico: null,
    estado: 'FINALIZADA',
    paciente: { personaId: pacienteId, expediente: 'EXP-1', nombres: 'Ana', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: null },
    clinica: null,
    ...resto,
  }
}

describe('contarConsultasDeHoy', () => {
  it('cuenta las de hoy y ninguna más', () => {
    const consultas = [
      consulta({ consultaId: 1, fecha: instante(0, '08:00:00') }),
      consulta({ consultaId: 2, fecha: instante(0, '16:45:00') }),
      consulta({ consultaId: 3, fecha: instante(1, '09:00:00') }),
      consulta({ consultaId: 4, fecha: instante(9, '09:00:00') }),
    ]

    expect(contarConsultasDeHoy(consultas, HOY)).toBe(2)
  })

  it('devuelve 0 cuando hoy no se atendió a nadie, sin inventar un número', () => {
    expect(contarConsultasDeHoy([consulta({ fecha: instante(3, '10:00:00') })], HOY)).toBe(0)
    expect(contarConsultasDeHoy([], HOY)).toBe(0)
  })

  it('no pierde ni gana un día por el desfase de zona horaria', () => {
    // Las dos consultas son de HOY en horario local: una recién pasada la
    // medianoche y otra a última hora. Una implementación que normalice a UTC
    // —el clásico `toISOString().slice(0, 10)`— empuja una de las dos al día
    // vecino en cualquier zona con desfase, y el conteo baja a 1. Es el mismo
    // desfase que ya hizo retroceder un día las fechas de nacimiento.
    const consultas = [
      consulta({ consultaId: 1, fecha: instante(0, '00:30:00') }),
      consulta({ consultaId: 2, fecha: instante(0, '23:30:00') }),
    ]

    expect(contarConsultasDeHoy(consultas, HOY)).toBe(2)
  })

  it('ignora una fecha que no se puede interpretar en vez de contarla', () => {
    const consultas = [
      consulta({ consultaId: 1, fecha: 'no-es-una-fecha' }),
      consulta({ consultaId: 2, fecha: instante(0, '10:00:00') }),
    ]

    expect(contarConsultasDeHoy(consultas, HOY)).toBe(1)
  })
})

describe('serieDePacientesAtendidos', () => {
  it('cubre exactamente la ventana anunciada y termina en hoy', () => {
    const serie = serieDePacientesAtendidos([], HOY)

    expect(serie).toHaveLength(DIAS_DE_LA_GRAFICA)
    expect(serie[serie.length - 1].day).toBe(
      HOY.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' }),
    )
    const primero = new Date(
      HOY.getFullYear(),
      HOY.getMonth(),
      HOY.getDate() - (DIAS_DE_LA_GRAFICA - 1),
    )
    expect(serie[0].day).toBe(
      primero.toLocaleDateString('es-SV', { day: '2-digit', month: 'short' }),
    )
  })

  it('un día sin consultas vale 0 y sigue apareciendo, no se salta', () => {
    // Sin la comprobación de largo esta prueba sería vacía: `every` sobre un
    // arreglo vacío devuelve true, así que una implementación que omitiera los
    // días sin actividad pasaría igual y la curva mentiría por omisión.
    const serie = serieDePacientesAtendidos([], HOY)

    expect(serie).toHaveLength(DIAS_DE_LA_GRAFICA)
    expect(serie.every((p) => p.pacientes === 0)).toBe(true)
  })

  it('cuenta personas distintas, no consultas', () => {
    // Tres consultas el mismo día pero de dos personas: son DOS pacientes
    // atendidos. Contar consultas daría 3 y la curva exageraría el trabajo del
    // día, que es exactamente el tipo de número que nadie puede verificar.
    const consultas = [
      consulta({ consultaId: 1, pacienteId: 1, fecha: instante(0, '08:00:00') }),
      consulta({ consultaId: 2, pacienteId: 1, fecha: instante(0, '11:00:00') }),
      consulta({ consultaId: 3, pacienteId: 2, fecha: instante(0, '12:00:00') }),
    ]

    const serie = serieDePacientesAtendidos(consultas, HOY)

    expect(serie[serie.length - 1].pacientes).toBe(2)
  })

  it('coloca cada consulta en su día y deja los demás en cero', () => {
    const consultas = [
      consulta({ consultaId: 1, pacienteId: 1, fecha: instante(0, '08:00:00') }),
      consulta({ consultaId: 2, pacienteId: 2, fecha: instante(4, '08:00:00') }),
    ]

    const serie = serieDePacientesAtendidos(consultas, HOY)

    expect(serie[serie.length - 1].pacientes).toBe(1)
    expect(serie[serie.length - 5].pacientes).toBe(1)
    expect(serie.reduce((total, p) => total + p.pacientes, 0)).toBe(2)
  })

  it('deja fuera lo anterior a la ventana en vez de amontonarlo en el primer día', () => {
    const consultas = [
      consulta({ consultaId: 1, pacienteId: 1, fecha: instante(DIAS_DE_LA_GRAFICA, '08:00:00') }),
      consulta({
        consultaId: 2,
        pacienteId: 2,
        fecha: instante(DIAS_DE_LA_GRAFICA + 90, '08:00:00'),
      }),
    ]

    const serie = serieDePacientesAtendidos(consultas, HOY)

    expect(serie.reduce((total, p) => total + p.pacientes, 0)).toBe(0)
  })
})

describe('contarConsultasPorPaciente', () => {
  it('cuenta las consultas de cada persona por separado', () => {
    const conteo = contarConsultasPorPaciente([
      consulta({ consultaId: 1, pacienteId: 7 }),
      consulta({ consultaId: 2, pacienteId: 7 }),
      consulta({ consultaId: 3, pacienteId: 9 }),
    ])

    expect(conteo.get(7)).toBe(2)
    expect(conteo.get(9)).toBe(1)
  })

  it('indexa por persona y no por consulta, sin claves de más', () => {
    // Tres consultas de DOS personas. Si la clave fuera `consultaId` —el
    // despiste natural— el mapa tendría tres entradas y la tabla buscaría por
    // un id que no está, dejando a todo el mundo en «no se sabe».
    //
    // Que no aparezca ninguna clave extra es lo que permite a la lista
    // distinguir «cero consultas» de «no se sabe»: la ausencia significa cero.
    const conteo = contarConsultasPorPaciente([
      consulta({ consultaId: 1, pacienteId: 7 }),
      consulta({ consultaId: 2, pacienteId: 7 }),
      consulta({ consultaId: 3, pacienteId: 9 }),
    ])

    expect(conteo.size).toBe(2)
    expect([...conteo.keys()].sort((a, b) => a - b)).toEqual([7, 9])
    expect(conteo.get(999)).toBeUndefined()
  })
})
