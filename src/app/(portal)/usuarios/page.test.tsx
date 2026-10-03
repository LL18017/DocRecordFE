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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import { users as usuariosDeMaqueta } from '@/data/mockData'
import type { User } from '@/types'
import type {
  AltaUsuarioDto,
  CrearUsuarioPayload,
  RolDto,
  UsuarioDto,
} from '@/services/usuarios'
import UsuariosPage from './page'

const listarUsuarios = vi.fn<() => Promise<UsuarioDto[]>>()
const crearUsuario = vi.fn<(payload: CrearUsuarioPayload) => Promise<AltaUsuarioDto>>()
const asignarRol = vi.fn<(userId: number, roleId: number) => Promise<UsuarioDto>>()
const asignarContrasena = vi.fn<(userId: number, password: string) => Promise<UsuarioDto>>()
const listarRoles = vi.fn<() => Promise<RolDto[]>>()
const quitarRol = vi.fn<(userId: number, roleId: number) => Promise<UsuarioDto>>()
const cambiarEstadoUsuario = vi.fn<(userId: number, activo: boolean) => Promise<UsuarioDto>>()

vi.mock('@/services/usuarios', () => ({
  listarUsuarios: () => listarUsuarios(),
  crearUsuario: (payload: CrearUsuarioPayload) => crearUsuario(payload),
  asignarRol: (userId: number, roleId: number) => asignarRol(userId, roleId),
  asignarContrasena: (userId: number, password: string) => asignarContrasena(userId, password),
  listarRoles: () => listarRoles(),
  quitarRol: (userId: number, roleId: number) => quitarRol(userId, roleId),
  cambiarEstadoUsuario: (userId: number, activo: boolean) =>
    cambiarEstadoUsuario(userId, activo),
}))

let sesion: User

vi.mock('@/context/AppContext', () => ({
  useUsuarioAutenticado: () => sesion,
}))

const ADMIN: User = {
  name: 'Naun Flores',
  email: 'naun@docrecord.sv',
  roles: ['Administrador'],
}
const MEDICO: User = { name: 'Ana Rivas', email: 'ana@docrecord.sv', roles: ['medico'] }
const ENFERMERA: User = {
  name: 'María López',
  email: 'maria@docrecord.sv',
  roles: ['enfermera'],
}

/** Filas tal como las devuelve `GET /user/all`. */
const DEL_API: UsuarioDto[] = [
  {
    userId: 152,
    email: 'naun@docrecord.sv',
    userName: 'Naun Enrique Flores Menjivar',
    especialidad: null,
    activo: true,
    roles: [
      { id: 1, name: 'ADMIN' },
      { id: 2, name: 'MEDICO' },
    ],
  },
  {
    userId: 353,
    email: 'sin.rol@docrecord.sv',
    userName: 'Cuenta Sin Rol',
    especialidad: null,
    activo: true,
    roles: [],
  },
]

beforeEach(() => {
  listarUsuarios.mockReset()
  crearUsuario.mockReset()
  asignarRol.mockReset()
  asignarContrasena.mockReset()
  listarRoles.mockReset()
  quitarRol.mockReset()
  listarUsuarios.mockResolvedValue(DEL_API)
  listarRoles.mockResolvedValue([
    { id: 1, name: 'ADMIN' },
    { id: 2, name: 'MEDICO' },
    { id: 3, name: 'ENFERMERA' },
    { id: 4, name: 'PACIENTE' },
  ])
  sesion = ADMIN
})

function montar() {
  render(<UsuariosPage />)
  return userEvent.setup()
}

