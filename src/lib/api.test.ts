// Guardas del cliente HTTP: renovación de token en 401 y traducción de errores.
//
// `lib/api.ts` guarda estado a nivel de módulo (el token en memoria y la
// renovación en curso), así que cada prueba reimporta el módulo limpio con
// `vi.resetModules()` en vez de compartir instancia.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ModuloApi = typeof import('./api')

const BASE = 'http://localhost:8080'

async function cargarApi(): Promise<ModuloApi> {
  vi.resetModules()
  return import('./api')
}

/** Respuesta HTTP real; `apiFetch` usa `.ok`, `.status`, `.text()` y `.json()`. */
function respuesta(status: number, cuerpo?: unknown): Response {
  const texto =
    cuerpo === undefined ? '' : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  return new Response(status === 204 || status === 205 ? null : texto, { status })
}

/** URL pedida en la llamada `n` (0-based) del mock de fetch. */
function urlDeLlamada(mock: ReturnType<typeof vi.fn>, n: number): string {
  return String(mock.mock.calls[n][0])
}

function cabeceraDeLlamada(mock: ReturnType<typeof vi.fn>, n: number, nombre: string): string | null {
  const init = mock.mock.calls[n][1] as RequestInit | undefined
  return new Headers(init?.headers).get(nombre)
}

function llamadasA(mock: ReturnType<typeof vi.fn>, fragmento: string): number {
  return mock.mock.calls.filter((c) => String(c[0]).includes(fragmento)).length
}

