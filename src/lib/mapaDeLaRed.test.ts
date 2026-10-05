// Guardas de la lógica del mapa público (HU-28).
//
// Lo que puede salir mal aquí no se ve en una captura: una clínica sin
// coordenadas dibujada en (0, 0), un filtro que deja fuera «usulutan» porque
// alguien escribió «Usulután», o un globo que omite el teléfono y deja al
// paciente sin saber si existe. Cada prueba cubre uno de esos fallos.

import { describe, expect, it } from 'vitest'
import {
  DATO_NO_REGISTRADO,
  TODOS_LOS_DEPARTAMENTOS,
  claveDeDepartamento,
  clinicaPublicaDesdeDto,
  departamentosDeLaRed,
  estaUbicada,
  fichaDeClinica,
  filtrarPorDepartamento,
  separarPorUbicacion,
  type ClinicaPublica,
} from './mapaDeLaRed'

function clinica(cambios: Partial<ClinicaPublica> = {}): ClinicaPublica {
  return {
    id: 1,
    name: 'Clínica Regional de Santa Ana',
    lat: 13.9942,
    lng: -89.5597,
    departamento: 'Santa Ana',
    municipio: 'Santa Ana',
    direccion: 'Avenida Independencia Sur, Barrio Santa Bárbara',
    telefono: '2440-1234',
    horario: 'Lunes a viernes, 7:00 a 16:00',
    ...cambios,
  }
}

const SANTA_ANA = clinica()
const SAN_MIGUEL = clinica({ id: 2, name: 'Clínica Oriental', departamento: 'San Miguel', municipio: 'San Miguel', lat: 13.4833, lng: -88.1833 })
const USULUTAN = clinica({ id: 3, name: 'Clínica Usulután', departamento: 'Usulután', municipio: 'Jiquilisco', lat: 13.3167, lng: -88.5833 })
// Misma sede administrativa escrita por otra persona, sin tilde y en minúsculas.
const USULUTAN_SIN_TILDE = clinica({ id: 4, name: 'Clínica Santiago de María', departamento: ' usulutan ', municipio: 'Santiago de María', lat: 13.4861, lng: -88.4711 })
const SIN_GPS = clinica({ id: 5, name: 'Sucursal Nueva', departamento: 'San Miguel', lat: null, lng: null })

const RED = [SANTA_ANA, SAN_MIGUEL, USULUTAN, USULUTAN_SIN_TILDE, SIN_GPS]

describe('clinicaPublicaDesdeDto', () => {
  it('conserva las coordenadas nulas en vez de convertirlas en 0', () => {
    const adaptada = clinicaPublicaDesdeDto({
      clinicaId: 7,
      name: 'Sin GPS',
      latitud: null,
      longitud: null,
      departamento: 'La Libertad',
      municipio: null,
      direccion: null,
      telefono: null,
      horario: null,
    })
    expect(adaptada).toMatchObject({ id: 7, name: 'Sin GPS', lat: null, lng: null })
    expect(estaUbicada(adaptada)).toBe(false)
  })
})

describe('separarPorUbicacion · las clínicas sin coordenadas se listan aparte', () => {
  it('dibuja solo las que tienen las dos coordenadas', () => {
    const { ubicadas, sinUbicacion } = separarPorUbicacion(RED)
    expect(ubicadas.map((c) => c.id)).toEqual([1, 2, 3, 4])
    expect(sinUbicacion.map((c) => c.id)).toEqual([5])
  })

  it('una sola coordenada no ubica nada', () => {
    const aMedias = clinica({ id: 9, lng: null })
    expect(separarPorUbicacion([aMedias]).sinUbicacion).toEqual([aMedias])
  })

  it('no le inventa un punto a la que no tiene: sale tal cual, con sus nulos', () => {
    const { sinUbicacion } = separarPorUbicacion([SIN_GPS])
    expect(sinUbicacion[0].lat).toBeNull()
    expect(sinUbicacion[0].lng).toBeNull()
  })

  it('un número que no es finito tampoco cuenta como coordenada', () => {
    expect(estaUbicada(clinica({ lat: Number.NaN }))).toBe(false)
  })
})

