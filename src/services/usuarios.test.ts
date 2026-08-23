// Guardas del servicio de usuarios: qué se le pide al backend y qué se hace
// con lo que contesta.
//
// Como en `pacientes.test.ts`, las pruebas van por el camino completo
// (fetch → lib/api.ts → servicio) en vez de contra un `apiFetch` simulado: así
// se comprueba también la URL exacta que sale a la red, que es donde estaba el
// malentendido más caro de este endpoint.
//
// El malentendido: `GET /user/all?inicio=&fin=` NO es un rango de filas. El
// backend hace `PageRequest.of(inicio, fin)`, así que `inicio` es el índice de
// página y `fin` el tamaño. Quien lo lea como «de la fila 0 a la 50» pedirá
// la página 0 de tamaño 50 la primera vez —acierta por casualidad— y la página
// 50 de tamaño 100 la segunda, saltándose miles de filas. Los cuerpos usados
// aquí son los que devuelve de verdad la API en marcha.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { asignarRol, crearUsuario, listarUsuarios, type UsuarioDto } from './usuarios'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

function respuesta(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? '' : JSON.stringify(cuerpo), { status })
}

/** URL pedida en la llamada `n` (0-based). */
function urlPedida(n = 0): string {
  return String(fetchMock.mock.calls[n][0])
}

/** Cuerpo JSON enviado en la llamada `n` (0-based). */
function cuerpoEnviado(n = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[n][1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

/** Espera el rechazo y devuelve el `ApiError`. Falla si la promesa se resuelve. */
async function errorDe(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa
  } catch (e) {
    return e as ApiError
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
}

function usuario(userId: number, cambios: Partial<UsuarioDto> = {}): UsuarioDto {
  return {
    userId,
    email: `usuario${userId}@docrecord.sv`,
    userName: `Usuario ${userId}`,
    roles: [{ id: 2, name: 'MEDICO' }],
    ...cambios,
  }
}

/** Página llena, del tamaño exacto que el servicio pide (200). */
function paginaLlena(desde: number): UsuarioDto[] {
  return Array.from({ length: 200 }, (_, i) => usuario(desde + i))
}

// Cuerpo real del 403 de `/user/all` con una sesión MEDICO, copiado de la API.
// `roles` y `usuario` son datos de diagnóstico del backend; el motivo está en
// `message`, que es el que `lib/api.ts` prefiere.
const ACCESO_DENEGADO = {
  roles: '[ROLE_MEDICO]',
  usuario: '152',
  message: 'No tienes permisos para realizar esta acción',
  error: 'Acceso denegado',
}

describe('listarUsuarios · cómo se pagina', () => {
  it('pide una página, no un rango de filas', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, [usuario(2)]))

    await listarUsuarios()

    // `inicio` es el índice de página y `fin` el tamaño. Pedir `inicio=0&fin=1`
    // («de la fila 0 a la 1») traería un solo usuario, no la lista.
    expect(urlPedida()).toBe('http://localhost:8080/user/all?inicio=0&fin=200')
  })

  it('sigue pidiendo páginas mientras vuelvan llenas', async () => {
    // El backend no dice cuántos usuarios hay en total —devuelve un array
    // pelado, no un `Page`—, así que la única señal de «ya no hay más» es que
    // la página venga incompleta.
    fetchMock
      .mockResolvedValueOnce(respuesta(200, paginaLlena(1)))
      .mockResolvedValueOnce(respuesta(200, [usuario(201), usuario(202)]))

    const usuarios = await listarUsuarios()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(urlPedida(1)).toBe('http://localhost:8080/user/all?inicio=1&fin=200')
    expect(usuarios).toHaveLength(202)
    // El usuario 201 solo aparece si se pidió la segunda página. Con una sola
    // llamada —o con el tope por defecto del backend, 20— se perdería sin aviso.
    expect(usuarios.map((u) => u.userId)).toContain(201)
  })

  it('deja de pedir en cuanto una página viene incompleta', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, [usuario(2), usuario(52)]))

    const usuarios = await listarUsuarios()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(usuarios).toHaveLength(2)
  })

  it('no repite a un usuario que aparezca en dos páginas', async () => {
    // El backend pagina sin `ORDER BY`, así que una fila puede caer dos veces
    // si alguien da de alta una cuenta mientras se recorre. Duplicarla llenaría
    // la tabla de claves repetidas y mostraría al mismo usuario dos veces.
    const primera = paginaLlena(1)
    fetchMock
      .mockResolvedValueOnce(respuesta(200, primera))
      .mockResolvedValueOnce(respuesta(200, [primera[199], usuario(201)]))

    const usuarios = await listarUsuarios()

    expect(usuarios).toHaveLength(201)
    expect(usuarios.filter((u) => u.userId === 200)).toHaveLength(1)
  })

  it('devuelve una lista vacía cuando no hay usuarios, sin fallar', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, []))

    await expect(listarUsuarios()).resolves.toEqual([])
  })
})

