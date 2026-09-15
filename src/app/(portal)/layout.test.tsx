// Guardas del acceso al portal (HU-03, criterios 2 y 4).
//
// El defecto que vigila este archivo: el menú escondía las pantallas que un rol
// no puede usar, pero esconder no es proteger. Una enfermera que escribiera
// `/consultas` en la barra de direcciones veía la pantalla entera y se llevaba
// un 403 del servidor al cargar los datos —un error crudo en vez de una puerta
// cerrada—. HU-03 pide las dos capas por separado: el criterio 2 es esta guarda
// de cliente, el criterio 3 es el 403 del backend.
//
// Y vigila el lado contrario, que es igual de importante: que la guarda NO
// bloquee de más. `/pacientes/5` es una ruta dinámica, y una tabla que case por
// igualdad exacta la dejaría fuera —rompiendo HU-08, que exige que la URL de un
// expediente se pueda compartir y abrir directamente—.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Role, User } from '@/types'
import PortalLayout from './layout'

const replace = vi.fn()
let ruta = '/dashboard'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => ruta,
}))

let sesion: User | null
let cargandoSesion: boolean

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ user: sesion, cargandoSesion }),
}))

// El Shell real monta Sidebar y TopBar, que piden la sesión por su cuenta y
// arrastran media aplicación. Lo que se prueba aquí es a quién deja pasar el
// layout, no qué pinta después.
vi.mock('@/components/layout/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function usuario(...roles: Role[]): User {
  return { name: 'Naun Flores', email: 'naun@docrecord.sv', roles }
}

beforeEach(() => {
  replace.mockReset()
  ruta = '/dashboard'
  sesion = usuario('medico')
  cargandoSesion = false
})

function montar() {
  render(
    <PortalLayout>
      <p>contenido de la pantalla</p>
    </PortalLayout>,
  )
}

const seVe = () => screen.queryByText('contenido de la pantalla') !== null

describe('sin sesión', () => {
  it('manda a /login y no pinta la pantalla', async () => {
    sesion = null

    montar()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
    expect(seVe()).toBe(false)
  })

  it('mientras la sesión carga no redirige a ningún lado', async () => {
    // En el primer render `cargandoSesion` es true y `user` es null. Evaluar
    // ahí mandaría a /login —o al panel— a quien sí tiene sesión, durante un
    // instante y en cada recarga.
    sesion = null
    cargandoSesion = true

    montar()

    await waitFor(() => expect(screen.getByText(/cargando/i)).toBeVisible())
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('HU-03 · criterio 2 · el rol decide qué pantallas se abren', () => {
  it('una enfermera que escribe /consultas vuelve al panel sin ver la pantalla', async () => {
    sesion = usuario('enfermera')
    ruta = '/consultas'

    montar()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    // No basta con redirigir: la pantalla no puede llegar a pintarse, porque
    // al montarse habría lanzado sus peticiones al backend.
    expect(seVe()).toBe(false)
  })

  it('a una enfermera tampoco le abre /usuarios ni /prescripciones', async () => {
    for (const prohibida of ['/usuarios', '/prescripciones']) {
      replace.mockReset()
      sesion = usuario('enfermera')
      ruta = prohibida

      montar()

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    }
  })

  it('al médico sí le abre /consultas', async () => {
    sesion = usuario('medico')
    ruta = '/consultas'

    montar()

    await waitFor(() => expect(seVe()).toBe(true))
    expect(replace).not.toHaveBeenCalled()
  })

  it('una cuenta con varios roles entra por el que la autoriza', async () => {
    // ADMIN+MEDICO es el caso normal en este sistema. Basta con que UNO de sus
    // roles permita la pantalla: comprobar solo el primero la dejaría fuera de
    // media aplicación según el orden del array.
    sesion = usuario('Administrador', 'medico')
    ruta = '/consultas'

    montar()

    await waitFor(() => expect(seVe()).toBe(true))
    expect(replace).not.toHaveBeenCalled()
  })

  it('un administrador puro no entra a /consultas', async () => {
    // No es una restricción arbitraria: un administrador que no ejerce no tiene
    // fila en la tabla `medicos`, y el servicio lo rechaza con 403 aunque pase
    // el control de rol del controlador. Ofrecerle la pantalla sería mandarlo a
    // un error que no puede resolver.
    sesion = usuario('Administrador')
    ruta = '/consultas'

    montar()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('HU-08 · la guarda no rompe las URL compartibles', () => {
  it('abre el expediente de un paciente por su URL directa', async () => {
    // `/pacientes/5` no está en la tabla de rutas: se resuelve por prefijo. Con
    // igualdad exacta caería en el caso "ruta desconocida" y —según cómo se
    // resolviera— quedaría inalcanzable, rompiendo el criterio 2 de HU-08.
    sesion = usuario('enfermera')
    ruta = '/pacientes/5'

    montar()

    await waitFor(() => expect(seVe()).toBe(true))
    expect(replace).not.toHaveBeenCalled()
  })

  it('el detalle de una toma de constantes también se abre por su URL', async () => {
    sesion = usuario('medico')
    ruta = '/enfermeria/12'

    montar()

    await waitFor(() => expect(seVe()).toBe(true))
    expect(replace).not.toHaveBeenCalled()
  })
})
