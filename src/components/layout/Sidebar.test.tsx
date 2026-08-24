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
  return { name: 'Naun Flores', email: 'naun@docrecord.sv', roles: [role] }
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

/** Igual que `montar`, pero con la lista completa de roles de la cuenta. */
function montarConRoles(roles: Role[]) {
  sesion = { name: 'Naun Flores', email: 'naun@docrecord.sv', roles }
  render(<Sidebar sidebarOpen={false} setSidebarOpen={() => {}} />)
}

describe('una cuenta con varios roles a la vez', () => {
  // Caso real que originó estas pruebas: naunflores620@gmail.com ganó ADMIN
  // conservando MEDICO. `mapearRoles` ya no colapsa a uno, pero el filtro del
  // Sidebar tenía que dejar de usar `.includes(user.role)` (un solo rol) por
  // `.some(...)` sobre TODOS los roles de la cuenta; si vuelve a colapsar,
  // estas pruebas lo detectan.
  it('ADMIN+MEDICO ve las pantallas de médico Y la de administrador', () => {
    montarConRoles(['Administrador', 'medico'])

    const opciones = opcionesDelMenu()
    expect(opciones).toContain('Consultas Médicas')
    expect(opciones).toContain('Prescripciones')
    expect(opciones).toContain('Agenda de Citas')
    expect(opciones).toContain('Usuarios y Roles')
  })

  it('un Administrador puro NO ve Consultas ni Prescripciones aunque sí vea Usuarios y Roles', () => {
    // La trampa que no había que tomar: si el filtro le diera 'Administrador'
    // a las pantallas de médico, esta cuenta las vería y el backend le
    // respondería 403 al pulsarlas (ConsultaService exige fila en `medicos`,
    // no el rol del token).
    montarConRoles(['Administrador'])

    const opciones = opcionesDelMenu()
    expect(opciones).toContain('Usuarios y Roles')
    expect(opciones).not.toContain('Consultas Médicas')
    expect(opciones).not.toContain('Prescripciones')
    expect(opciones).not.toContain('Agenda de Citas')
  })

  it('el pie de la barra lista todos los roles de la cuenta, no solo uno', () => {
    montarConRoles(['Administrador', 'medico'])

    expect(screen.getByText('Administrador · Médico')).toBeInTheDocument()
  })
})

describe('el resto del menú', () => {
  it('deja al Administrador con las pantallas que su rol sí puede usar', () => {
    // Un administrador puro (sin rol de médico) también puede usar
    // /pacientes y /clinicas: el backend admite ADMIN en esos dos endpoints.
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