describe('listarUsuarios · errores', () => {
  it('deja pasar el 403 con su código y el motivo del backend', async () => {
    // Quien llama necesita el 403 tal cual para distinguir «no tiene permiso»
    // de «el servidor falló»: son mensajes distintos en pantalla y solo uno
    // tiene sentido reintentar.
    fetchMock.mockResolvedValueOnce(respuesta(403, ACCESO_DENEGADO))

    const error = await errorDe(listarUsuarios())

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(403)
    expect(error.message).toBe(ACCESO_DENEGADO.message)
  })

  it('no sigue pidiendo páginas después de un fallo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(500, { message: 'Error interno' }))

    await errorDe(listarUsuarios())

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('crearUsuario', () => {
  it('envía el correo, el nombre completo y la contraseña a POST /user', async () => {
    const creado = usuario(353, { roles: [] })
    fetchMock.mockResolvedValueOnce(respuesta(200, creado))

    const resultado = await crearUsuario({
      email: 'nuevo@docrecord.sv',
      userName: 'Ana María Ramírez López',
      password: 'Docrecord2026!',
    })

    expect(urlPedida()).toBe('http://localhost:8080/user')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(cuerpoEnviado()).toEqual({
      email: 'nuevo@docrecord.sv',
      userName: 'Ana María Ramírez López',
      password: 'Docrecord2026!',
    })
    // El backend crea la cuenta SIN rol; hay que asignarlo aparte.
    expect(resultado.roles).toEqual([])
  })

  it('deja pasar el motivo del 409 por correo repetido', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta(409, {
        message: 'El correo electrónico ya está registrado',
        error: 'Correo duplicado',
      }),
    )

    const error = await errorDe(
      crearUsuario({ email: 'naun@docrecord.sv', userName: 'Naun Flores', password: 'x' }),
    )

    expect(error.status).toBe(409)
    expect(error.message).toBe('El correo electrónico ya está registrado')
  })
})

describe('asignarRol', () => {
  it('llama a POST /user/{userId}/role/{roleId} sin cuerpo', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta(200, usuario(353, { roles: [{ id: 3, name: 'ENFERMERA' }] })),
    )

    const resultado = await asignarRol(353, 3)

    expect(urlPedida()).toBe('http://localhost:8080/user/353/role/3')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(resultado.roles).toEqual([{ id: 3, name: 'ENFERMERA' }])
  })

  it('deja pasar el motivo del 409 cuando el rol ya estaba asignado', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta(409, { message: 'El usuario ya cuenta con este rol', error: 'Error' }),
    )

    const error = await errorDe(asignarRol(353, 3))

    expect(error.status).toBe(409)
    expect(error.message).toBe('El usuario ya cuenta con este rol')
  })

  it('deja pasar el 404 diciendo qué id no existe', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta(404, {
        message: 'No se encontro el rol con id: 99',
        error: 'Recurso no encontrado',
      }),
    )

    const error = await errorDe(asignarRol(353, 99))

    expect(error.status).toBe(404)
    expect(error.message).toBe('No se encontro el rol con id: 99')
  })
})
