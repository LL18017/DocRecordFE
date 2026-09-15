// Guardas de la sesión persistida: la clínica activa debe sobrevivir a un
// refresco y morir con la sesión.
//
// «Recrear el proveedor» es lo que aquí simula un F5: el árbol de React se
// tira entero y se vuelve a montar, y lo único que puede sobrevivir es lo que
// esté fuera de React. Mientras `activeClinic` fue `useState`, todas las
// pruebas de este archivo quedaban en rojo.

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Clinica, User } from '@/types'
import { AppProvider, useAppContext } from './AppContext'

const MEDICO: User = { name: 'Naun Flores', email: 'naun@docrecord.sv', roles: ['medico'] }
const OTRO_MEDICO: User = { name: 'Ana Rivas', email: 'ana@docrecord.sv', roles: ['medico'] }

const SEDE: Clinica = { id: 7, name: 'Clínica Familiar Escalón', lat: 13.7053, lng: -89.2182 }

/**
 * Doble de `BroadcastChannel`: jsdom no lo implementa y, cuando existe, no se
 * entrega a sí mismo el mensaje que publica. Con este doble se puede tanto ver
 * lo que se difunde como simular el aviso que llega de otra pestaña.
 */
const difundidos: unknown[] = []
let canalCreado: BroadcastChannelFalso | null = null

function recordarCanal(canal: BroadcastChannelFalso): void {
  canalCreado = canal
}

class BroadcastChannelFalso {
  onmessage: ((evento: { data: unknown }) => void) | null = null
  constructor(public readonly nombre: string) {
    recordarCanal(this)
  }
  postMessage(datos: unknown): void {
    difundidos.push(datos)
  }
  close(): void {}
}

function Sonda() {
  const { user, activeClinic, setActiveClinic, setUser, cerrarSesion } = useAppContext()
  return (
    <div>
      <p>Sesión: {user?.email ?? 'sin sesión'}</p>
      <p>
        Sede:{' '}
        {activeClinic
          ? `${activeClinic.name} (${activeClinic.id}) ${activeClinic.lat}, ${activeClinic.lng}`
          : 'sin clínica'}
      </p>
      <button onClick={() => setUser(MEDICO)}>Entrar como Naun</button>
      <button onClick={() => setUser(OTRO_MEDICO)}>Entrar como Ana</button>
      <button onClick={() => setActiveClinic(SEDE)}>Elegir sede</button>
      <button onClick={cerrarSesion}>Cerrar sesión</button>
    </div>
  )
}

/** Monta el proveedor desde cero, como haría el navegador tras un refresco. */
function montar() {
  return render(
    <AppProvider>
      <Sonda />
    </AppProvider>,
  )
}

function sedeMostrada(): string {
  return screen.getByText(/^Sede:/).textContent ?? ''
}

function sesionMostrada(): string {
  return screen.getByText(/^Sesión:/).textContent ?? ''
}

beforeEach(() => {
  window.sessionStorage.clear()
  difundidos.length = 0
  vi.stubGlobal('BroadcastChannel', BroadcastChannelFalso)
})

describe('AppContext · la clínica activa sobrevive al refresco', () => {
  it('sigue activa al recrear el proveedor, con sus coordenadas', async () => {
    const usuario = userEvent.setup()
    const { unmount } = montar()

    await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
    await usuario.click(screen.getByRole('button', { name: 'Elegir sede' }))
    expect(sedeMostrada()).toContain('Clínica Familiar Escalón')

    // F5.
    unmount()
    montar()

    expect(sesionMostrada()).toContain('naun@docrecord.sv')
    // Las coordenadas viajan enteras: si se perdieran, la pantalla diría «Sin
    // ubicación registrada» de una sede que sí está ubicada.
    expect(sedeMostrada()).toBe('Sede: Clínica Familiar Escalón (7) 13.7053, -89.2182')
  })

  it('no guarda ninguna sede si no hay sesión a la que atribuirla', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(screen.getByRole('button', { name: 'Elegir sede' }))

    expect(sedeMostrada()).toContain('sin clínica')
    expect(window.sessionStorage.getItem('docrecord.clinica')).toBeNull()
  })
})

