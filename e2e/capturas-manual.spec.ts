// Capturas para el Manual de Usuario (agenda, signos vitales, catálogos,
// acciones de una cita agendada y Mi perfil del paciente), tomadas del sitio
// desplegado. SOLO LECTURA: entra, navega y fotografía; no guarda, anula ni
// cambia nada. Se corre a mano, no forma parte de la batería:
//
//   E2E_BASE_URL=https://... npx playwright test e2e/capturas-manual.spec.ts
//
// Las cuentas salen del entorno (ver sesion.ts). Las imágenes quedan en
// CAPTURAS_DIR (por defecto, test-results/capturas-manual).
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { CUENTAS, entrar, entrarComoPaciente } from './sesion'

const SALIDA = process.env.CAPTURAS_DIR ?? path.join('test-results', 'capturas-manual')

// Paciente cuyo expediente ilustra la figura 52: su última toma tiene un valor
// fuera de rango y su histórico alcanza para dibujar la gráfica.
const PACIENTE_FIGURA_52 = process.env.CAPTURA_PACIENTE_ID ?? '2'

test.use({
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 2,
  locale: 'es-SV',
  timezoneId: 'America/El_Salvador',
})

/** Ancho de la barra lateral, para recortarla de la captura. */
async function bordeDeLaBarraLateral(page: import('@playwright/test').Page): Promise<number> {
  const caja = await page.locator('aside').first().boundingBox()
  return caja ? Math.ceil(caja.x + caja.width) : 0
}

test('figura 70: agenda semanal del médico en Mis citas', async ({ page }) => {
  await entrar(page, CUENTAS.medico)
  await page.goto('/agenda')

  const queVer = page.getByRole('group', { name: 'Qué citas ver' })
  await queVer.getByRole('button', { name: 'Mis citas' }).click()
  await page.getByRole('group', { name: 'Vista de la agenda' }).getByRole('button', { name: 'Semana' }).click()
  await expect(page.getByLabel('Citas de la semana')).toBeVisible()

  // La semana actual puede no tener citas: se retrocede hasta una que sí.
  const semanas = Number(process.env.CAPTURA_SEMANAS_ATRAS ?? '0')
  for (let i = 0; i < semanas; i++) {
    await page.getByRole('button', { name: 'Semana anterior' }).click()
    await page.waitForTimeout(800)
  }
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  const x = await bordeDeLaBarraLateral(page)
  // Se corta poco debajo de la tarjeta de la semana, sin el fondo vacío.
  const semana = await page.getByLabel('Citas de la semana').boundingBox()
  const alto = semana ? Math.ceil(semana.y + semana.height + 24) : 768
  await page.screenshot({
    path: path.join(SALIDA, 'figura70-agenda-semanal.png'),
    clip: { x, y: 0, width: 1366 - x, height: alto },
    fullPage: true,
  })
})

test('figura 52: últimos signos vitales y evolución de la presión arterial', async ({ page }) => {
  await entrar(page, CUENTAS.medico)
  await page.goto(`/pacientes/${PACIENTE_FIGURA_52}`)
  // La barra superior es fija: al desplazarse para fotografiar una tarjeta la
  // taparía. Para la captura se deja en su sitio.
  await page.addStyleTag({ content: 'header { position: static !important; }' })

  const ultimos = page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByRole('heading', { name: 'Últimos Signos Vitales' }) })
    .last()
  await expect(ultimos).toBeVisible()

  const evolucion = page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByRole('heading', { name: 'Evolución' }) })
    .last()
  await expect(evolucion).toBeVisible()
  await evolucion.getByRole('button', { name: '6 meses' }).click()
  await evolucion.getByRole('button', { name: 'Presión arterial' }).click()
  // El puntero sobre la gráfica abre su tooltip, que taparía los puntos.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(1500)

  const sufijo = `-paciente${PACIENTE_FIGURA_52}`
  await ultimos.screenshot({ path: path.join(SALIDA, `figura52-ultimos-signos${sufijo}.png`) })
  await evolucion.screenshot({ path: path.join(SALIDA, `figura52-evolucion${sufijo}.png`) })
})

test('catálogos: tipos de cita y tipos de hábito', async ({ page }) => {
  await entrar(page, CUENTAS.admin)
  await page.goto('/catalogos')
  await expect(page.getByRole('heading', { name: 'Catálogos', level: 1 })).toBeVisible()
  await expect(page.locator('section ul').first()).toBeVisible()
  await expect(page.locator('section ul').nth(1)).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.addStyleTag({ content: 'header { position: static !important; }' })

  const x = await bordeDeLaBarraLateral(page)
  const ultima = await page.locator('section').last().boundingBox()
  const primera = await page.locator('section').first().boundingBox()
  const fondo = Math.max(ultima ? ultima.y + ultima.height : 0, primera ? primera.y + primera.height : 0)
  await page.screenshot({
    path: path.join(SALIDA, 'catalogos.png'),
    clip: { x, y: 0, width: 1366 - x, height: Math.ceil(fondo + 24) },
    fullPage: true,
  })
})

// Cita AGENDADA ya pasada del médico demo: muestra «Iniciar consulta» y
// «No asistió». El diálogo de confirmación se abre y se cierra con «Volver»,
// sin confirmar nada.
test('acciones de una cita agendada: Iniciar consulta y No asistió', async ({ page }) => {
  await entrar(page, CUENTAS.medico)
  await page.goto('/agenda')
  await page.getByRole('group', { name: 'Qué citas ver' }).getByRole('button', { name: 'Mis citas' }).click()
  await page.getByRole('group', { name: 'Vista de la agenda' }).getByRole('button', { name: 'Día', exact: true }).click()
  await page.getByLabel('Día de la agenda').fill(process.env.CAPTURA_DIA_CITA ?? '2026-10-29')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)

  const cita = page
    .getByLabel('Citas del día')
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'No asistió' }) })
    .first()
  await expect(cita).toBeVisible()
  await expect(cita.getByRole('link', { name: 'Iniciar consulta' })).toBeVisible()
  await page.mouse.move(0, 0)
  await cita.screenshot({ path: path.join(SALIDA, 'cita-agendada-acciones.png') })

  // Solo se abre la confirmación: se fotografía y se cierra con «Volver».
  await cita.getByRole('button', { name: 'No asistió' }).click()
  const confirmar = cita.getByRole('group', { name: 'Confirmar inasistencia' })
  await expect(confirmar).toBeVisible()
  await page.mouse.move(0, 0)
  await cita.screenshot({ path: path.join(SALIDA, 'cita-agendada-confirmar-inasistencia.png') })
  await confirmar.getByRole('button', { name: 'Volver' }).click()
  await expect(cita.getByRole('button', { name: 'No asistió' })).toBeVisible()
})

test('Mi perfil del paciente: datos, recordatorios y hábitos', async ({ page }) => {
  await entrarComoPaciente(page, CUENTAS.paciente)
  await page.goto('/mi-perfil')
  await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
  await expect(page.getByRole('switch')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await page.addStyleTag({ content: 'header { position: static !important; }' })
  const x = await bordeDeLaBarraLateral(page)
  const ultima = await page.locator('section').last().boundingBox()
  await page.screenshot({
    path: path.join(SALIDA, 'mi-perfil.png'),
    clip: { x, y: 0, width: 1366 - x, height: Math.ceil((ultima ? ultima.y + ultima.height : 768) + 24) },
    fullPage: true,
  })
})
