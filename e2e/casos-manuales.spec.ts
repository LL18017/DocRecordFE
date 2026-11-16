// Casos del plan de pruebas que se ejecutaban a mano, automatizados (DRS-102).
//
// Corren contra el despliegue real (E2E_BASE_URL) con las cuentas demo, que se
// pasan SOLO por variables de entorno (ver `sesion.ts`). Ninguno crea ni
// modifica datos: se navega, se lee y se mide. La única petición de escritura
// (HU-16 CP005) es justo la que debe rechazarse, y va contra un paciente que no
// existe para que, si la guarda fallara, tampoco quede una toma registrada.
//
//   HU-06 CP004  cerrar sesión y volver atrás no muestra datos clínicos
//   HU-16 CP005  el paciente no puede registrar signos vitales (UI y API)
//   HU-18 CP005  la gráfica de evolución cabe en un teléfono de 360 px
//   HU-31 CP001  la agenda abre en el día de hoy y en orden de hora
//   TT-04 CP005  la enfermera llega al panel y a su lista de tomas
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { CUENTAS, entrar, entrarComoPaciente } from './sesion'

const CARPETA = path.join('test-results', 'manuales')

// La API vive bajo /api del mismo dominio en el despliegue; se puede cambiar
// con E2E_API_URL si se corre contra otro entorno.
const API = process.env.E2E_API_URL ?? `${process.env.E2E_BASE_URL ?? 'http://localhost:8080'}/api`

/** Guarda la captura en el informe y en una carpeta fija para la evidencia. */
async function capturar(page: Page, testInfo: TestInfo, nombre: string, fullPage = true) {
  fs.mkdirSync(CARPETA, { recursive: true })
  const ruta = path.join(CARPETA, `${nombre}.png`)
  await page.screenshot({ path: ruta, fullPage })
  await testInfo.attach(nombre, { path: ruta, contentType: 'image/png' })
}

/** Abre el primer expediente de la lista y devuelve nombre y DUI mostrados. */
async function abrirPrimerExpediente(page: Page) {
  await page.goto('/pacientes')
  const fila = page.locator('tbody tr').first()
  await expect(fila, 'La lista de pacientes está vacía en la sede').toBeVisible()
  await fila.click()
  await page.waitForURL(/\/pacientes\/\d+/)
  await expect(page.getByRole('heading', { level: 1, name: /expediente del paciente/i })).toBeVisible()
  // La línea «Nombre · DUI: 00000000-0» que va debajo del título.
  const linea = (await page.getByText(/· DUI:/).first().innerText()).trim()
  const [nombre, dui] = linea.split('· DUI:').map((s) => s.trim())
  return { nombre, dui, url: page.url() }
}