describe('departamentos y filtro (criterio 3)', () => {
  it('las opciones salen de las clínicas, sin repetir el mismo departamento mal escrito', () => {
    const opciones = departamentosDeLaRed(RED)
    expect(opciones.map((o) => o.etiqueta)).toEqual(['San Miguel', 'Santa Ana', 'Usulután'])
    expect(opciones.find((o) => o.etiqueta === 'Usulután')?.clinicas).toBe(2)
    // La de San Miguel sin GPS cuenta: se puede elegir su departamento y
    // aparecerá en la lista de sin ubicación.
    expect(opciones.find((o) => o.etiqueta === 'San Miguel')?.clinicas).toBe(2)
  })

  it('no ofrece una opción para las clínicas que no dicen su departamento', () => {
    const sinDepto = clinica({ id: 10, departamento: null })
    expect(departamentosDeLaRed([sinDepto])).toEqual([])
  })

  it('filtrar deja solo las de ese departamento', () => {
    const valor = claveDeDepartamento('Santa Ana')
    expect(filtrarPorDepartamento(RED, valor).map((c) => c.id)).toEqual([1])
  })

  it('compara sin tildes, sin mayúsculas y sin espacios de sobra', () => {
    expect(filtrarPorDepartamento(RED, 'USULUTÁN').map((c) => c.id)).toEqual([3, 4])
    expect(filtrarPorDepartamento(RED, '  usulutan').map((c) => c.id)).toEqual([3, 4])
  })

  it('«Todos» devuelve la red entera, también las que no tienen departamento', () => {
    const sinDepto = clinica({ id: 10, departamento: null })
    expect(filtrarPorDepartamento([...RED, sinDepto], TODOS_LOS_DEPARTAMENTOS)).toHaveLength(6)
  })

  it('no modifica la lista original', () => {
    const copia = [...RED]
    filtrarPorDepartamento(RED, 'Santa Ana')
    expect(RED).toEqual(copia)
  })

  it('con 50 clínicas filtrar y separar es instantáneo (criterio 4)', () => {
    const cincuenta = Array.from({ length: 50 }, (_, i) =>
      clinica({ id: 100 + i, departamento: i % 2 ? 'Santa Ana' : 'San Miguel', lat: 13.5 + i / 100 }),
    )
    const inicio = performance.now()
    for (let i = 0; i < 100; i++) {
      separarPorUbicacion(filtrarPorDepartamento(cincuenta, 'Santa Ana'))
      departamentosDeLaRed(cincuenta)
    }
    // Cien vueltas completas muy por debajo de un fotograma por vuelta.
    expect(performance.now() - inicio).toBeLessThan(500)
    expect(filtrarPorDepartamento(cincuenta, 'Santa Ana')).toHaveLength(25)
  })
})

describe('fichaDeClinica · lo que dice el globo (criterio 2)', () => {
  it('trae nombre, dirección, teléfono y horario', () => {
    const ficha = fichaDeClinica(USULUTAN)
    expect(ficha.titulo).toBe('Clínica Usulután')
    expect(ficha.direccion).toBe('Avenida Independencia Sur, Barrio Santa Bárbara')
    expect(ficha.telefono).toBe('2440-1234')
    expect(ficha.horario).toBe('Lunes a viernes, 7:00 a 16:00')
    expect(ficha.lugar).toBe('Jiquilisco, Usulután')
  })

  it('el teléfono se puede marcar desde el celular', () => {
    expect(fichaDeClinica(SANTA_ANA).enlaceTelefono).toBe('tel:24401234')
    expect(fichaDeClinica(clinica({ telefono: '+503 2440 1234' })).enlaceTelefono).toBe('tel:+50324401234')
  })

  it('un dato que falta se dice, no se omite', () => {
    const vieja = clinica({ direccion: null, telefono: '   ', horario: null })
    const ficha = fichaDeClinica(vieja)
    expect(ficha.direccion).toBe(DATO_NO_REGISTRADO)
    expect(ficha.telefono).toBe(DATO_NO_REGISTRADO)
    expect(ficha.enlaceTelefono).toBeNull()
    expect(ficha.horario).toBe(DATO_NO_REGISTRADO)
  })

  it('no repite el lugar cuando municipio y departamento se llaman igual', () => {
    expect(fichaDeClinica(SANTA_ANA).lugar).toBe('Santa Ana')
    expect(fichaDeClinica(clinica({ municipio: null, departamento: null })).lugar).toBeNull()
  })
})