/** Espera el rechazo y devuelve el `ApiError`. Falla si la promesa se resuelve. */
async function errorDe(promesa: Promise<unknown>): Promise<InstanceType<ModuloApi['ApiError']>> {
  try {
    await promesa
  } catch (e) {
    return e as InstanceType<ModuloApi['ApiError']>
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
}

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

describe('apiFetch · renovación de token en 401', () => {
  it('renueva una vez y reintenta la petición original con el token nuevo', async () => {
    const api = await cargarApi()
    api.setTokens('token-viejo', 'refresh-1')

    fetchMock
      .mockResolvedValueOnce(respuesta(401, { error: 'expirado' }))
      .mockResolvedValueOnce(respuesta(200, { token: 'token-nuevo', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(respuesta(200, [{ personaId: 1 }]))

    const datos = await api.apiFetch<{ personaId: number }[]>('/pacientes')

    // La petición se reintentó y quien llama recibe el resultado bueno, no el 401.
    expect(datos).toEqual([{ personaId: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(3)

    expect(urlDeLlamada(fetchMock, 0)).toBe(`${BASE}/pacientes`)
    expect(urlDeLlamada(fetchMock, 1)).toBe(`${BASE}/auth/refresh`)
    expect(urlDeLlamada(fetchMock, 2)).toBe(`${BASE}/pacientes`)

    // El reintento debe llevar el token NUEVO; con el viejo volvería a dar 401.
    expect(cabeceraDeLlamada(fetchMock, 0, 'Authorization')).toBe('Bearer token-viejo')
    expect(cabeceraDeLlamada(fetchMock, 2, 'Authorization')).toBe('Bearer token-nuevo')

    // La renovación se autentica con el refresh token, no con el access token.
    expect(cabeceraDeLlamada(fetchMock, 1, 'Authorization')).toBe('Bearer refresh-1')
  })

  it('reintenta una sola vez: un 401 en el reintento no entra en bucle', async () => {
    const api = await cargarApi()
    api.setTokens('t1', 'refresh-1')

    fetchMock
      .mockResolvedValueOnce(respuesta(401))
      .mockResolvedValueOnce(respuesta(200, { token: 't2', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(respuesta(401, { error: 'sigue sin valer' }))

    await expect(api.apiFetch('/pacientes')).rejects.toThrow(api.ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(llamadasA(fetchMock, '/auth/refresh')).toBe(1)
  })

  it('conserva método y cuerpo al reintentar', async () => {
    const api = await cargarApi()
    api.setTokens('t1', 'refresh-1')

    fetchMock
      .mockResolvedValueOnce(respuesta(401))
      .mockResolvedValueOnce(respuesta(200, { token: 't2', refreshToken: 'r2' }))
      .mockResolvedValueOnce(respuesta(200, { personaId: 9 }))

    await api.apiFetch('/pacientes', { method: 'POST', body: { tipoSangre: 'O+' } })

    const reintento = fetchMock.mock.calls[2][1] as RequestInit
    expect(reintento.method).toBe('POST')
    expect(reintento.body).toBe(JSON.stringify({ tipoSangre: 'O+' }))
  })
})

describe('apiFetch · deduplicación de la renovación', () => {
  it('llama a /auth/refresh UNA sola vez aunque dos peticiones reciban 401 a la vez', async () => {
    const api = await cargarApi()
    api.setTokens('token-viejo', 'refresh-1')

    // La renovación queda "en vuelo" hasta que la prueba la resuelve a mano;
    // así ambas peticiones están garantizadamente dentro del 401 al mismo
    // tiempo, que es justo la condición que la deduplicación debe cubrir.
    let resolverRenovacion!: (r: Response) => void
    const renovacionEnVuelo = new Promise<Response>((resolve) => {
      resolverRenovacion = resolve
    })

    fetchMock.mockImplementation((url: string) => {
      const ruta = String(url)
      if (ruta.endsWith('/auth/refresh')) return renovacionEnVuelo
      // Antes de renovar: 401. Después: 200.
      return Promise.resolve(
        api.getToken() === 'token-nuevo' ? respuesta(200, { ok: ruta }) : respuesta(401),
      )
    })

    const ambas = Promise.all([api.apiFetch('/pacientes'), api.apiFetch('/especialidades')])

    // Dejar correr los microtasks para que las dos lleguen al 401 y pidan renovar.
    await vi.waitFor(() => {
      expect(llamadasA(fetchMock, '/auth/refresh')).toBeGreaterThan(0)
    })

    resolverRenovacion(respuesta(200, { token: 'token-nuevo', refreshToken: 'refresh-2' }))
    const [a, b] = await ambas

    // Lo que de verdad se protege: con rotación de refresh token, una segunda
    // llamada a /auth/refresh usaría un token que la primera ya invalidó y
    // tumbaría la sesión del usuario.
    expect(llamadasA(fetchMock, '/auth/refresh')).toBe(1)

    // Y aun así ambas peticiones se reintentaron y salieron bien.
    expect(a).toEqual({ ok: `${BASE}/pacientes` })
    expect(b).toEqual({ ok: `${BASE}/especialidades` })
    expect(llamadasA(fetchMock, '/pacientes')).toBe(2)
    expect(llamadasA(fetchMock, '/especialidades')).toBe(2)
  })
})

describe('apiFetch · cuándo NO se renueva', () => {
  it('un 401 en /auth/login no dispara renovación', async () => {
    const api = await cargarApi()
    // Aun habiendo tokens guardados de una sesión anterior.
    api.setTokens('t1', 'refresh-1')

    fetchMock.mockResolvedValueOnce(respuesta(401, { error: 'Bad credentials' }))

    await expect(
      api.apiFetch('/auth/login', { method: 'POST', auth: false, body: { email: 'a@b.sv' } }),
    ).rejects.toThrow(api.ApiError)

    // Un 401 al iniciar sesión es "contraseña incorrecta", no "sesión vencida":
    // renovar aquí mostraría un error raro en vez del mensaje de credenciales.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(llamadasA(fetchMock, '/auth/refresh')).toBe(0)
  })

  it('un 401 sin refresh token guardado no llama a /auth/refresh', async () => {
    const api = await cargarApi()
    fetchMock.mockResolvedValueOnce(respuesta(401))

    await expect(api.apiFetch('/pacientes')).rejects.toThrow(api.ApiError)

    expect(llamadasA(fetchMock, '/auth/refresh')).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('apiFetch · la renovación falla', () => {
  it('limpia la sesión y avisa al oyente cuando /auth/refresh no responde ok', async () => {
    const api = await cargarApi()
    api.setTokens('t1', 'refresh-1')

    const alExpirar = vi.fn()
    api.alExpirarSesion(alExpirar)

    fetchMock
      .mockResolvedValueOnce(respuesta(401))
      .mockResolvedValueOnce(respuesta(401, { error: 'refresh vencido' }))

    await expect(api.apiFetch('/pacientes')).rejects.toThrow(api.ApiError)

    // Sesión limpia: ni en memoria ni en sessionStorage queda rastro. Si no se
    // limpiara, la app seguiría creyéndose autenticada y reintentando en bucle.
    expect(api.getToken()).toBeNull()
    expect(api.getRefreshToken()).toBeNull()
    expect(window.sessionStorage.getItem('docrecord.token')).toBeNull()
    expect(window.sessionStorage.getItem('docrecord.refreshToken')).toBeNull()

    // Y AppContext se entera para poder redirigir a /login.
    expect(alExpirar).toHaveBeenCalledTimes(1)

    // No se reintentó la petición original.
    expect(llamadasA(fetchMock, '/pacientes')).toBe(1)
  })

  it('limpia la sesión también si /auth/refresh cae por red', async () => {
    const api = await cargarApi()
    api.setTokens('t1', 'refresh-1')

    fetchMock
      .mockResolvedValueOnce(respuesta(401))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(api.apiFetch('/pacientes')).rejects.toThrow(api.ApiError)

    expect(api.getToken()).toBeNull()
  })
})

describe('apiFetch · traducción de errores', () => {
  it('distingue un fallo de red de un error del servidor', async () => {
    const api = await cargarApi()

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const red = await errorDe(api.apiFetch('/pacientes'))

    fetchMock.mockResolvedValueOnce(respuesta(500))
    const servidor = await errorDe(api.apiFetch('/pacientes'))

    expect(red).toBeInstanceOf(api.ApiError)
    expect(servidor).toBeInstanceOf(api.ApiError)

    // El backend caído y el backend que revienta son problemas distintos y el
    // usuario tiene que poder distinguirlos: uno se arregla levantando el
    // servidor, el otro no.
    expect(red.message).not.toBe(servidor.message)
    expect(red.status).toBe(0)
    expect(servidor.status).toBe(500)
    expect(red.message).toMatch(/no se pudo contactar/i)
  })

  it('prefiere el mensaje del backend (ErrorResponseDTO) sobre el genérico', async () => {
    const api = await cargarApi()
    fetchMock.mockResolvedValueOnce(
      respuesta(422, { error: 'fechaNacimiento es obligatorio', code: 'VALIDACION' }),
    )

    const error = await errorDe(api.apiFetch('/pacientes', { method: 'POST', body: {} }))

    // Si esto se pierde, el usuario ve "Error del servidor (422)" y nunca se
    // entera de qué campo le falta.
    expect(error.message).toBe('fechaNacimiento es obligatorio')
    expect(error.status).toBe(422)
  })

  it('cae a un mensaje legible cuando el cuerpo del error no es JSON', async () => {
    const api = await cargarApi()
    fetchMock.mockResolvedValueOnce(respuesta(403, '<html>Forbidden</html>'))

    const error = await errorDe(api.apiFetch('/pacientes'))

    expect(error.message).toBe('No tiene permisos para realizar esta acción.')
  })
})

describe('apiFetch · forma de la petición y de la respuesta', () => {
  it('no manda Content-Type cuando no hay cuerpo', async () => {
    const api = await cargarApi()
    fetchMock.mockResolvedValueOnce(respuesta(200, []))

    await api.apiFetch('/pacientes')

    expect(cabeceraDeLlamada(fetchMock, 0, 'Content-Type')).toBeNull()
    expect(cabeceraDeLlamada(fetchMock, 0, 'Accept')).toBe('application/json')
  })

  it('no manda Authorization en endpoints públicos', async () => {
    const api = await cargarApi()
    api.setTokens('t1', 'r1')
    fetchMock.mockResolvedValueOnce(respuesta(200, {}))

    await api.apiFetch('/auth/register', { method: 'POST', auth: false, body: {} })

    expect(cabeceraDeLlamada(fetchMock, 0, 'Authorization')).toBeNull()
  })

  it('devuelve undefined en un 204 sin intentar deserializar', async () => {
    const api = await cargarApi()
    fetchMock.mockResolvedValueOnce(respuesta(204))

    await expect(api.apiFetch('/pacientes/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('devuelve texto plano cuando la respuesta no es JSON (p. ej. /auth/confirm)', async () => {
    const api = await cargarApi()
    fetchMock.mockResolvedValueOnce(respuesta(200, 'Cuenta confirmada'))

    await expect(api.apiFetch<string>('/auth/confirm?token=x')).resolves.toBe('Cuenta confirmada')
  })
})