describe('AppContext · la clínica activa muere con la sesión', () => {
  it('desaparece al cerrar sesión y no reaparece al volver a entrar', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
    await usuario.click(screen.getByRole('button', { name: 'Elegir sede' }))
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(sedeMostrada()).toContain('sin clínica')

    // Entrar de nuevo no debe «heredar» la sede de la sesión anterior: en una
    // computadora compartida de clínica eso es contarle al siguiente usuario
    // dónde estaba trabajando el anterior.
    await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
    expect(sedeMostrada()).toContain('sin clínica')
  })

  it('avisa a las demás pestañas al cerrar sesión', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(difundidos).toEqual([{ tipo: 'cierre' }])
  })

  it('borra sesión y sede cuando el cierre llega desde otra pestaña', async () => {
    const usuario = userEvent.setup()
    montar()

    await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
    await usuario.click(screen.getByRole('button', { name: 'Elegir sede' }))

    // Lo que hace el navegador al recibir el mensaje de la otra pestaña.
    act(() => {
      canalCreado?.onmessage?.({ data: { tipo: 'cierre' } })
    })

    expect(sesionMostrada()).toContain('sin sesión')
    expect(sedeMostrada()).toContain('sin clínica')
    expect(window.sessionStorage.getItem('docrecord.clinica')).toBeNull()
  })
})

describe('AppContext · sesión de forma vieja', () => {
  // Antes de este cambio la sesión guardaba un solo `role`; alguien que la
  // haya dejado abierta desde antes de la actualización tiene esa forma
  // todavía en sessionStorage. No debe reventar el render con `undefined`, y
  // tampoco quedarse ahí sin que nada la lea: se trata como sesión inválida y
  // se limpia, igual que un cierre de sesión real.
  it('no revienta con una sesión de antes de esta actualización, y la limpia', () => {
    window.sessionStorage.setItem(
      'docrecord.user',
      JSON.stringify({ name: 'Naun Flores', email: 'naun@docrecord.sv', role: 'medico' }),
    )

    montar()

    expect(sesionMostrada()).toContain('sin sesión')
    expect(window.sessionStorage.getItem('docrecord.user')).toBeNull()
    // Avisa a las demás pestañas, igual que cerrarSesion(): si esta pestaña
    // tenía la forma vieja, las otras copias abiertas también la tienen.
    expect(difundidos).toEqual([{ tipo: 'cierre' }])
  })

  it('una sesión con `roles` como arreglo se lee sin problema, aunque tenga un solo rol', () => {
    window.sessionStorage.setItem('docrecord.user', JSON.stringify(MEDICO))

    montar()

    expect(sesionMostrada()).toContain('naun@docrecord.sv')
    expect(window.sessionStorage.getItem('docrecord.user')).not.toBeNull()
  })
})

describe('AppContext · a quién pertenece la clínica guardada', () => {
  it('no le pasa la sede de un médico a la cuenta que entre después en la misma pestaña', async () => {
    const usuario = userEvent.setup()
    const { unmount } = montar()

    await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
    await usuario.click(screen.getByRole('button', { name: 'Elegir sede' }))

    // Cambio de cuenta sin pasar por cerrarSesion() (la sesión se sobrescribe).
    await usuario.click(screen.getByRole('button', { name: 'Entrar como Ana' }))
    expect(sedeMostrada()).toContain('sin clínica')

    // Y tampoco al refrescar: la comprobación es al leer, no un efecto puntual.
    unmount()
    montar()
    expect(sesionMostrada()).toContain('ana@docrecord.sv')
    expect(sedeMostrada()).toContain('sin clínica')
  })

  it('descarta lo guardado si no tiene la forma de una clínica', async () => {
    const usuario = userEvent.setup()

    // Formato viejo (sin dueño), JSON roto y clínica sin id: las tres cosas que
    // puede haber dejado una versión anterior o una escritura a medias. Ninguna
    // debe reventar el render ni pintar una sede a medio construir.
    for (const guardado of [
      JSON.stringify({ id: 7, name: 'Sede suelta' }),
      '{no es json',
      JSON.stringify({ medico: 'naun@docrecord.sv', clinica: { name: 'Sin id' } }),
    ]) {
      window.sessionStorage.setItem('docrecord.clinica', guardado)
      const { unmount } = montar()
      await usuario.click(screen.getByRole('button', { name: 'Entrar como Naun' }))
      expect(sedeMostrada()).toContain('sin clínica')
      unmount()
    }
  })
})
