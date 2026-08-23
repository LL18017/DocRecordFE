// Guardas del menú lateral: que no ofrezca una pantalla que el servidor va a
// rechazar.
//
// El caso que originó estas pruebas: «Usuarios y Roles» figuraba con
// `roles: ['medico']` mientras el controller `/user` del backend es
// `hasRole('ADMIN')`. Es decir, el único rol al que la aplicación le enseñaba
// la opción era exactamente el que el servidor iba a rechazar con 403, y
// ningún rol que sí podía usarla la veía. Compilaba y se veía bien; solo
// fallaba al hacer clic.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Role, User } from '@/types'
import { Sidebar } from './Sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

let sesion: User

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ activeClinic: null }),
  useUsuarioAutenticado: () => sesion,
}))

function sesionCon(role: Role): User {
  return { name: 'Naun Flores', email: 'naun@docrecord.sv', role }
}

beforeEach(() => {
  sesion = sesionCon('medico')
})

function montar(role: Role) {
  sesion = sesionCon(role)
  render(<Sidebar sidebarOpen={false} setSidebarOpen={() => {}} />)
}

/** Enlaces del menú visibles, por su etiqueta. */
function opcionesDelMenu(): string[] {
  return screen
    .getAllByRole('link')
    .map((enlace) => enlace.textContent?.trim() ?? '')
    .filter((etiqueta) => etiqueta.length > 0)
}

describe('Usuarios y Roles', () => {
  it('se le ofrece al Administrador, que es quien puede usarla', () => {
    montar('Administrador')

    const opcion = screen.getByRole('link', { name: /usuarios y roles/i })
    expect(opcion).toHaveAttribute('href', '/usuarios')
  })

  it('no se le ofrece a un médico: el backend le responde 403', () => {
    montar('medico')

    expect(screen.queryByRole('link', { name: /usuarios y roles/i })).toBeNull()
    expect(opcionesDelMenu()).not.toContain('Usuarios y Roles')
  })

  it('no se le ofrece a una enfermera', () => {
    montar('enfermera')

    expect(screen.queryByRole('link', { name: /usuarios y roles/i })).toBeNull()
  })
})

describe('el resto del menú', () => {
  it('deja al Administrador con las pantallas que su rol sí puede usar', () => {
    // `mapearRol` colapsa a un solo rol: una cuenta ADMIN+MEDICO llega aquí
    // como 'Administrador'. Si solo se le ofreciera /usuarios, se quedaría con
    // un menú de una sola opción, sin el trabajo clínico que el backend sí le
    // autoriza (/pacientes y /clinics admiten ADMIN).
    montar('Administrador')

    expect(screen.getByRole('link', { name: /pacientes/i })).toHaveAttribute(
      'href',
      '/pacientes',
    )
    expect(screen.getByRole('link', { name: /clínicas/i })).toHaveAttribute('href', '/clinicas')
    expect(screen.getByRole('link', { name: /^dashboard$/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('no le quita al médico ninguna de sus pantallas', () => {
    montar('medico')

    const opciones = opcionesDelMenu()
    expect(opciones).toContain('Consultas Médicas')
    expect(opciones).toContain('Prescripciones')
    expect(opciones).toContain('Pacientes')
    expect(opciones).not.toContain('Registro Enfermería')
  })

  it('no le quita a la enfermera ninguna de sus pantallas', () => {
    montar('enfermera')

    const opciones = opcionesDelMenu()
    expect(opciones).toContain('Registro Enfermería')
    expect(opciones).toContain('Pacientes')
    expect(opciones).not.toContain('Consultas Médicas')
  })
})