test.describe('Casos manuales del plan, contra producción', () => {
  test('HU-06 CP004 · tras cerrar sesión, Atrás no muestra el expediente', async ({ page }, testInfo) => {
    await entrar(page, CUENTAS.medico)
    const { nombre, dui } = await abrirPrimerExpediente(page)
    await capturar(page, testInfo, 'hu06-cp004-1-expediente-abierto')

    // El botón real del menú de usuario, no un borrado del almacenamiento: lo
    // que se prueba es lo que hace el usuario.
    await page.getByRole('button', { name: 'Menú de usuario' }).click()
    await page.getByRole('button', { name: /cerrar sesión/i }).click()
    await page.waitForURL('**/login')

    await page.goBack()
    // Se mira dos veces: justo al volver (lo que puede quedar en la caché del
    // navegador) y cuando la guarda ya terminó de decidir.
    await page.waitForTimeout(500)
    await expect(page.getByText(nombre, { exact: false })).toHaveCount(0)
    await expect(page.getByText(dui, { exact: false })).toHaveCount(0)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel(/correo electrónico/i)).toBeVisible()
    await expect(page.getByText(nombre, { exact: false })).toHaveCount(0)
    await expect(page.getByText(dui, { exact: false })).toHaveCount(0)
    testInfo.annotations.push({ type: 'observado', description: `Tras Atrás: ${page.url()}; sin «${nombre}» ni DUI ${dui}` })
    await capturar(page, testInfo, 'hu06-cp004-2-tras-atras')
  })

  test('HU-16 CP005 · el paciente no puede registrar signos vitales', async ({ page, request }, testInfo) => {
    await entrarComoPaciente(page, CUENTAS.paciente)

    // (a) Por la interfaz: la guarda de rutas debe sacarlo de /enfermeria.
    await page.goto('/enfermeria')
    await expect(page).not.toHaveURL(/\/enfermeria/)
    await expect(page.getByRole('heading', { level: 1, name: /signos vitales/i })).toHaveCount(0)
    const destino = page.url()
    await capturar(page, testInfo, 'hu16-cp005-1-redirigido')

    // (b) Por la API, saltándose la interfaz: es la guarda que de verdad
    // importa. El paciente 999999999 no existe, así que si el rol no se
    // comprobara la respuesta sería 404/400 —un defecto visible— y nunca una
    // toma creada sobre un paciente real.
    const token = await page.evaluate(() => window.sessionStorage.getItem('docrecord.token'))
    expect(token, 'No hay token en sessionStorage').toBeTruthy()
    const respuesta = await request.post(`${API}/signos-vitales`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { pacienteId: 999999999, pulsoLpm: 72 },
    })
    const cuerpo = (await respuesta.text()).slice(0, 300)
    testInfo.annotations.push({
      type: 'observado',
      description: `/enfermeria → ${destino}; POST ${API}/signos-vitales → ${respuesta.status()} ${cuerpo}`,
    })
    expect(respuesta.status(), `Respuesta: ${cuerpo}`).toBe(403)
  })

  test('HU-18 CP005 · la gráfica de evolución cabe a 360 px', async ({ page, request }, testInfo) => {
    await entrar(page, CUENTAS.medico)

    // El primer paciente de la lista puede no tener tomas, y entonces la
    // tarjeta muestra el aviso de «faltan datos» en vez de la gráfica: medir
    // eso no prueba nada. Se elige, leyendo la API (solo GET), el paciente con
    // más tomas activas, que es el que de verdad dibuja una serie.
    const token = await page.evaluate(() => window.sessionStorage.getItem('docrecord.token'))
    const resp = await request.get(`${API}/signos-vitales?pagina=0&tamano=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(resp.status()).toBe(200)
    const pagina = (await resp.json()) as {
      contenido: { estado: string; paciente: { personaId: number; nombres: string; apellidos: string } }[]
    }
    const porPaciente = new Map<number, { n: number; nombre: string }>()
    for (const t of pagina.contenido) {
      if (t.estado !== 'ACTIVA') continue
      const previo = porPaciente.get(t.paciente.personaId)
      porPaciente.set(t.paciente.personaId, {
        n: (previo?.n ?? 0) + 1,
        nombre: `${t.paciente.nombres} ${t.paciente.apellidos}`,
      })
    }
    const [personaId, elegido] = [...porPaciente.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? []
    expect(elegido?.n ?? 0, 'Ningún paciente tiene dos tomas activas para graficar').toBeGreaterThanOrEqual(2)
    const nombre = `${elegido!.nombre} (${elegido!.n} tomas)`

    // Se abre directamente al ancho de teléfono: lo que se mide es cómo pinta
    // la pantalla en ese ancho, no cómo se encoge una ya dibujada.
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto(`/pacientes/${personaId}`)
    const titulo = page.getByRole('heading', { level: 3, name: /^evolución$/i })
    await expect(titulo).toBeVisible()
    // La tarjeta es el contenedor redondeado que envuelve al título.
    const tarjeta = page.locator('div.rounded-2xl', { has: titulo }).last()
    await tarjeta.scrollIntoViewIfNeeded()
    await expect(tarjeta).toBeVisible()

    const caja = await tarjeta.boundingBox()
    expect(caja).not.toBeNull()
    const anchoPagina = await page.evaluate(() => document.documentElement.scrollWidth)
    const tieneGrafica = (await tarjeta.locator('svg.recharts-surface').count()) > 0
    const sinDatos = await tarjeta.getByRole('status').count()
    testInfo.annotations.push({
      type: 'observado',
      description:
        `Paciente ${nombre}: tarjeta x=${caja!.x.toFixed(1)} ancho=${caja!.width.toFixed(1)} ` +
        `(derecha ${(caja!.x + caja!.width).toFixed(1)}), scrollWidth=${anchoPagina}, ` +
        `svg=${tieneGrafica}, aviso de pocos datos=${sinDatos > 0}`,
    })
    await tarjeta.screenshot({ path: path.join(CARPETA, 'hu18-cp005-grafica-360.png') })
    await testInfo.attach('hu18-cp005-grafica-360', {
      path: path.join(CARPETA, 'hu18-cp005-grafica-360.png'),
      contentType: 'image/png',
    })
    // Un píxel de tolerancia por redondeo de subpíxeles.
    expect(caja!.width).toBeLessThanOrEqual(361)
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(361)
    expect(anchoPagina).toBeLessThanOrEqual(361)
    expect(tieneGrafica, 'La tarjeta no dibuja ninguna gráfica (svg)').toBe(true)
  })

  test('HU-31 CP001 · la agenda abre hoy y en orden de hora', async ({ page }, testInfo) => {
    await entrar(page, CUENTAS.medico)
    await page.goto('/agenda')
    await expect(page.getByRole('heading', { level: 1, name: /agenda de citas/i })).toBeVisible()

    // Hoy en El Salvador, calculado aquí y no en el navegador: si ambos
    // usaran la misma función, un error de zona horaria pasaría inadvertido.
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(new Date())
    await expect(page.getByLabel('Día de la agenda')).toHaveValue(hoy)

    const lista = page.getByRole('list', { name: 'Citas del día' })
    // Espera a que termine la carga: o aparece la lista o un estado vacío.
    await page.waitForLoadState('networkidle')
    const filas = lista.locator(':scope > li[aria-label^="Cita de"]')
    const etiquetas = (await lista.count()) > 0 ? await filas.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '')) : []
    const horas = etiquetas.map((e) => e.match(/a las (\d{2}:\d{2})/)?.[1] ?? '')
    await capturar(page, testInfo, 'hu31-cp001-agenda-hoy')

    testInfo.annotations.push({ type: 'observado', description: `Día=${hoy}; ${horas.length} citas: ${horas.join(', ') || '(ninguna)'}` })
    if (horas.length === 0) {
      // Sin citas no hay orden que comprobar: no se da por exitoso.
      test.info().annotations.push({ type: 'no concluyente', description: `No hay citas el ${hoy}` })
      test.skip(true, `No concluyente: no hay citas el ${hoy} para comprobar el orden`)
    }
    expect(horas.every(Boolean), `Etiquetas sin hora: ${etiquetas.join(' | ')}`).toBe(true)
    expect(horas).toEqual([...horas].sort())
  })

  test('TT-04 CP005 · la enfermera llega al panel y a su lista de tomas', async ({ page }, testInfo) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    await entrar(page, CUENTAS.enfermera)
    await expect(page).toHaveURL(/\/dashboard/)
    await capturar(page, testInfo, 'tt04-cp005-1-dashboard')

    await page.goto('/enfermeria')
    await expect(page.getByRole('heading', { level: 1, name: /signos vitales/i })).toBeVisible()
    await page.waitForLoadState('networkidle')
    // Ni un aviso de error de la pantalla ni una excepción de JavaScript.
    const alertas = await page.getByRole('alert').allInnerTexts()
    const filas = await page.locator('tbody tr').count()
    testInfo.annotations.push({
      type: 'observado',
      description: `Filas de tomas=${filas}; alertas=${JSON.stringify(alertas)}; errores JS=${JSON.stringify(errores)}`,
    })
    await capturar(page, testInfo, 'tt04-cp005-2-enfermeria')
    expect(alertas.filter((t) => /error|no se pud/i.test(t))).toEqual([])
    expect(errores).toEqual([])
  })
})