/** Llena y envía el formulario de alta del modal «Nuevo usuario», ya abierto. */
async function llenarYEnviarAlta(
  user: ReturnType<typeof userEvent.setup>,
  datos: { nombre: string; email: string; password: string },
) {
  await user.type(screen.getByLabelText(/nombre completo/i), datos.nombre)
  await user.type(screen.getByLabelText(/correo electrónico/i), datos.email)
  await user.type(screen.getByLabelText(/^contraseña/i), datos.password)
  await user.click(screen.getByRole('button', { name: /crear usuario/i }))
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

  it('no se cae por un rol sin nombre, y lo señala en vez de esconderlo', async () => {
    // `RoleDto` llega con los dos campos anulables y ninguno es teórico:
    // `id` sale de `RolesEnum.getIdByName`, que devuelve null para cualquier
    // nombre fuera del enum, y `name` es `role.name VARCHAR(255)` sin NOT
    // NULL. Con el tipo mintiendo, `nombre.toUpperCase()` tumbaba la pantalla
    // entera de Usuarios y Roles por una sola fila mal cargada del catálogo.
    listarUsuarios.mockResolvedValue([
      {
        userId: 900,
        email: 'catalogo.roto@docrecord.sv',
        userName: 'Cuenta Con Rol Roto',
        especialidad: null,
        activo: true,
        roles: [{ id: null, name: null }],
      },
    ])

    montar()

    expect(await screen.findByText('Cuenta Con Rol Roto')).toBeVisible()
    // Tiene un rol asignado: decir «Sin rol asignado» sería falso, y dejar la
    // celda en blanco esconde justo lo que hay que ir a arreglar.
    expect(screen.getByText(/rol sin nombre/i)).toBeVisible()
    expect(screen.queryByText(/sin rol asignado/i)).toBeNull()
  })

  it('busca sin reventar con un rol sin nombre en la lista', async () => {
    listarUsuarios.mockResolvedValue([
      {
        userId: 900,
        email: 'catalogo.roto@docrecord.sv',
        userName: 'Cuenta Con Rol Roto',
        especialidad: null,
        activo: true,
        roles: [{ id: null, name: null }],
      },
      DEL_API[0],
    ])
    const user = montar()
    await screen.findByText('Cuenta Con Rol Roto')

    // La caja de búsqueda mira también los roles: es donde el nulo revienta.
    await user.type(screen.getByPlaceholderText(/buscar por nombre/i), 'administrador')

    expect(await screen.findByText('Naun Enrique Flores Menjivar')).toBeVisible()
    expect(screen.queryByText('Cuenta Con Rol Roto')).toBeNull()
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

// Contexto de las pruebas de aquí en adelante: hasta hoy esta pantalla solo
// listaba. Se conectaron tres acciones nuevas (dar de alta, asignar rol,
// asignar contraseña) contra endpoints reales del backend, con dos reglas que
// no se pueden romper sin que alguien lo note: el backend no permite QUITAR
// un rol (solo añadir), y una cuenta ADMIN no puede tocar la contraseña de
// OTRA cuenta ADMIN.

describe('dar de alta personal', () => {
  it('manda exactamente el cuerpo que POST /user espera', async () => {
    crearUsuario.mockResolvedValue({
      userId: 500,
      email: 'nueva@docrecord.sv',
      userName: 'Nueva Cuenta',
      especialidad: null,
      activo: true,
      roles: [],
      correoDeVerificacionEnviado: true,
    })

    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }))
    await llenarYEnviarAlta(user, {
      nombre: 'Nueva Cuenta',
      email: 'nueva@docrecord.sv',
      password: 'ClaveSegura2026!',
    })

    await waitFor(() => expect(crearUsuario).toHaveBeenCalledTimes(1))
    // Exactamente estos tres campos, ni uno más: `UserRequestDto` no pide
    // rol ni ningún otro dato, y mandarlo de más no falla en silencio, el
    // 400 de validación señalaría un campo que el backend nunca esperó.
    expect(crearUsuario).toHaveBeenCalledWith({
      email: 'nueva@docrecord.sv',
      userName: 'Nueva Cuenta',
      password: 'ClaveSegura2026!',
    })
  })

  it('con el correo sin enviar, no dice que se revise el correo y ofrece asignar contraseña', async () => {
    crearUsuario.mockResolvedValue({
      userId: 501,
      email: 'sinenlace@docrecord.sv',
      userName: 'Sin Enlace',
      especialidad: null,
      activo: true,
      roles: [],
      correoDeVerificacionEnviado: false,
    })

    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }))
    await llenarYEnviarAlta(user, {
      nombre: 'Sin Enlace',
      email: 'sinenlace@docrecord.sv',
      password: 'ClaveSegura2026!',
    })

    expect(
      await screen.findByText(/el correo de confirmación no se pudo enviar/i),
    ).toBeVisible()
    // Ningún correo va a llegar: decir «revise su correo» sería mentira.
    expect(screen.queryByText(/revise su correo/i)).toBeNull()
    expect(screen.queryByText(/revisa (su|tu) correo/i)).toBeNull()
    // La salida se ofrece de inmediato, no solo se informa el fallo.
    expect(
      screen.getByRole('button', { name: /asignar contraseña ahora/i }),
    ).toBeVisible()
  })

  it('con el correo sí enviado, no ofrece la salida de asignar contraseña de inmediato', async () => {
    crearUsuario.mockResolvedValue({
      userId: 502,
      email: 'con.correo@docrecord.sv',
      userName: 'Con Correo',
      especialidad: null,
      activo: true,
      roles: [],
      correoDeVerificacionEnviado: true,
    })

    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }))
    await llenarYEnviarAlta(user, {
      nombre: 'Con Correo',
      email: 'con.correo@docrecord.sv',
      password: 'ClaveSegura2026!',
    })

    await screen.findByText(/cuenta creada/i)
    expect(screen.queryByText(/el correo de confirmación no se pudo enviar/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /asignar contraseña ahora/i })).toBeNull()
  })

  it('un correo duplicado no cierra el modal ni pierde lo ya escrito', async () => {
    crearUsuario.mockRejectedValue(
      new ApiError(409, 'El correo electrónico ya está registrado'),
    )

    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }))
    await llenarYEnviarAlta(user, {
      nombre: 'Repetido',
      email: 'repetido@docrecord.sv',
      password: 'ClaveSegura2026!',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo electrónico ya está registrado',
    )
    expect(screen.getByLabelText(/nombre completo/i)).toHaveValue('Repetido')
  })

  it('no deja la contraseña en ningún sitio observable fuera del campo donde se escribe', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const CLAVE = 'ClaveMuySecreta2026!'
    crearUsuario.mockResolvedValue({
      userId: 503,
      email: 'oculta@docrecord.sv',
      userName: 'Cuenta Oculta',
      especialidad: null,
      activo: true,
      roles: [],
      correoDeVerificacionEnviado: true,
    })

    try {
      const user = montar()
      await screen.findByText('Naun Enrique Flores Menjivar')

      await user.click(screen.getByRole('button', { name: /nuevo usuario/i }))
      await llenarYEnviarAlta(user, {
        nombre: 'Cuenta Oculta',
        email: 'oculta@docrecord.sv',
        password: CLAVE,
      })

      // El modal pasa a la pantalla de éxito, que ya no tiene el campo de
      // contraseña: si la clave sigue en el DOM en algún lado, es una fuga.
      await screen.findByText(/cuenta creada/i)
      expect(document.body.textContent).not.toContain(CLAVE)

      for (const llamada of [...logSpy.mock.calls, ...errorSpy.mock.calls]) {
        expect(llamada.some((arg) => JSON.stringify(arg).includes(CLAVE))).toBe(false)
      }
    } finally {
      logSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})

