// HU-03 · Acceso diferenciado por rol — comprobado en un navegador real.
//
// Por qué en Playwright y no solo en Vitest: el criterio 2 dice literalmente
// «cuando escribo manualmente la URL /consultas». Una prueba de componente
// simula la ruta con un mock de `usePathname`; solo un navegador de verdad
// escribe una URL, dispara la navegación de Next y deja ver qué pasa después.
//
// Las dos pruebas del final cubren el otro lado del criterio 3: que el 403 del
// servidor exista de verdad y no solo la guarda del cliente. Son capas
// distintas y el documento las separa a propósito —una guarda de cliente se
// salta con las herramientas de desarrollo abiertas—.
import { expect, test } from '@playwright/test'
import { CUENTAS, entrar } from './sesion'

// Los titulos se buscan con `level: 1`: la barra superior repite el nombre de
// la pantalla en un h2, asi que sin el nivel la consulta casa con dos elementos
// y Playwright la rechaza por ambigua.

test.describe('HU-03 · criterio 1 · el menú ofrece solo lo que el rol puede usar', () => {
  test('la enfermera ve Signos vitales y no ve Consultas ni Usuarios', async ({ page }) => {
    await entrar(page, CUENTAS.enfermera)

    const menu = page.getByRole('navigation')
    await expect(menu.getByRole('link', { name: /signos vitales/i })).toBeVisible()
    await expect(menu.getByRole('link', { name: /consultas médicas/i })).toBeHidden()
    await expect(menu.getByRole('link', { name: /usuarios y roles/i })).toBeHidden()
  })
})

test.describe('HU-03 · criterio 2 · la URL escrita a mano no abre lo prohibido', () => {
  test('la enfermera que escribe /consultas vuelve al panel', async ({ page }) => {
    await entrar(page, CUENTAS.enfermera)

    await page.goto('/consultas')

    await expect(page).toHaveURL(/\/dashboard$/)
    // No basta con acabar en el panel: la pantalla prohibida no puede haberse
    // pintado por el camino, porque al montarse habría pedido sus datos.
    await expect(page.getByRole('heading', { level: 1, name: /consultas médicas/i })).toBeHidden()
  })

  test('tampoco le abre /usuarios', async ({ page }) => {
    await entrar(page, CUENTAS.enfermera)

    await page.goto('/usuarios')

    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('al médico sí le abre /consultas', async ({ page }) => {
    // El lado positivo importa tanto como el negativo: una guarda que bloquea
    // todo también pasaría las dos pruebas de arriba.
    await entrar(page, CUENTAS.medico)

    await page.goto('/consultas')

    await expect(page).toHaveURL(/\/consultas$/)
    await expect(page.getByRole('heading', { level: 1, name: /consultas médicas/i })).toBeVisible()
  })
})

test.describe('HU-03 · criterio 4 · sin sesión no se entra a ninguna ruta interna', () => {
  test('abrir /pacientes sin haber entrado lleva a /login', async ({ page }) => {
    await page.goto('/pacientes')

    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('HU-03 · criterio 3 · la capa que de verdad protege es el servidor', () => {
  test('el backend rechaza con 403 aunque se salte la guarda del navegador', async ({
    page,
    request,
  }) => {
    // Se pide el token de la sesión de la enfermera y se llama al endpoint
    // directamente, sin pasar por la interfaz: es lo que haría alguien con las
    // herramientas de desarrollo abiertas.
    await entrar(page, CUENTAS.enfermera)
    const token = await page.evaluate(() => window.sessionStorage.getItem('docrecord.token'))
    expect(token, 'No se encontró el token en sessionStorage').toBeTruthy()

    const respuesta = await request.post('http://localhost:8080/consultas', {
      headers: { Authorization: `Bearer ${token}` },
      data: { pacienteId: 4, motivo: 'Intento desde una sesión de enfermería' },
    })

    expect(respuesta.status()).toBe(403)
  })
})

test.describe('HU-08 · criterio 2 · la URL del expediente es compartible', () => {
  test('abrir /pacientes/{id} directamente carga ese expediente', async ({ page }) => {
    // Esta prueba existe por la guarda de HU-03: `/pacientes/5` es una ruta
    // dinámica y una tabla de permisos que case por igualdad exacta la dejaría
    // fuera, rompiendo un criterio que ya estaba cumplido.
    await entrar(page, CUENTAS.medico)

    await page.goto('/pacientes/4')

    await expect(page).toHaveURL(/\/pacientes\/4$/)
    await expect(page.getByRole('heading', { level: 1, name: /expediente del paciente/i })).toBeVisible()
  })

  test('un identificador inexistente explica qué pasó, no deja la pantalla en blanco', async ({
    page,
  }) => {
    await entrar(page, CUENTAS.medico)

    await page.goto('/pacientes/999999')

    await expect(page.getByText(/no encontrado|no existe/i).first()).toBeVisible()
  })
})
