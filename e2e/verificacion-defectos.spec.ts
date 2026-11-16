// Verificación en producción de las correcciones de DEF-01, DEF-02, DEF-03 y
// DEF-07 (DRS-102).
//
// SOLO LECTURA. Corren contra el despliegue real (E2E_BASE_URL) con las cuentas
// demo, pasadas SOLO por variables de entorno (ver `sesion.ts`). Ninguna prueba
// guarda, edita, anula ni borra: se navega, se abren diálogos que se cierran sin
// confirmar y se leen datos con GET. Cada prueba vigila además las peticiones
// que salen del navegador y falla si alguna escribe en la API (fuera del login y
// del refresco de sesión), para que una regresión no deje datos tocados sin que
// nadie se entere.
//
//   DEF-01  HU-14 CP001 / HU-30 CP004  catálogos sembrados y selector de la agenda
//   DEF-02  HU-16 CP003                «Valor crítico» rojo y «Fuera de rango» ámbar
//   DEF-03  HU-14                      el hábito se anula, no se borra
//   DEF-07  HU-33 CP004 / HU-14 CP004  «Mi perfil» del paciente
//   A11y    axe WCAG AA (contraste, etiquetas) y sin desborde a 360 y 1280 px
import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Request, type TestInfo } from '@playwright/test'
import { CUENTAS, entrar, entrarComoPaciente } from './sesion'

const CARPETA = path.join('test-results', 'defectos')
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
// La API vive bajo /api del mismo dominio en el despliegue.
const API = process.env.E2E_API_URL ?? `${BASE}/api`
// Igual que el proyecto de playwright.config.ts, para los contextos extra.
const CONTEXTO = {
  baseURL: BASE,
  locale: 'es-SV',
  timezoneId: 'America/El_Salvador',
  viewport: { width: 1280, height: 720 },
}

/** Guarda la captura en el informe y en una carpeta fija para la evidencia. */
async function capturar(page: Page, testInfo: TestInfo, nombre: string, fullPage = true) {
  fs.mkdirSync(CARPETA, { recursive: true })
  const ruta = path.join(CARPETA, `${nombre}.png`)
  await page.screenshot({ path: ruta, fullPage })
  await testInfo.attach(nombre, { path: ruta, contentType: 'image/png' })
}

function observar(testInfo: TestInfo, descripcion: string) {
  testInfo.annotations.push({ type: 'observado', description: descripcion })
}

/**
 * Anota toda petición del navegador que no sea de lectura. El login y el
 * refresco de token son POST legítimos; cualquier otra escritura es un fallo
 * de la propia prueba (o de la pantalla) y se reporta.
 */
