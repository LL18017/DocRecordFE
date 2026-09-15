// Guardas del servicio de autenticación: mapeo de roles y mensajes de login.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapearRoles } from './auth'

function roles(...nombres: string[]): { name: string }[] {
  return nombres.map((name) => ({ name }))
}

describe('mapearRoles · prefijo ROLE_ del backend', () => {
  it('reconoce los roles tal como llegan del backend, con prefijo ROLE_', () => {
    // Spring Security antepone ROLE_ a cada authority. Si el adaptador dejara
    // de quitar ese prefijo, TODO usuario caería al rol por defecto y un
    // administrador perdería su menú sin que nada falle a la vista.
    expect(mapearRoles(roles('ROLE_ADMIN'))).toEqual(['Administrador'])
    expect(mapearRoles(roles('ROLE_MEDICO'))).toEqual(['medico'])
    expect(mapearRoles(roles('ROLE_ENFERMERA'))).toEqual(['enfermera'])
  })

  it('reconoce los roles también sin el prefijo', () => {
    expect(mapearRoles(roles('ADMIN'))).toEqual(['Administrador'])
    expect(mapearRoles(roles('ENFERMERA'))).toEqual(['enfermera'])
    expect(mapearRoles(roles('MEDICO'))).toEqual(['medico'])
  })

  it('acepta DOCTOR como sinónimo de MEDICO', () => {
    expect(mapearRoles(roles('ROLE_DOCTOR'))).toEqual(['medico'])
  })

  it('no depende de mayúsculas en el nombre del rol', () => {
    expect(mapearRoles(roles('ROLE_Admin'))).toEqual(['Administrador'])
    expect(mapearRoles(roles('ROLE_admin'))).toEqual(['Administrador'])
    expect(mapearRoles(roles('admin'))).toEqual(['Administrador'])
    expect(mapearRoles(roles('ROLE_Enfermera'))).toEqual(['enfermera'])
  })

  /**
   * Regresión corregida: `r.name.replace(/^ROLE_/, '').toUpperCase()`
   * normalizaba en el orden equivocado —quitaba el prefijo ANTES de subir a
   * mayúsculas, y `/^ROLE_/` no lleva la bandera `i`—, así que con
   * 'role_admin' el prefijo se quedaba puesto, quedaba 'ROLE_ADMIN' y no
   * coincidía con 'ADMIN'. Un administrador se convertía en 'medico' en
   * silencio: sin error, sin aviso, solo un menú incompleto, con que el
   * backend cambiara el case de sus authorities.
   */
  it('reconoce el prefijo ROLE_ venga en el case que venga', () => {
    expect(mapearRoles(roles('role_admin'))).toEqual(['Administrador'])
    expect(mapearRoles(roles('rOlE_eNfErMeRa'))).toEqual(['enfermera'])
    expect(mapearRoles(roles('Role_Doctor'))).toEqual(['medico'])
    // Y no se traga un prefijo que no lo es: 'ROLES_ADMIN' no es 'ADMIN'.
    expect(mapearRoles(roles('ROLES_ADMIN'))).toEqual(['medico'])
  })

  it('cae al rol por defecto ante un rol desconocido', () => {
    expect(mapearRoles(roles('ROLE_RECEPCION'))).toEqual(['medico'])
    expect(mapearRoles(roles('ROLE_RECEPCION'), 'enfermera')).toEqual(['enfermera'])
  })

  it('cae al rol por defecto con la lista de roles vacía', () => {
    expect(mapearRoles([])).toEqual(['medico'])
    expect(mapearRoles([], 'Administrador')).toEqual(['Administrador'])
  })

  it('devuelve TODOS los roles que tenga la cuenta, no solo ADMIN', () => {
    // Antes ADMIN «ganaba» y el resultado se colapsaba a un solo rol: una
    // cuenta ADMIN+MEDICO perdía el rol de médico —y con él, el menú
    // clínico— en cuanto ganaba ADMIN. No hay jerarquía real entre ellos, así
    // que ahora se devuelven los dos.
    expect(mapearRoles(roles('ROLE_MEDICO', 'ROLE_ADMIN'))).toEqual(['Administrador', 'medico'])
    expect(mapearRoles(roles('ROLE_ADMIN', 'ROLE_ENFERMERA'))).toEqual([
      'Administrador',
      'enfermera',
    ])
  })
})

