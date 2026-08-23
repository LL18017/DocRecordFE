// Guardas de la pantalla de Usuarios y Roles.
//
// Dos defectos distintos vigila este archivo, y ninguno se veía al compilar:
//
//   1. La lista se sembraba con `users` de `@/data/mockData`, así que buscaba
//      dentro de personal inventado y un usuario real de la base no aparecía
//      nunca. Por eso aquí no basta con comprobar que se pinta lo que devuelve
//      el API: se comprueba además que NO se pinta la maqueta.
//   2. El backend responde 403 a todo el que no sea ADMIN. Un 403 no es un
//      fallo del sistema ni algo que se arregle reintentando, y mostrarlo como
//      tal deja al usuario dándole a un botón que siempre falla.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { users as usuariosDeMaqueta } from '@/data/mockData'
import type { User } from '@/types'
import type { UsuarioDto } from '@/services/usuarios'
import UsuariosPage from './page'

const listarUsuarios = vi.fn<() => Promise<UsuarioDto[]>>()

vi.mock('@/services/usuarios', () => ({
  listarUsuarios: () => listarUsuarios(),
}))

let sesion: User

vi.mock('@/context/AppContext', () => ({
  useUsuarioAutenticado: () => sesion,
}))

const ADMIN: User = {
  name: 'Naun Flores',
  email: 'naun@docrecord.sv',
  role: 'Administrador',
}
const MEDICO: User = { name: 'Ana Rivas', email: 'ana@docrecord.sv', role: 'medico' }
const ENFERMERA: User = {
  name: 'María López',
  email: 'maria@docrecord.sv',
  role: 'enfermera',
}

/** Filas tal como las devuelve `GET /user/all`. */
const DEL_API: UsuarioDto[] = [
  {
    userId: 152,
    email: 'naun@docrecord.sv',
    userName: 'Naun Enrique Flores Menjivar',
    roles: [
      { id: 1, name: 'ADMIN' },
      { id: 2, name: 'MEDICO' },
    ],
  },
  {
    userId: 353,
    email: 'sin.rol@docrecord.sv',
    userName: 'Cuenta Sin Rol',
    roles: [],
  },
]

beforeEach(() => {
  listarUsuarios.mockReset()
  listarUsuarios.mockResolvedValue(DEL_API)
  sesion = ADMIN
})

function montar() {
  render(<UsuariosPage />)
  return userEvent.setup()
}

describe('con rol Administrador', () => {
  it('muestra los usuarios que devuelve el API', async () => {
    montar()

    expect(await screen.findByText('Naun Enrique Flores Menjivar')).toBeVisible()
    expect(screen.getByText('naun@docrecord.sv')).toBeVisible()
    expect(listarUsuarios).toHaveBeenCalledTimes(1)
  })

  it('no muestra a nadie de los datos de maqueta', async () => {
    // El API devuelve dos filas y ninguna es de `mockData`. Si alguien vuelve a
    // sembrar el estado con `users`, esos nombres aparecerían aquí.
    montar()

    await screen.findByText('Naun Enrique Flores Menjivar')
    for (const inventado of usuariosDeMaqueta) {
      expect(screen.queryByText(inventado.name)).toBeNull()
    }
  })

  it('anuncia la carga antes de que llegue la respuesta', async () => {
    let responder: (usuarios: UsuarioDto[]) => void = () => {}
    listarUsuarios.mockReturnValue(
      new Promise<UsuarioDto[]>((resolve) => {
        responder = resolve
      }),
    )

    montar()

    expect(screen.getByText(/cargando usuarios/i)).toBeVisible()
    responder(DEL_API)
    expect(await screen.findByText('Naun Enrique Flores Menjivar')).toBeVisible()
  })

  it('pinta todos los roles de una cuenta y avisa cuando no tiene ninguno', async () => {
    montar()

    await screen.findByText('Naun Enrique Flores Menjivar')
    // Una cuenta puede ser ADMIN y MEDICO a la vez; leer `roles[0]` escondería
    // el segundo.
    expect(screen.getByText('Administrador')).toBeVisible()
    expect(screen.getByText('Médico')).toBeVisible()
    // `POST /user` crea cuentas sin rol: la fila no puede quedar en blanco.
    expect(screen.getByText(/sin rol asignado/i)).toBeVisible()
  })

  it('dice que no hay usuarios cuando el API devuelve una lista vacía', async () => {
    listarUsuarios.mockResolvedValue([])

    montar()

    expect(await screen.findByText(/no se encontraron usuarios/i)).toBeVisible()
  })

  it('busca dentro de lo que vino del API', async () => {
    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    await user.type(screen.getByPlaceholderText(/buscar por nombre/i), 'sin.rol')

    expect(screen.getByText('Cuenta Sin Rol')).toBeVisible()
    expect(screen.queryByText('Naun Enrique Flores Menjivar')).toBeNull()
  })

  it('ofrece reintentar cuando el servidor falla, y vuelve a pedir', async () => {
    listarUsuarios.mockRejectedValueOnce(new ApiError(500, 'Error del servidor (500).'))

    const user = montar()

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Error del servidor (500).')

    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    await waitFor(() => expect(listarUsuarios).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Naun Enrique Flores Menjivar')).toBeVisible()
  })

  it('trata el 403 como falta de permiso, no como un error reintentable', async () => {
    // El rol de la sesión decía Administrador, pero el servidor manda: el token
    // vive más que un cambio de roles en la base.
    listarUsuarios.mockRejectedValue(
      new ApiError(403, 'No tienes permisos para realizar esta acción'),
    )

    montar()

    expect(
      await screen.findByRole('heading', { name: /no tiene acceso a esta sección/i }),
    ).toBeVisible()
    // Reintentar un 403 falla siempre; ofrecer el botón es prometer algo que no
    // va a pasar.
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('con un rol sin permiso, entrando por la URL', () => {
  it('le dice a un médico que no tiene acceso, y no llama al API', async () => {
    sesion = MEDICO

    montar()

    expect(
      await screen.findByRole('heading', { name: /no tiene acceso a esta sección/i }),
    ).toBeVisible()
    // La petición sería un 403 seguro: no se hace.
    expect(listarUsuarios).not.toHaveBeenCalled()
    // Ni una tabla vacía, que insinuaría que no hay personal registrado.
    expect(screen.queryByText(/no se encontraron usuarios/i)).toBeNull()
    expect(screen.queryByPlaceholderText(/buscar por nombre/i)).toBeNull()
  })

  it('nombra el rol de la sesión para que se entienda el motivo', async () => {
    sesion = ENFERMERA

    montar()

    expect(await screen.findByText(/rol Administrador/i)).toBeVisible()
    expect(screen.getByText(/enfermera/i)).toBeVisible()
  })

  it('nunca muestra correos del personal a quien no puede verlos', async () => {
    // El motivo de que el backend cierre esta pantalla es justo ese: el listado
    // expone el correo de todo el mundo.
    sesion = MEDICO
    listarUsuarios.mockResolvedValue(DEL_API)

    montar()

    await screen.findByRole('heading', { name: /no tiene acceso a esta sección/i })
    expect(screen.queryByText('naun@docrecord.sv')).toBeNull()
    expect(screen.queryByText('sin.rol@docrecord.sv')).toBeNull()
  })
})
