// Tabla de rutas por rol: qué ve cada uno y a dónde cae quien no puede ver algo.
//
// La tabla decide dos cosas a la vez —las entradas del menú lateral y la
// guarda del portal—, así que un error aquí se manifiesta de dos formas
// distintas y ninguna se parece a la otra: un menú con pantallas de más, o un
// desvío que no lleva a ninguna parte.

import { describe, expect, it } from 'vitest'
import { puedeVerRuta, rutaPorDefecto, RUTAS_DEL_PORTAL } from './rutas'

describe('rutaPorDefecto · a dónde cae quien no puede ver una pantalla', () => {
  it('manda al personal al panel de trabajo', () => {
    expect(rutaPorDefecto(['medico'])).toBe('/dashboard')
    expect(rutaPorDefecto(['enfermera'])).toBe('/dashboard')
    expect(rutaPorDefecto(['Administrador'])).toBe('/dashboard')
    expect(rutaPorDefecto(['Administrador', 'medico'])).toBe('/dashboard')
  })

  /**
   * El bucle que motivó que esto fuera una función y no una constante.
   *
   * Con el destino fijo en '/dashboard', la guarda del portal rechazaba al
   * paciente en esa ruta y volvía a mandarlo a la misma ruta, indefinidamente.
   * La prueba no es que devuelva '/mi-panel' sino lo de la segunda línea: que
   * el destino sea una ruta que ESE rol sí puede abrir. Escrito así, sigue
   * valiendo aunque la pantalla del paciente se llame de otra forma mañana.
   */
  it('no manda al paciente a una pantalla que su rol no puede abrir', () => {
    const destino = rutaPorDefecto(['paciente'])
    expect(destino).toBe('/mi-panel')
    expect(puedeVerRuta(destino, ['paciente'])).toBe(true)
  })

  it('sale del portal cuando la sesión no puede ver ninguna pantalla', () => {
    // Sin esto el desvío sería a una ruta del portal que también se rechaza:
    // el mismo bucle, solo que con otro rol.
    expect(rutaPorDefecto([])).toBe('/login')
  })
})

describe('puedeVerRuta · el paciente no hereda el portal de trabajo', () => {
  it('le niega las pantallas del personal', () => {
    for (const ruta of ['/dashboard', '/pacientes', '/consultas', '/prescripciones', '/usuarios']) {
      expect(puedeVerRuta(ruta, ['paciente'])).toBe(false)
    }
  })

  it('no ofrece «Mi información» a quien no es paciente', () => {
    expect(puedeVerRuta('/mi-panel', ['medico'])).toBe(false)
    expect(puedeVerRuta('/mi-panel', ['enfermera'])).toBe(false)
    expect(puedeVerRuta('/mi-panel', ['Administrador'])).toBe(false)
  })

  it('una cuenta con dos roles suma lo que cada uno permite', () => {
    // No hay jerarquía entre roles: basta con que UNO autorice la ruta.
    expect(puedeVerRuta('/dashboard', ['paciente', 'medico'])).toBe(true)
    expect(puedeVerRuta('/mi-panel', ['paciente', 'medico'])).toBe(true)
  })

  it('el menú de un paciente tiene exactamente una entrada', () => {
    // El defecto original era justo este número: eran siete, las de un médico.
    const visibles = RUTAS_DEL_PORTAL.filter((r) => r.roles.includes('paciente'))
    expect(visibles.map((r) => r.href)).toEqual(['/mi-panel'])
  })
})