describe('login · mensajes y tokens', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.sessionStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  function respuesta(status: number, cuerpo?: unknown): Response {
    return new Response(cuerpo === undefined ? '' : JSON.stringify(cuerpo), { status })
  }

  /** Espera el rechazo y devuelve el error. Falla si la promesa se resuelve. */
  async function errorDe(promesa: Promise<unknown>): Promise<Error> {
    try {
      await promesa
    } catch (e) {
      return e as Error
    }
    throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
  }

  it('guarda ambos tokens y devuelve el usuario con sus roles', async () => {
    const { login } = await import('./auth')
    fetchMock.mockResolvedValueOnce(
      respuesta(200, {
        userName: 'ana@ues.edu.sv',
        token: 'access-1',
        refreshToken: 'refresh-1',
        roles: [{ id: 1, name: 'ROLE_ADMIN' }],
      }),
    )

    const usuario = await login('ana@ues.edu.sv', 'secreta')

    expect(usuario).toEqual({
      name: 'ana@ues.edu.sv',
      email: 'ana@ues.edu.sv',
      roles: ['Administrador'],
    })
    // Sin el refresh token guardado, la renovación automática del 401 nunca
    // se dispararía y la sesión moriría al expirar el access token.
    expect(window.sessionStorage.getItem('docrecord.token')).toBe('access-1')
    expect(window.sessionStorage.getItem('docrecord.refreshToken')).toBe('refresh-1')
  })

  it('unifica 401 y 404 en un mismo mensaje: no revela qué correos existen', async () => {
    const { login } = await import('./auth')
    const { ApiError } = await import('@/lib/api')

    fetchMock.mockResolvedValueOnce(respuesta(401, { error: 'Bad credentials' }))
    const porClave = await errorDe(login('ana@ues.edu.sv', 'mala'))

    fetchMock.mockResolvedValueOnce(respuesta(404, { error: 'Registro no encontrado' }))
    const porCorreo = await errorDe(login('nadie@ues.edu.sv', 'x'))

    expect(porClave).toBeInstanceOf(ApiError)
    expect(porCorreo).toBeInstanceOf(ApiError)

    // Distinguir «ese correo no existe» de «esa clave es incorrecta» permite
    // enumerar las cuentas registradas del sistema. Los dos casos deben ser
    // indistinguibles para quien está al otro lado.
    expect(porClave.message).toBe('Correo o contraseña incorrectos.')
    expect(porCorreo.message).toBe(porClave.message)
    expect(porCorreo.message).not.toMatch(/no encontrado|not found/i)
  })

  it('no guarda tokens si el login falla', async () => {
    const { login } = await import('./auth')
    fetchMock.mockResolvedValueOnce(respuesta(401, { error: 'Bad credentials' }))

    await expect(login('ana@ues.edu.sv', 'mala')).rejects.toThrow()

    expect(window.sessionStorage.getItem('docrecord.token')).toBeNull()
  })

  it('deja pasar los errores que no son de credenciales con su mensaje original', async () => {
    const { login } = await import('./auth')
    fetchMock.mockResolvedValueOnce(respuesta(500, { error: 'Falló la base de datos' }))

    const error = await errorDe(login('ana@ues.edu.sv', 'secreta'))

    // Un 500 no es «contraseña incorrecta»: decirle eso al usuario lo manda a
    // reescribir su clave una y otra vez contra un servidor roto.
    expect(error.message).not.toBe('Correo o contraseña incorrectos.')
    expect(error.message).toBe('Falló la base de datos')
  })

  it('inicia sesión sin mandar Authorization (el endpoint es público)', async () => {
    const { login } = await import('./auth')
    fetchMock.mockResolvedValueOnce(
      respuesta(200, { userName: 'a@b.sv', token: 't', refreshToken: 'r', roles: [] }),
    )

    await login('a@b.sv', 'x')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.sv', password: 'x' }))
  })
})