function vigilarEscrituras(page: Page): string[] {
  const escrituras: string[] = []
  page.on('request', (r: Request) => {
    const metodo = r.method()
    if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return
    const url = r.url()
    if (/\/auth\//.test(url)) return
    // Analíticas o prefetch de Next no tocan la API.
    if (!url.includes('/api/')) return
    escrituras.push(`${metodo} ${url}`)
  })
  return escrituras
}

async function tokenDe(page: Page): Promise<string> {
  const token = await page.evaluate(() => window.sessionStorage.getItem('docrecord.token'))
  expect(token, 'No hay token en sessionStorage').toBeTruthy()
  return token!
}

/** Minúsculas y sin tildes: para comparar nombres sin depender de la grafía. */
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Compara los esperados con los mostrados: faltantes y grafías distintas. */
function compararNombres(esperados: string[], mostrados: string[]) {
  const faltan: string[] = []
  const otraGrafia: string[] = []
  for (const e of esperados) {
    if (mostrados.includes(e)) continue
    const parecido = mostrados.find((m) => normalizar(m) === normalizar(e))
    if (parecido) otraGrafia.push(`«${e}» aparece como «${parecido}»`)
    else faltan.push(e)
  }
  return { faltan, otraGrafia }
}

// ─── Umbrales, escritos aquí a propósito y no importados de la aplicación ───
// Si la prueba usara la misma función que la pantalla, un umbral mal puesto
// pasaría inadvertido en las dos.

interface Toma {
  signosVitalesId: number
  tomadoEn: string
  estado: string
  paciente: { personaId: number; nombres: string; apellidos: string }
  temperaturaC: number | null
  presionSistolica: number | null
  presionDiastolica: number | null
  pulsoLpm: number | null
  frecuenciaRespRpm: number | null
  saturacionPct: number | null
}

/** Umbrales críticos NEWS2 del criterio 3 de HU-16. */
function criticos(t: Toma): string[] {
  const r: string[] = []
  if (t.saturacionPct !== null && t.saturacionPct < 92) r.push(`saturación ${t.saturacionPct} %`)
  if (t.pulsoLpm !== null && (t.pulsoLpm < 40 || t.pulsoLpm > 130)) r.push(`pulso ${t.pulsoLpm} lpm`)
  if (t.frecuenciaRespRpm !== null && (t.frecuenciaRespRpm < 9 || t.frecuenciaRespRpm > 24))
    r.push(`FR ${t.frecuenciaRespRpm} rpm`)
  if (t.temperaturaC !== null && (t.temperaturaC < 35.1 || t.temperaturaC > 39)) r.push(`temperatura ${t.temperaturaC} °C`)
  if (t.presionSistolica !== null && (t.presionSistolica < 91 || t.presionSistolica > 219))
    r.push(`sistólica ${t.presionSistolica} mmHg`)
  return r
}

/** Medidas fuera del rango normal sin llegar a crítico (una sola clave por tarjeta). */
function soloFueraDeRango(t: Toma): string[] {
  const r: string[] = []
  const fuera = (v: number | null, min: number, max: number) => v !== null && (v < min || v > max)
  if (fuera(t.pulsoLpm, 60, 100) && !fuera(t.pulsoLpm, 40, 130)) r.push(`Pulso|${t.pulsoLpm} lpm`)
  if (fuera(t.temperaturaC, 36.0, 37.5) && !fuera(t.temperaturaC, 35.1, 39)) r.push(`Temperatura|${t.temperaturaC} °C`)
  if (fuera(t.saturacionPct, 95, 100) && !fuera(t.saturacionPct, 92, 100)) r.push(`Saturación O₂|${t.saturacionPct} %`)
  if (fuera(t.frecuenciaRespRpm, 12, 20) && !fuera(t.frecuenciaRespRpm, 9, 24))
    r.push(`Frecuencia respiratoria|${t.frecuenciaRespRpm} rpm`)
  return r
}

/** Todas las tomas que el médico puede leer, página a página (solo GET). */
async function todasLasTomas(page: Page, token: string): Promise<Toma[]> {
  const tomas: Toma[] = []
  for (let p = 0; p < 50; p++) {
    const resp = await page.request.get(`${API}/signos-vitales?pagina=${p}&tamano=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(resp.status(), `GET /signos-vitales página ${p}`).toBe(200)
    const pagina = (await resp.json()) as { contenido: Toma[]; totalPaginas: number }
    tomas.push(...pagina.contenido)
    if (p + 1 >= (pagina.totalPaginas ?? 1)) break
  }
  return tomas
}

test.describe('Verificación de DEF-01, 02, 03 y 07 en producción (solo lectura)', () => {
  test('DEF-01 · catálogos sembrados y selector de tipo de cita (HU-14 CP001, HU-30 CP004)', async ({
    page,
    browser,
  }, testInfo) => {
    const escrituras = vigilarEscrituras(page)
    await entrar(page, CUENTAS.admin)
    await page.goto('/catalogos')
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogos' })).toBeVisible()

    const seccionCita = page.getByRole('region', { name: 'Tipos de cita' })
    const seccionHabito = page.getByRole('region', { name: 'Tipos de hábito' })
    await expect(seccionCita).toBeVisible()
    await expect(seccionHabito).toBeVisible()

    const listaCita = page.getByRole('list', { name: 'Tipos de cita' })
    const listaHabito = page.getByRole('list', { name: 'Tipos de hábito' })
    await expect(listaCita, 'La sección Tipos de cita no muestra ninguna lista').toBeVisible()
    await expect(listaHabito, 'La sección Tipos de hábito no muestra ninguna lista').toBeVisible()

    // El nombre es el primer párrafo de cada fila (el segundo es la descripción).
    const nombresDe = (lista: typeof listaCita) =>
      lista.locator(':scope > li').evaluateAll((lis) => lis.map((li) => li.querySelector('p')?.textContent?.trim() ?? ''))
    const tiposCita = await nombresDe(listaCita)
    const tiposHabito = await nombresDe(listaHabito)
    await capturar(page, testInfo, 'def01-1-catalogos-admin')

    const esperadosCita = ['Consulta general', 'Control', 'Primera vez', 'Seguimiento de crónicos', 'Resultados de laboratorio']
    const esperadosHabito = ['Tabaquismo', 'Consumo de alcohol', 'Actividad física', 'Alimentación', 'Sueño', 'Consumo de agua']
    const cita = compararNombres(esperadosCita, tiposCita)
    const habito = compararNombres(esperadosHabito, tiposHabito)
    observar(testInfo, `Tipos de cita (${tiposCita.length}): ${tiposCita.join(', ')}`)
    observar(testInfo, `Tipos de hábito (${tiposHabito.length}): ${tiposHabito.join(', ')}`)
    if (cita.otraGrafia.length || habito.otraGrafia.length) {
      testInfo.annotations.push({
        type: 'otra grafía',
        description: [...cita.otraGrafia, ...habito.otraGrafia].join('; '),
      })
    }
    expect.soft(cita.faltan, 'Tipos de cita sembrados por V41 que no aparecen').toEqual([])
    expect.soft(habito.faltan, 'Tipos de hábito sembrados por V41 que no aparecen').toEqual([])

    // El médico: el formulario de agendar ofrece tipos de cita. Se abre, se
    // leen las opciones y se cierra sin guardar.
    const ctxMedico = await browser.newContext(CONTEXTO)
    const medico = await ctxMedico.newPage()
    const escriturasMedico = vigilarEscrituras(medico)
    try {
      await entrar(medico, CUENTAS.medico)
      await medico.goto('/agenda')
      await expect(medico.getByRole('heading', { level: 1, name: /agenda de citas/i })).toBeVisible()
      const boton = medico.getByRole('button', { name: /agendar cita/i })
      await expect(boton).toBeVisible()
      await medico.waitForLoadState('networkidle')
      const aviso = await medico.getByRole('status').allInnerTexts()
      expect(aviso.filter((t) => /no hay tipos de cita/i.test(t)), 'La agenda dice que no hay tipos de cita').toEqual([])
      await expect(boton, `«Agendar cita» deshabilitado. Avisos: ${aviso.join(' | ')}`).toBeEnabled()
      await boton.click()

      const dialogo = medico.getByRole('dialog')
      await expect(dialogo).toBeVisible()
      const selector = dialogo.getByLabel(/tipo de cita/i)
      await expect(selector).toBeVisible()
      const opciones = (await selector.locator('option').allInnerTexts()).map((o) => o.trim())
      const reales = opciones.filter((o) => o && !/^seleccione/i.test(o))
      await capturar(medico, testInfo, 'def01-2-agendar-medico-selector', false)
      observar(testInfo, `Selector «Tipo de cita» del médico (${reales.length}): ${reales.join(', ')}`)
      expect(reales.length, 'El selector de tipo de cita no ofrece opciones').toBeGreaterThan(0)
      expect.soft(compararNombres(esperadosCita, reales).faltan, 'Tipos sembrados ausentes en el selector').toEqual([])

      await medico.keyboard.press('Escape')
      await expect(dialogo).toBeHidden()
      await capturar(medico, testInfo, 'def01-3-agenda-cerrado-sin-guardar', false)
    } finally {
      await ctxMedico.close()
    }
    expect([...escrituras, ...escriturasMedico], 'La prueba emitió escrituras').toEqual([])
  })

  test('DEF-02 · «Valor crítico» en rojo y «Fuera de rango» en ámbar (HU-16 CP003)', async ({ page }, testInfo) => {
    const escrituras = vigilarEscrituras(page)
    await entrar(page, CUENTAS.medico)
    const token = await tokenDe(page)
    const tomas = await todasLasTomas(page, token)
    // Las activas primero: son las que cuentan como «última toma».
    const ordenadas = [...tomas].sort((a, b) => Number(b.estado === 'ACTIVA') - Number(a.estado === 'ACTIVA'))
    const critica = ordenadas.find((t) => criticos(t).length > 0)
    const ambar = ordenadas.find((t) => soloFueraDeRango(t).length > 0)
    observar(
      testInfo,
      `Tomas leídas=${tomas.length}; con valor crítico=${tomas.filter((t) => criticos(t).length).length}; ` +
        `con algo solo fuera de rango=${tomas.filter((t) => soloFueraDeRango(t).length).length}`,
    )

    if (!critica) {
      testInfo.annotations.push({
        type: 'no concluyente',
        description: `Ninguna de las ${tomas.length} tomas de producción tiene un valor crítico NEWS2; no se crean datos.`,
      })
    } else {
      await test.step(`toma crítica ${critica.signosVitalesId}`, async () => {
        observar(
          testInfo,
          `Toma crítica #${critica.signosVitalesId} (${critica.estado}) de ${critica.paciente.nombres} ` +
            `${critica.paciente.apellidos}: ${criticos(critica).join(', ')}`,
        )
        await page.goto(`/enfermeria/${critica.signosVitalesId}`)
        const celdas = page.locator('[data-nivel="critico"]')
        await expect(celdas.first(), 'El detalle de la toma no marca ninguna medida como crítica').toBeVisible()
        const textos = await celdas.allInnerTexts()
        const clases = await celdas.evaluateAll((els) => els.map((e) => e.className))
        const colorTexto = await celdas
          .first()
          .getByText(/valor crítico/i)
          .evaluate((e) => ({ clase: e.className, color: getComputedStyle(e).color }))
        observar(
          testInfo,
          `/enfermeria/${critica.signosVitalesId}: ${textos.length} celda(s) críticas → ` +
            `${textos.map((t) => t.replace(/\s+/g, ' ')).join(' | ')}; clase del texto=${colorTexto.clase}; color=${colorTexto.color}`,
        )
        await celdas.first().scrollIntoViewIfNeeded()
        await capturar(page, testInfo, 'def02-1-detalle-toma-critica')
        for (const t of textos) expect(t).toMatch(/valor crítico/i)
        for (const c of clases) expect(c).toMatch(/\bbg-red-50\b/)
        expect(colorTexto.clase).toMatch(/\btext-red-700\b/)
        // Cuantas celdas se marcan críticas como mínimo: tantas como medidas
        // críticas distintas (la presión agrupa sistólica y diastólica).
        expect(textos.length).toBeGreaterThanOrEqual(1)

        // Si esa toma es la última activa del paciente, la tarjeta del
        // expediente también debe marcarla.
        const ultima = await page.request.get(`${API}/signos-vitales/ultima?pacienteId=${critica.paciente.personaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const ultimaId = ultima.status() === 200 ? ((await ultima.json()) as Toma).signosVitalesId : null
        if (ultimaId === critica.signosVitalesId) {
          await page.goto(`/pacientes/${critica.paciente.personaId}`)
          const tarjeta = page.locator('div.rounded-2xl', {
            has: page.getByRole('heading', { level: 4, name: /últimos signos vitales/i }),
          })
          await expect(tarjeta).toBeVisible()
          const enTarjeta = tarjeta.locator('[data-nivel="critico"]')
          await expect(enTarjeta.first()).toContainText(/valor crítico/i)
          await expect(enTarjeta.first()).toHaveClass(/\bbg-red-50\b/)
          await tarjeta.scrollIntoViewIfNeeded()
          await tarjeta.screenshot({ path: path.join(CARPETA, 'def02-2-tarjeta-ultimos-signos.png') })
          await testInfo.attach('def02-2-tarjeta-ultimos-signos', {
            path: path.join(CARPETA, 'def02-2-tarjeta-ultimos-signos.png'),
            contentType: 'image/png',
          })
          observar(testInfo, `Tarjeta «Últimos signos» del paciente ${critica.paciente.personaId}: ${(await enTarjeta.allInnerTexts()).join(' | ')}`)
        } else {
          observar(testInfo, `La toma crítica no es la última activa del paciente (última=${ultimaId}); se verificó solo el detalle.`)
        }
      })
    }

    if (!ambar) {
      testInfo.annotations.push({
        type: 'no concluyente',
        description: 'Ninguna toma tiene una medida solo fuera de rango (ámbar).',
      })
    } else {
      await test.step(`toma fuera de rango ${ambar.signosVitalesId}`, async () => {
        const [etiqueta, valor] = soloFueraDeRango(ambar)[0].split('|')
        await page.goto(`/enfermeria/${ambar.signosVitalesId}`)
        const celda = page.locator('[data-fuera-de-rango="true"]', { hasText: etiqueta })
        await expect(celda.first(), `La medida ${etiqueta} (${valor}) no se marca`).toBeVisible()
        const nivel = await celda.first().getAttribute('data-nivel')
        const clase = await celda.first().getAttribute('class')
        const texto = (await celda.first().innerText()).replace(/\s+/g, ' ')
        observar(testInfo, `/enfermeria/${ambar.signosVitalesId}: ${etiqueta}=${valor} → data-nivel=${nivel}; «${texto}»`)
        await celda.first().scrollIntoViewIfNeeded()
        await capturar(page, testInfo, 'def02-3-detalle-toma-fuera-de-rango')
        expect(nivel).toBe('fuera-de-rango')
        expect(texto).toMatch(/fuera de rango/i)
        expect(texto).not.toMatch(/valor crítico/i)
        expect(clase).toMatch(/\bbg-amber-50\b/)
        await expect(celda.first().getByText(/fuera de rango/i)).toHaveClass(/\btext-amber-800\b/)
      })
    }

    expect(escrituras, 'La prueba emitió escrituras').toEqual([])
    if (!critica) test.skip(true, 'No concluyente: no hay ninguna toma con valor crítico NEWS2 en producción')
  })

  test('DEF-03 · el hábito se anula con motivo y no se elimina (HU-14)', async ({ page }, testInfo) => {
    const escrituras = vigilarEscrituras(page)
    const borrados: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'DELETE') borrados.push(r.url())
    })
    await entrar(page, CUENTAS.medico)
    const token = await tokenDe(page)
    const auth = { headers: { Authorization: `Bearer ${token}` } }

    // Qué prefijo usa hábitos en este despliegue (su ruta del backend ya
    // empieza por /api). Solo GET.
    let rutaHabitos = ''
    for (const candidata of [`${API}/api/habitos-estilo-de-vida`, `${BASE}/api/habitos-estilo-de-vida`]) {
      const r = await page.request.get(`${candidata}/tipos`, auth)
      if (r.status() === 200) {
        rutaHabitos = candidata
        break
      }
    }
    expect(rutaHabitos, 'No se encontró la ruta de hábitos de la API').not.toBe('')

    const resp = await page.request.get(`${API}/pacientes`, auth)
    expect(resp.status()).toBe(200)
    const cuerpo = (await resp.json()) as { personaId: number }[] | { contenido: { personaId: number }[] }
    const pacientes = Array.isArray(cuerpo) ? cuerpo : cuerpo.contenido
    let elegido: { personaId: number; habitos: { estado?: string; anuladoEn?: string | null; tipoHabito: { descripcion: string } }[] } | null = null
    for (const p of pacientes.slice(0, 80)) {
      const r = await page.request.get(`${rutaHabitos}/paciente/${p.personaId}`, auth)
      if (r.status() !== 200) continue
      const habitos = (await r.json()) as { estado?: string; anuladoEn?: string | null; tipoHabito: { descripcion: string } }[]
      const vigentes = habitos.filter((h) => !h.anuladoEn && h.estado !== 'ANULADO')
      if (vigentes.length > 0) {
        elegido = { personaId: p.personaId, habitos }
        break
      }
    }
    expect(elegido, `Ninguno de ${pacientes.length} pacientes tiene un hábito vigente`).not.toBeNull()
    observar(
      testInfo,
      `Paciente ${elegido!.personaId}: ${elegido!.habitos.length} hábito(s): ${elegido!.habitos.map((h) => h.tipoHabito.descripcion).join(', ')}`,
    )

    await page.goto(`/pacientes/${elegido!.personaId}`)
    const seccion = page.getByRole('region', { name: 'Hábitos y Estilo de Vida' })
    await expect(seccion).toBeVisible()
    await seccion.getByRole('button', { name: 'Expandir Hábitos y Estilo de Vida' }).click()
    const botonesAnular = seccion.getByRole('button', { name: /^Anular hábito:/ })
    await expect(botonesAnular.first(), 'La sección de hábitos no ofrece «Anular»').toBeVisible()
    const eliminar = seccion.getByRole('button', { name: /eliminar|borrar/i })
    const etiquetasBotones = await seccion.getByRole('button').allInnerTexts()
    observar(testInfo, `Botones de la sección: ${etiquetasBotones.map((t) => t.trim()).filter(Boolean).join(' | ')}`)
    await seccion.scrollIntoViewIfNeeded()
    await capturar(page, testInfo, 'def03-1-seccion-habitos')
    await expect(eliminar, 'La sección de hábitos todavía ofrece Eliminar/Borrar').toHaveCount(0)

    // Se abre el diálogo solo para ver el campo y el contador; se cierra sin confirmar.
    await botonesAnular.first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByRole('heading', { name: 'Anular hábito' })).toBeVisible()
    const motivo = dialogo.getByLabel(/motivo de la anulación/i)
    await expect(motivo).toBeVisible()
    await expect(motivo).toHaveValue('')
    const contador = dialogo.getByText(/^\s*0\/500\s*$/)
    await expect(contador, 'No se ve el contador 0/500').toBeVisible()
    await expect(dialogo.getByRole('button', { name: /confirmar anulación/i })).toBeDisabled()
    await capturar(page, testInfo, 'def03-2-dialogo-anular-sin-confirmar', false)
    await dialogo.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialogo).toBeHidden()
    observar(testInfo, 'Diálogo «Anular hábito» con «Motivo de la anulación» y contador 0/500; cerrado con Cancelar sin confirmar.')

    expect(borrados, 'Se emitió un DELETE').toEqual([])
    expect(escrituras, 'La prueba emitió escrituras').toEqual([])
  })

  test('DEF-07 · «Mi perfil» del paciente; el médico no entra (HU-33 CP004, HU-14 CP004)', async ({
    page,
    browser,
  }, testInfo) => {
    const escrituras = vigilarEscrituras(page)
    // Primero, el médico que escribe /mi-perfil no lo ve (va antes para que
    // se compruebe aunque la parte del paciente falle).
    const ctxMedico = await browser.newContext(CONTEXTO)
    const medico = await ctxMedico.newPage()
    const escriturasMedico = vigilarEscrituras(medico)
    try {
      await entrar(medico, CUENTAS.medico)
      await medico.goto('/mi-perfil')
      await expect(medico).not.toHaveURL(/\/mi-perfil/)
      await expect(medico.getByRole('heading', { level: 1, name: 'Mi perfil' })).toHaveCount(0)
      await expect(medico.getByRole('switch', { name: /recordatorios/i })).toHaveCount(0)
      observar(testInfo, `Médico en /mi-perfil → redirigido a ${medico.url()}`)
      await capturar(medico, testInfo, 'def07-0-medico-redirigido', false)
    } finally {
      await ctxMedico.close()
    }

    await entrarComoPaciente(page, CUENTAS.paciente)
    const enlace = page.getByRole('link', { name: 'Mi perfil', exact: true })
    await expect(enlace, 'El menú del paciente no ofrece «Mi perfil»').toBeVisible()
    await capturar(page, testInfo, 'def07-1-menu-paciente', false)
    await enlace.click()
    await page.waitForURL('**/mi-perfil')
    await expect(page.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeVisible()

    // Diagnóstico de solo lectura: qué responde la API a la misma sesión, para
    // separar un fallo de la pantalla de uno del backend. «Mi expediente» es la
    // referencia: resuelve al paciente por la sesión igual que «Mi perfil».
    const token = await tokenDe(page)
    const diagnostico: string[] = []
    for (const ruta of [`${API}/api/mi-perfil`, `${API}/api/mi-perfil/habitos`, `${API}/mi/expediente`]) {
      const r = await page.request.get(ruta, { headers: { Authorization: `Bearer ${token}` } })
      const cuerpo = (await r.text()).slice(0, 160).replace(/"(correo|telefono|dui|email)":"[^"]*"/gi, '"$1":"…"')
      diagnostico.push(`GET ${ruta.replace(BASE, '')} → ${r.status()} ${r.status() === 200 ? '(ok)' : cuerpo}`)
    }
    observar(testInfo, `API con la sesión del paciente: ${diagnostico.join(' | ')}`)
    await page.waitForLoadState('networkidle')
    const alertas = await page.getByRole('alert').allInnerTexts()
    observar(testInfo, `Alertas en /mi-perfil: ${JSON.stringify(alertas.map((a) => a.trim()).filter(Boolean))}`)
    await capturar(page, testInfo, 'def07-2-mi-perfil-paciente-carga')

    const datos = page.getByRole('region', { name: 'Mis datos' })
    await expect(datos, `«Mis datos» no aparece. ${diagnostico.join(' | ')}`).toBeVisible()
    const dt = await datos.locator('dt').allInnerTexts()
    const dd = await datos.locator('dd').allInnerTexts()
    observar(testInfo, `Mis datos: ${dt.map((t, i) => `${t.trim()}=${dd[i]?.trim().replace(/@.*/, '@…')}`).join('; ')}`)
    expect(dt.map((t) => t.trim().toLowerCase())).toEqual(['nombre', 'número de expediente', 'correo', 'teléfono'])
    expect(dd[0]?.trim(), 'El nombre del paciente está vacío').not.toMatch(/^(|no registrado)$/i)

    const interruptor = page.getByRole('switch', { name: 'Recibir recordatorios de citas por correo' })
    await expect(interruptor).toBeVisible()
    const estado = await interruptor.getAttribute('aria-checked')
    expect(['true', 'false']).toContain(estado)
    observar(testInfo, `Interruptor de recordatorios: aria-checked=${estado} (no se cambió)`)

    const habitos = page.getByRole('region', { name: 'Mis hábitos y estilo de vida' })
    await expect(habitos).toBeVisible()
    await expect(habitos.getByText(/cargando tus hábitos/i)).toHaveCount(0)
    const lista = habitos.getByRole('list', { name: 'Mis hábitos' })
    const vacio = habitos.getByText('No tienes hábitos registrados.')
    await expect(lista.or(vacio).first()).toBeVisible()
    const n = (await lista.count()) > 0 ? await lista.locator(':scope > li').count() : 0
    const botones = await habitos.getByRole('button').allInnerTexts()
    observar(testInfo, `Hábitos: ${n > 0 ? `${n} en lista` : 'estado vacío'}; botones en la sección: ${JSON.stringify(botones)}`)
    expect(botones, 'La sección de hábitos del paciente tiene botones').toEqual([])
    await expect(habitos.getByRole('textbox')).toHaveCount(0)
    await capturar(page, testInfo, 'def07-3-mi-perfil-paciente')
    // Sigue igual al terminar: nadie lo pulsó.
    await expect(interruptor).toHaveAttribute('aria-checked', estado!)

    expect([...escrituras, ...escriturasMedico], 'La prueba emitió escrituras').toEqual([])
  })

  test('A11y · axe WCAG AA y sin desborde en /catalogos y /mi-perfil a 360 y 1280', async ({ browser }, testInfo) => {
    const casos = [
      { ruta: '/catalogos', cuenta: 'admin' as const, listo: { level: 1 as const, name: 'Catálogos' } },
      { ruta: '/mi-perfil', cuenta: 'paciente' as const, listo: { level: 1 as const, name: 'Mi perfil' } },
    ]
    const resumen: string[] = []
    for (const caso of casos) {
      const ctx = await browser.newContext(CONTEXTO)
      const page = await ctx.newPage()
      const escrituras = vigilarEscrituras(page)
      try {
        if (caso.cuenta === 'admin') await entrar(page, CUENTAS.admin)
        else await entrarComoPaciente(page, CUENTAS.paciente)
        for (const ancho of [360, 1280]) {
          await test.step(`${caso.ruta} a ${ancho} px`, async () => {
            await page.setViewportSize({ width: ancho, height: ancho === 360 ? 740 : 800 })
            await page.goto(caso.ruta)
            await expect(page.getByRole('heading', caso.listo)).toBeVisible()
            await page.waitForLoadState('networkidle')
            await expect(page.getByText(/^Cargando/)).toHaveCount(0)
            const nombre = `a11y-${caso.ruta.slice(1)}-${ancho}`
            await capturar(page, testInfo, nombre)

            const m = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth,
            }))
            const axe = await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
              .analyze()
            fs.mkdirSync(CARPETA, { recursive: true })
            fs.writeFileSync(path.join(CARPETA, `axe-${nombre}.json`), JSON.stringify(axe.violations, null, 2))
            await testInfo.attach(`axe-${nombre}.json`, {
              body: JSON.stringify(axe.violations, null, 2),
              contentType: 'application/json',
            })
            const hallazgos = axe.violations
              .filter((v) => ['color-contrast', 'label', 'label-title-only'].includes(v.id))
              .flatMap((v) =>
                v.nodes.map((n) => {
                  const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
                  const razon = d?.contrastRatio ? ` ${d.fgColor} sobre ${d.bgColor} = ${d.contrastRatio}:1` : ''
                  return `[${v.id}] ${n.target.join(' ')}${razon} · ${n.html.slice(0, 90)}`
                }),
              )
            const otras = axe.violations.filter((v) => !['color-contrast', 'label', 'label-title-only'].includes(v.id))
            resumen.push(
              `${caso.ruta}@${ancho}: scrollWidth=${m.scrollWidth}/${m.innerWidth}; contraste/etiqueta=${hallazgos.length}; ` +
                `otras reglas=${otras.map((v) => `${v.id}(${v.nodes.length})`).join(',') || 'ninguna'}`,
            )
            expect.soft(hallazgos, `Violaciones WCAG AA de contraste/etiqueta en ${caso.ruta} a ${ancho}`).toEqual([])
            expect.soft(m.scrollWidth, `${caso.ruta} a ${ancho} px se desplaza a lo ancho`).toBeLessThanOrEqual(m.innerWidth + 1)
          })
        }
        expect(escrituras, 'La prueba emitió escrituras').toEqual([])
      } finally {
        await ctx.close()
      }
    }
    for (const r of resumen) observar(testInfo, r)
  })
})