describe('asignar contraseña', () => {
  it('manda el userId y la contraseña correctos, y refresca la fila', async () => {
    asignarContrasena.mockResolvedValue({
      userId: 353,
      email: 'sin.rol@docrecord.sv',
      userName: 'Cuenta Sin Rol',
      especialidad: null,
      activo: true,
      // El endpoint real no toca los roles; se devuelve uno aquí solo para
      // poder observar en la tabla que la fila se actualizó con lo que
      // volvió del API, no con una suposición local.
      roles: [{ id: 2, name: 'MEDICO' }],
    })

    const user = montar()
    await screen.findByText('Cuenta Sin Rol')

    const fila = screen.getByText('Cuenta Sin Rol').closest('tr')!
    await user.click(within(fila).getByRole('button', { name: /contraseña/i }))

    // «esto también» y no solo «también habilita la cuenta»: ese fragmento
    // más corto también aparece en el SUBTÍTULO del Modal (`page.tsx:435`),
    // que queda montado en el DOM al mismo tiempo que este aviso interno del
    // formulario — un `findByText` sin anclar encuentra los dos y revienta
    // por ambigüedad.
    await screen.findByText(/esto también habilita la cuenta/i)
    await user.type(screen.getByLabelText(/contraseña nueva/i), 'NuevaClave2026!')
    await user.click(screen.getByRole('button', { name: /^asignar contraseña$/i }))

    await waitFor(() =>
      expect(asignarContrasena).toHaveBeenCalledWith(353, 'NuevaClave2026!'),
    )
    // La fila refleja lo que devolvió el API: ya no dice «sin rol asignado».
    // Acotado a ESTA fila: la de Naun ya trae su propio badge «Médico» desde
    // el montaje, así que sin acotar hay dos coincidencias en el documento.
    expect(await within(fila).findByText('Médico')).toBeVisible()
    expect(within(fila).queryByText(/sin rol asignado/i)).toBeNull()
  })

  it('explica ANTES de confirmar que también habilita la cuenta', async () => {
    const user = montar()
    await screen.findByText('Cuenta Sin Rol')

    const fila = screen.getByText('Cuenta Sin Rol').closest('tr')!
    await user.click(within(fila).getByRole('button', { name: /contraseña/i }))

    expect(await screen.findByText(/esto también habilita la cuenta/i)).toBeVisible()
    expect(asignarContrasena).not.toHaveBeenCalled()
  })

  it('el 403 de admin contra admin se muestra legible y no cierra el modal', async () => {
    asignarContrasena.mockRejectedValue(
      new ApiError(403, 'Un administrador no puede asignar la contrasena de otro administrador'),
    )

    const user = montar()
    // Fila de Naun: ADMIN+MEDICO, y coincide con el correo de la sesión, así
    // que el botón SÍ está disponible (autoasignación permitida) — el caso
    // que se prueba aquí es que el backend, de todos modos, puede rechazar
    // por otra razón (p. ej. el rol de la fila cambió después de cargar la
    // tabla), y ese rechazo tiene que verse, no perderse.
    await screen.findByText('Naun Enrique Flores Menjivar')

    const fila = screen.getByText('Naun Enrique Flores Menjivar').closest('tr')!
    await user.click(within(fila).getByRole('button', { name: /contraseña/i }))

    await user.type(screen.getByLabelText(/contraseña nueva/i), 'NuevaClave2026!')
    await user.click(screen.getByRole('button', { name: /^asignar contraseña$/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Un administrador no puede asignar la contrasena de otro administrador',
    )
    // El modal sigue abierto: no finge que funcionó.
    expect(screen.getByLabelText(/contraseña nueva/i)).toBeVisible()
  })

  it('no ofrece el botón para asignarle contraseña a OTRO administrador', async () => {
    listarUsuarios.mockResolvedValue([
      ...DEL_API,
      {
        userId: 900,
        email: 'otro.admin@docrecord.sv',
        userName: 'Otro Administrador',
        especialidad: null,
        activo: true,
        roles: [{ id: 1, name: 'ADMIN' }],
      },
    ])

    montar()
    await screen.findByText('Otro Administrador')

    const filaOtroAdmin = screen.getByText('Otro Administrador').closest('tr')!
    expect(within(filaOtroAdmin).queryByRole('button', { name: /contraseña/i })).toBeNull()
    expect(within(filaOtroAdmin).getByText(/no disponible/i)).toBeVisible()

    // Pero sobre su PROPIA cuenta (mismo correo de la sesión) sí lo tiene,
    // aunque también sea ADMIN: autoasignarse la contraseña no es el ataque
    // que la regla evita.
    const filaPropia = screen.getByText('Naun Enrique Flores Menjivar').closest('tr')!
    expect(within(filaPropia).getByRole('button', { name: /contraseña/i })).toBeVisible()
  })
})

describe('asignar rol', () => {
  it('ofrece quitar los roles que la cuenta ya tiene', async () => {
    // Antes esta prueba exigía lo contrario —«nunca ofrece quitar un rol»—
    // porque el backend no tenía inverso: un rol mal asignado solo se
    // corregía entrando a la base. Ya existe `DELETE /user/{id}/role/{id}`,
    // así que lo que hay que vigilar ahora es que la opción esté.
    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    const fila = screen.getByText('Naun Enrique Flores Menjivar').closest('tr')!
    await user.click(within(fila).getByRole('button', { name: /^rol$/i }))

    const modal = await screen.findByRole('dialog')
    // Naun es Administrador y Médico: dos roles, y para cada uno su acción.
    expect(within(modal).getByText(/roles actuales/i)).toBeVisible()
    expect(within(modal).getAllByRole('button', { name: /^quitar$/i }).length).toBeGreaterThan(0)

    // Esta pantalla administra personal, no pacientes.
    expect(within(modal).queryByRole('radio', { name: /^paciente$/i })).toBeNull()
  })

  it('no deja que un administrador se quite a sí mismo el acceso', async () => {
    // Quedarse sin ningún administrador no tiene arreglo desde la aplicación:
    // AdminBootstrap solo actúa si NO existe ninguno y además se niega a
    // promover cuentas que ya existen. El backend lo rechaza con 409; aquí ni
    // se ofrece, y se dice por qué en vez de esconder el botón sin motivo.
    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    const fila = screen.getByText('Naun Enrique Flores Menjivar').closest('tr')!
    await user.click(within(fila).getByRole('button', { name: /^rol$/i }))

    const modal = await screen.findByRole('dialog')
    // La sesión es la de Naun (ADMIN), y la fila es la suya.
    expect(
      within(modal).getByText(/no puede quitarse su propio acceso de administrador/i),
    ).toBeVisible()
    // Médico sí se le puede quitar: la guarda es solo para ADMIN.
    expect(within(modal).getAllByRole('button', { name: /^quitar$/i })).toHaveLength(1)
  })

  it('descarta del selector los roles que la cuenta ya tiene, para no ni siquiera ofrecer el 409', async () => {
    const user = montar()
    await screen.findByText('Naun Enrique Flores Menjivar')

    // Naun ya es Administrador y Médico.
    const fila = screen.getByText('Naun Enrique Flores Menjivar').closest('tr')!
    await user.click(within(fila).getByRole('button', { name: /^rol$/i }))

    const modal = await screen.findByRole('dialog')
    // Se miran los RADIOS, no el texto suelto: el modal ahora pinta también
    // los roles actuales como insignias, así que buscar «Administrador» por
    // texto lo encuentra ahí y no dice nada del selector, que es lo que esta
    // prueba tiene que comprobar.
    expect(within(modal).queryByRole('radio', { name: /^administrador$/i })).toBeNull()
    expect(within(modal).queryByRole('radio', { name: /^médico$/i })).toBeNull()
    expect(within(modal).getByRole('radio', { name: /^enfermera$/i })).toBeVisible()
  })

  it('manda el userId y roleId correctos al confirmar, y refresca la fila', async () => {
    asignarRol.mockResolvedValue({
      userId: 353,
      email: 'sin.rol@docrecord.sv',
      userName: 'Cuenta Sin Rol',
      especialidad: null,
      activo: true,
      roles: [{ id: 3, name: 'ENFERMERA' }],
    })

    const user = montar()
    await screen.findByText('Cuenta Sin Rol')

    await user.click(screen.getByRole('button', { name: /sin rol asignado — asignar ahora/i }))
    await user.click(await screen.findByRole('radio', { name: /enfermera/i }))
    await user.click(screen.getByRole('button', { name: /añadir rol enfermera/i }))

    await waitFor(() => expect(asignarRol).toHaveBeenCalledWith(353, 3))
    expect(await screen.findByText('Enfermera')).toBeVisible()
    expect(screen.queryByText(/sin rol asignado/i)).toBeNull()
  })
})

// ─── HU-05 · especialidad y estado en el listado ─────────────────────────────
describe('Usuarios y Roles · especialidad y estado', () => {
  beforeEach(() => {
    sesion = ADMIN
    listarRoles.mockResolvedValue([])
    cambiarEstadoUsuario.mockReset()
  })

  it('muestra la especialidad del médico y un guion cuando no aplica', async () => {
    // Criterio 1: «veo la lista con nombre, correo, rol, especialidad y
    // estado». El guion no es decorativo: una cuenta que no ejerce la medicina
    // no tiene especialidad, y pintar una por defecto sería inventarla.
    listarUsuarios.mockResolvedValue([
      {
        userId: 1,
        email: 'medico@docrecord.sv',
        userName: 'Ricardo Melgar',
        roles: [{ id: 2, name: 'MEDICO' }],
        especialidad: 'Cardiología',
        activo: true,
      },
      {
        userId: 2,
        email: 'enfermera@docrecord.sv',
        userName: 'Marta Guevara',
        roles: [{ id: 3, name: 'ENFERMERA' }],
        especialidad: null,
        activo: true,
      },
    ])

    render(<UsuariosPage />)

    const filaMedico = (await screen.findByText('Ricardo Melgar')).closest('tr')!
    expect(within(filaMedico).getByText('Cardiología')).toBeInTheDocument()

    const filaEnfermera = screen.getByText('Marta Guevara').closest('tr')!
    expect(within(filaEnfermera).getByLabelText('Sin especialidad')).toBeInTheDocument()
    expect(within(filaEnfermera).queryByText('Cardiología')).not.toBeInTheDocument()
  })

  it('distingue una cuenta activa de una inactiva', async () => {
    listarUsuarios.mockResolvedValue([
      {
        userId: 1,
        email: 'activa@docrecord.sv',
        userName: 'Cuenta Activa',
        roles: [{ id: 2, name: 'MEDICO' }],
        especialidad: null,
        activo: true,
      },
      {
        userId: 2,
        email: 'inactiva@docrecord.sv',
        userName: 'Cuenta Inactiva',
        roles: [{ id: 2, name: 'MEDICO' }],
        especialidad: null,
        activo: false,
      },
    ])

    render(<UsuariosPage />)

    const activa = (await screen.findByText('Cuenta Activa')).closest('tr')!
    const inactiva = screen.getByText('Cuenta Inactiva').closest('tr')!
    expect(within(activa).getByText('Activa')).toBeInTheDocument()
    expect(within(inactiva).getByText('Inactiva')).toBeInTheDocument()
  })

  it('desactivar una cuenta la manda al backend y refleja lo que este devuelve', async () => {
    // La fila se reemplaza con la respuesta del servidor, no invirtiendo el
    // valor a mano: si el backend decidiera otra cosa, la pantalla debe
    // mostrar lo que quedó guardado.
    const original: UsuarioDto = {
      userId: 7,
      email: 'objetivo@docrecord.sv',
      userName: 'Cuenta Objetivo',
      roles: [{ id: 2, name: 'MEDICO' }],
      especialidad: 'Pediatría',
      activo: true,
    }
    listarUsuarios.mockResolvedValue([original])
    cambiarEstadoUsuario.mockResolvedValue({ ...original, activo: false })

    render(<UsuariosPage />)

    const fila = (await screen.findByText('Cuenta Objetivo')).closest('tr')!
    await userEvent.click(within(fila).getByRole('button', { name: /desactivar/i }))

    await waitFor(() => expect(cambiarEstadoUsuario).toHaveBeenCalledWith(7, false))
    await waitFor(() =>
      expect(within(screen.getByText('Cuenta Objetivo').closest('tr')!).getByText('Inactiva'))
        .toBeInTheDocument(),
    )
  })

  it('no ofrece desactivar la cuenta propia, y explica por qué', async () => {
    // El backend responde 409 —dejarse fuera uno mismo no tiene arreglo desde
    // la aplicación—. Se anticipa aquí en vez de ofrecer un botón que falla.
    listarUsuarios.mockResolvedValue([
      {
        userId: 1,
        email: 'naun@docrecord.sv', // el mismo de ADMIN: la fila ES la cuenta en sesión
        userName: 'Naun Flores',
        roles: [{ id: 1, name: 'ADMIN' }],
        especialidad: null,
        activo: true,
      },
    ])

    render(<UsuariosPage />)

    const fila = (await screen.findByText('Naun Flores')).closest('tr')!
    expect(within(fila).queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument()
    expect(within(fila).getByText('Es su cuenta')).toBeInTheDocument()
  })

  it('si el backend rechaza el cambio, lo dice y no altera la fila', async () => {
    listarUsuarios.mockResolvedValue([
      {
        userId: 9,
        email: 'ultimo.admin@docrecord.sv',
        userName: 'Ultimo Admin',
        roles: [{ id: 1, name: 'ADMIN' }],
        especialidad: null,
        activo: true,
      },
    ])
    cambiarEstadoUsuario.mockRejectedValue(
      new ApiError(409, 'No se puede desactivar al ultimo administrador activo'),
    )

    render(<UsuariosPage />)

    const fila = (await screen.findByText('Ultimo Admin')).closest('tr')!
    await userEvent.click(within(fila).getByRole('button', { name: /desactivar/i }))

    expect(
      await screen.findByText(/no se puede desactivar al ultimo administrador activo/i),
    ).toBeInTheDocument()
    // Y la fila sigue como estaba: el rechazo no debe pintar un cambio que no ocurrió.
    expect(
      within(screen.getByText('Ultimo Admin').closest('tr')!).getByText('Activa'),
    ).toBeInTheDocument()
  })
})
