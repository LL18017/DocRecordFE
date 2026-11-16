// HU-35 · Interfaz responsive y accesible (DRS-102) — comprobada en un
// navegador real.
//
// Por qué en Playwright y no en Vitest: jsdom no calcula diseño. No sabe cuánto
// mide la página, si un formulario cae en una o dos columnas ni qué color de
// fondo queda detrás de un texto, así que las cinco cosas que pide la historia
// solo existen en un navegador que pinta de verdad. `accesibilidadDeFormularios`
// en Vitest cubre que cada campo tenga nombre; el contraste, el desborde y el
// foco visible se comprueban aquí.
//
// La numeración de los criterios es la del plan de pruebas (hoja HU035):
//   c1 sin desplazamiento horizontal a 360, 768 y 1280 px
//   c2 formularios largos en una sola columna en teléfono
//   c3 la tabla que no cabe se desplaza dentro de su contenedor
//   c4 contraste WCAG 2.1 AA y etiqueta en cada campo (axe-core)
//   c5 flujos completos solo con teclado
//
// Todas corren sin credenciales, también contra el despliegue (E2E_BASE_URL).
// Las internas simulan la sesión y la API en el navegador (ver
// `sesion-simulada.ts`): lo que se mide aquí es el frontend desplegado —su
// diseño, su contraste, su teclado—, y para eso basta con que la API responda
// datos con la forma correcta. Si están las variables E2E_MEDICO_EMAIL /
// E2E_ADMIN_EMAIL se usa el login real en su lugar. Ninguna escribe datos: el
// envío del login con Enter se intercepta antes de llegar al servidor, y la
// API simulada rechaza toda escritura.
import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { CUENTAS, entrar } from './sesion'
import { simularApi, simularSesion, type ApiSimulada } from './sesion-simulada'

// Teléfono, tableta vertical y portátil: los tres anchos del criterio 1. El
// alto no importa para el desborde horizontal, pero se fija para que las
// capturas sean comparables entre corridas.
const ANCHOS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const

// Un píxel de tolerancia: el redondeo de subpíxeles puede dar 361 en una página
// que no se desplaza. Más que eso ya es una barra de desplazamiento real.
const TOLERANCIA_PX = 1

type Pantalla = { nombre: string; ruta: string; titulo: RegExp }

const PUBLICAS: Pantalla[] = [
  { nombre: 'login', ruta: '/login', titulo: /iniciar sesión/i },
  { nombre: 'mapa', ruta: '/mapa', titulo: /clínicas de la red/i },
  { nombre: 'recuperar', ruta: '/recuperar', titulo: /.+/ },
]

/** Abre la ruta y espera a que su título se haya pintado. */
async function abrir(page: Page, pantalla: Pantalla) {
  await page.goto(pantalla.ruta)
  await expect(page.getByRole('heading', { level: 1, name: pantalla.titulo }).first()).toBeVisible()
}

/**
 * Mide el desborde horizontal de la página y, si lo hay, quién lo provoca.
 *
 * No basta con el sí o el no: un «falló a 360 px» sin el culpable manda a
 * revisar la pantalla entera. Se devuelven los elementos más profundos cuyo
 * borde derecho pasa del ancho de la ventana, que es donde hay que corregir.
 */
async function medirDesborde(page: Page) {
  return page.evaluate(() => {
    const ancho = window.innerWidth
    const culpables: string[] = []
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= ancho + 1) continue
      // Solo las hojas del desborde: si un hijo ya se sale, el padre sobra.
      const hijoSeSale = Array.from(el.children).some(
        (h) => h.getBoundingClientRect().right > ancho + 1,
      )
      if (hijoSeSale) continue
      // Lo que está dentro de un contenedor con su propio desplazamiento no
      // ensancha la página: es justo lo que pide el criterio 3.
      let dentroDeScroll = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') {
          dentroDeScroll = true
          break
        }
      }
      if (dentroDeScroll) continue
      const clase = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : ''
      culpables.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${clase ? '.' + clase : ''} → right=${Math.round(r.right)}px`)
      if (culpables.length >= 10) break
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: ancho,
      culpables,
    }
  })
}

/** Guarda la captura de página completa en test-results/hu35 y la adjunta al reporte. */
async function capturar(page: Page, testInfo: TestInfo, nombre: string) {
  const destino = path.join(testInfo.project.outputDir, 'hu35', `${nombre}.png`)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  await page.screenshot({ path: destino, fullPage: true })
  await testInfo.attach(nombre, { path: destino, contentType: 'image/png' })
}

/** c1: la página no se desplaza a lo ancho en ninguno de los tres anchos. */
async function comprobarSinDesborde(page: Page, testInfo: TestInfo, pantalla: Pantalla, preparar?: () => Promise<void>) {
  for (const vista of ANCHOS) {
    await test.step(`${pantalla.nombre} a ${vista.width} px`, async () => {
      await page.setViewportSize(vista)
      await (preparar ? preparar() : abrir(page, pantalla))
      await capturar(page, testInfo, `${pantalla.nombre}-${vista.width}`)
      const m = await medirDesborde(page)
      expect
        .soft(
          m.scrollWidth,
          `${pantalla.ruta} a ${vista.width} px se desplaza a lo ancho ` +
            `(scrollWidth ${m.scrollWidth} > ${m.innerWidth}). Culpables: ${m.culpables.join(' | ') || 'no identificados'}`,
        )
        .toBeLessThanOrEqual(m.innerWidth + TOLERANCIA_PX)
    })
  }
}

/**
 * c2: ningún par de campos visibles de un formulario comparte fila.
 *
 * Se mide la geometría y no las clases (`grid-cols-1`): lo que el usuario sufre
 * es ver dos campos de 140 px lado a lado, venga de una clase, de un `flex` o de
 * un estilo en línea.
 */
async function camposLadoALado(page: Page, raiz = 'form') {
  return page.evaluate((selector) => {
    const pares: string[] = []
    for (const form of Array.from(document.querySelectorAll(selector))) {
      const campos = Array.from(
        form.querySelectorAll<HTMLElement>(
          'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea',
        ),
      )
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
      for (let i = 0; i < campos.length; i++) {
        for (let j = i + 1; j < campos.length; j++) {
          const a = campos[i].r
          const b = campos[j].r
          const mismaFila = a.top < b.bottom - 2 && b.top < a.bottom - 2
          const separados = a.right <= b.left + 2 || b.right <= a.left + 2
          if (mismaFila && separados) {
            const nombre = (el: HTMLElement) =>
              el.getAttribute('aria-label') || el.id || el.getAttribute('name') || el.tagName.toLowerCase()
            pares.push(`${nombre(campos[i].el)} ↔ ${nombre(campos[j].el)}`)
          }
        }
      }
    }
    return pares
  }, raiz)
}

/**
 * c4: auditoría axe con las reglas de WCAG 2.0/2.1 A y AA.
 *
 * Se exige cero en contraste y en etiquetas, que es lo que dice el criterio.
 * El resto de hallazgos se adjunta para que se vean, pero no hace fallar esta
 * prueba: no son de esta historia y mezclarlos escondería el dato que importa.
 */
async function auditar(page: Page, testInfo: TestInfo, nombre: string) {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  if (resultado.violations.length > 0) {
    await testInfo.attach(`axe-${nombre}.json`, {
      body: JSON.stringify(resultado.violations, null, 2),
      contentType: 'application/json',
    })
    const destino = path.join(testInfo.project.outputDir, 'hu35', `axe-${nombre}.json`)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, JSON.stringify(resultado.violations, null, 2))
  }
  const deLaHistoria = resultado.violations.filter((v) =>
    ['color-contrast', 'label', 'label-title-only'].includes(v.id),
  )
  // Una línea por nodo, con el selector y la razón de contraste: el objeto
  // completo de axe ocupa cientos de líneas en la salida y tapa lo que importa.
  // El detalle entero queda en el JSON adjunto.
  const hallazgos = deLaHistoria.flatMap((v) =>
    v.nodes.map((n) => {
      const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
      const razon = d?.contrastRatio ? ` ${d.fgColor} sobre ${d.bgColor} = ${d.contrastRatio}:1` : ''
      return `[${v.id}] ${n.target.join(' ')}${razon} · ${n.html.slice(0, 90)}`
    }),
  )
  expect.soft(hallazgos, `Violaciones WCAG AA de contraste/etiqueta en ${nombre}`).toEqual([])
}

/** Describe el elemento enfocado y si su indicador de foco se ve. */
async function focoActual(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    const enfocado = getComputedStyle(el)
    const conFoco = { outline: enfocado.outlineStyle, ancho: enfocado.outlineWidth, sombra: enfocado.boxShadow, borde: enfocado.borderColor }
    const r = el.getBoundingClientRect()
    return {
      id: el.id,
      etiqueta: el.tagName.toLowerCase(),
      tipo: el.getAttribute('type'),
      texto: (el.textContent ?? '').trim().slice(0, 40),
      conFoco,
      visible:
        r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
        r.top < window.innerHeight && r.left < window.innerWidth,
    }
  })
}

// --------------------------------------------------------------------------
// Pantallas públicas: corren siempre, también contra producción.
// --------------------------------------------------------------------------

test.describe('HU-35 · c1 · sin desplazamiento horizontal (pantallas públicas)', () => {
  for (const pantalla of PUBLICAS) {
    test(`${pantalla.ruta} a 360, 768 y 1280 px`, async ({ page }, testInfo) => {
      await comprobarSinDesborde(page, testInfo, pantalla)
    })
  }
})

test.describe('HU-35 · c2 · formularios en una sola columna en teléfono (pantallas públicas)', () => {
  for (const pantalla of PUBLICAS.filter((p) => p.nombre !== 'mapa')) {
    test(`${pantalla.ruta} a 360 px`, async ({ page }) => {
      await page.setViewportSize(ANCHOS[0])
      await abrir(page, pantalla)
      expect(await camposLadoALado(page), 'Campos lado a lado en teléfono').toEqual([])
    })
  }
})

test.describe('HU-35 · c4 · contraste WCAG AA y etiqueta en cada campo (pantallas públicas)', () => {
  for (const pantalla of PUBLICAS) {
    test(`${pantalla.ruta} a 360, 768 y 1280 px`, async ({ page }, testInfo) => {
      // Se audita en los tres anchos porque el diseño cambia: a 1280 px el
      // login muestra el panel azul con su propio texto, que en teléfono no
      // existe, y a la inversa.
      for (const vista of ANCHOS) {
        await test.step(`${vista.width} px`, async () => {
          await page.setViewportSize(vista)
          await abrir(page, pantalla)
          await auditar(page, testInfo, `${pantalla.nombre}-${vista.width}`)
        })
      }
    })
  }
})

test.describe('HU-35 · c5 · inicio de sesión solo con teclado', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(ANCHOS[2])
    await abrir(page, PUBLICAS[0])
  })

  test('Tab recorre correo, contraseña y botón en ese orden, con el foco visible', async ({ page }) => {
    // Se parte de la página sin nada enfocado y se avanza solo con Tab, como
    // quien no usa ratón. Se anota cada parada para comprobar el orden.
    const paradas: string[] = []
    const objetivos = ['login-email', 'login-password', 'submit']
    for (let i = 0; i < 15 && paradas.filter((p) => objetivos.includes(p)).length < 3; i++) {
      await page.keyboard.press('Tab')
      const foco = await focoActual(page)
      if (!foco) continue
      const clave = foco.tipo === 'submit' ? 'submit' : foco.id || `${foco.etiqueta}:${foco.texto}`
      paradas.push(clave)
      if (!objetivos.includes(clave)) continue

      expect(foco.visible, `«${clave}» recibe el foco pero queda fuera de la vista`).toBe(true)
      // El indicador se compara contra el mismo elemento sin foco: el botón ya
      // tiene sombra de diseño, así que «box-shadow distinto de none» no prueba
      // nada por sí solo. Tiene que cambiar algo al enfocar.
      const sinFoco = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        el.blur()
        const s = getComputedStyle(el)
        const r = { outline: s.outlineStyle, ancho: s.outlineWidth, sombra: s.boxShadow, borde: s.borderColor }
        el.focus({ focusVisible: true } as FocusOptions)
        return r
      })
      const conOutline = foco.conFoco.outline !== 'none' && parseFloat(foco.conFoco.ancho) > 0
      const conSombra = foco.conFoco.sombra !== 'none' && foco.conFoco.sombra !== sinFoco.sombra
      expect(
        conOutline || conSombra,
        `«${clave}» no muestra indicador de foco (outline ${foco.conFoco.outline}, box-shadow ${foco.conFoco.sombra})`,
      ).toBe(true)
    }

    const orden = objetivos.map((o) => paradas.indexOf(o))
    expect(orden.every((i) => i >= 0), `Tab no llegó a todos: paradas ${paradas.join(' → ')}`).toBe(true)
    expect(orden, `Orden de tabulación ilógico: ${paradas.join(' → ')}`).toEqual([...orden].sort((a, b) => a - b))
  })

  test('Enter con los campos vacíos no envía y señala el campo que falta', async ({ page }) => {
    // Cualquier petición al login aquí sería un envío que no debió salir.
    let envios = 0
    await page.route('**/auth/login', (ruta) => {
      envios++
      return ruta.abort()
    })

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(page.locator('#login-email')).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/login(\?.*)?$/)
    // La validación nativa deja el foco en el primer campo inválido y le pone
    // un mensaje; es lo que lee un lector de pantalla.
    await expect(page.locator('#login-email')).toBeFocused()
    const validacion = await page.locator('#login-email').evaluate((el: HTMLInputElement) => ({
      faltante: el.validity.valueMissing,
      mensaje: el.validationMessage,
    }))
    expect(validacion.faltante).toBe(true)
    expect(validacion.mensaje).not.toBe('')
    expect(envios, 'Se envió el login con los campos vacíos').toBe(0)
  })

  test('Enter con los campos llenos envía el formulario', async ({ page }) => {
    // La respuesta se simula: comprobar que Enter envía no exige gastar un
    // intento de login en producción ni conocer una contraseña.
    let cuerpo: unknown = null
    await page.route('**/auth/login', (ruta) => {
      cuerpo = ruta.request().postDataJSON()
      return ruta.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciales inválidas' }),
      })
    })

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.type('nadie@docrecord.test')
    await page.keyboard.press('Tab')
    await page.keyboard.type('NoEsUnaClave#1')
    await page.keyboard.press('Enter')

    // Por id y no por `getByRole('alert')`: Next monta su propio anunciador de
    // rutas con role="alert", y la consulta casaría con los dos.
    await expect(page.locator('#login-error')).toBeVisible()
    expect(cuerpo).toMatchObject({ email: 'nadie@docrecord.test' })
    await expect(page).toHaveURL(/\/login(\?.*)?$/)
  })
})

// --------------------------------------------------------------------------
// Pantallas internas: sesión y API simuladas por defecto, login real si hay
// credenciales en el entorno.
//
// Qué validan con la simulación: el layout, el contraste, las etiquetas y el
// recorrido con teclado de las pantallas tal como las sirve el despliegue
// (HTML, JS y CSS se descargan de E2E_BASE_URL). Qué NO validan: la lógica del
// backend —permisos, validaciones, qué datos devuelve—, que cubren las pruebas
// de integración de DocRecordBE y `acceso-por-rol.spec.ts` con sesión real.
// Con datos simulados, además, la pantalla se mide siempre con los mismos
// nombres largos y la misma cantidad de filas, cosa que la base de producción
// no garantiza de una corrida a otra.
// --------------------------------------------------------------------------

/** API simulada de la prueba en curso, para revisar al final que nada salió. */
let apiSimulada: ApiSimulada | null = null

/**
 * Deja el navegador dentro del portal con el rol pedido.
 *
 * Con credenciales en el entorno hace el login real (`entrar`). Sin ellas, que
 * es lo normal, simula la sesión y la API: el login real exigiría guardar
 * contraseñas en algún sitio de un repositorio público.
 */
async function entrarComo(page: Page, rol: 'medico' | 'Administrador') {
  const variable = rol === 'medico' ? 'E2E_MEDICO_EMAIL' : 'E2E_ADMIN_EMAIL'
  if (process.env[variable]) {
    apiSimulada = null
    await entrar(page, rol === 'medico' ? CUENTAS.medico : CUENTAS.admin)
    return
  }
  await simularSesion(page, rol)
  apiSimulada = await simularApi(page)
}

/**
 * Tras cada prueba interna: ninguna respuesta de la API llegó del backend real,
 * y las peticiones sin respuesta preparada quedan adjuntas para revisarlas.
 */
async function revisarApiSimulada(testInfo: TestInfo) {
  if (!apiSimulada) return
  await testInfo.attach('api-simulada.json', {
    body: JSON.stringify(apiSimulada, null, 2),
    contentType: 'application/json',
  })
  expect(apiSimulada.alBackendReal, 'Respuestas que llegaron del backend real').toEqual([])
  apiSimulada = null
}

const INTERNAS_MEDICO: Pantalla[] = [
  { nombre: 'dashboard', ruta: '/dashboard', titulo: /.+/ },
  { nombre: 'pacientes', ruta: '/pacientes', titulo: /pacientes/i },
  { nombre: 'consultas', ruta: '/consultas', titulo: /consultas/i },
  { nombre: 'agenda', ruta: '/agenda', titulo: /.+/ },
]
const USUARIOS: Pantalla = { nombre: 'usuarios', ruta: '/usuarios', titulo: /usuarios/i }

/**
 * Abre el expediente del primer paciente de la lista.
 *
 * Se llega por la lista y no por un id fijo: los ids cambian entre bases, y un
 * id que no existe probaría la pantalla de «no encontrado», no el expediente.
 */
async function abrirExpediente(page: Page) {
  await page.goto('/pacientes')
  const fila = page.locator('tbody tr[role=button]').first()
  await expect(fila, 'No hay pacientes en la sede para abrir un expediente').toBeVisible()
  await fila.click()
  await page.waitForURL(/\/pacientes\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
}

/** c3: cada tabla visible vive en un contenedor que se desplaza, y la página no. */
async function comprobarTablas(page: Page) {
  const tablas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('table'))
      .filter((t) => t.getBoundingClientRect().width > 0)
      .map((t, i) => {
        let contenedor: HTMLElement | null = t.parentElement
        while (contenedor && !['auto', 'scroll'].includes(getComputedStyle(contenedor).overflowX)) {
          contenedor = contenedor.parentElement
        }
        return {
          indice: i,
          conContenedor: !!contenedor && contenedor !== document.documentElement,
          desborda: t.scrollWidth > (t.parentElement?.clientWidth ?? 0),
        }
      }),
  )
  for (const t of tablas) {
    expect.soft(t.conContenedor, `La tabla #${t.indice} no tiene un contenedor con overflow-x auto/scroll`).toBe(true)
  }
  const m = await medirDesborde(page)
  expect.soft(m.scrollWidth, `La página se ensancha con la tabla: ${m.culpables.join(' | ')}`).toBeLessThanOrEqual(
    m.innerWidth + TOLERANCIA_PX,
  )
  return tablas
}

test.describe('HU-35 · pantallas internas (sesión de Médico)', () => {
  test.afterEach(async ({}, testInfo) => revisarApiSimulada(testInfo))

  for (const pantalla of INTERNAS_MEDICO) {
    test(`c1 y c4 · ${pantalla.ruta} a 360, 768 y 1280 px`, async ({ page }, testInfo) => {
      await entrarComo(page, 'medico')
      await comprobarSinDesborde(page, testInfo, pantalla)
      for (const vista of ANCHOS) {
        await page.setViewportSize(vista)
        await abrir(page, pantalla)
        await auditar(page, testInfo, `${pantalla.nombre}-${vista.width}`)
      }
    })
  }

  test('c1 y c4 · expediente a 360, 768 y 1280 px', async ({ page }, testInfo) => {
    await entrarComo(page, 'medico')
    const expediente: Pantalla = { nombre: 'expediente', ruta: '/pacientes/{id}', titulo: /.+/ }
    await comprobarSinDesborde(page, testInfo, expediente, () => abrirExpediente(page))
    for (const vista of ANCHOS) {
      await page.setViewportSize(vista)
      await abrirExpediente(page)
      await auditar(page, testInfo, `expediente-${vista.width}`)
    }
  })

  test('c2 · el formulario de nuevo paciente cae en una columna a 360 px', async ({ page }, testInfo) => {
    await entrarComo(page, 'medico')
    await page.setViewportSize(ANCHOS[0])
    await abrir(page, INTERNAS_MEDICO[1])
    await page.getByRole('button', { name: /nuevo paciente/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await capturar(page, testInfo, 'nuevo-paciente-360')
    expect(await camposLadoALado(page, '[role=dialog]'), 'Campos lado a lado en el alta de paciente').toEqual([])
  })

  for (const pantalla of [INTERNAS_MEDICO[1], INTERNAS_MEDICO[2]]) {
    test(`c3 · las tablas de ${pantalla.ruta} se desplazan dentro de su contenedor`, async ({ page }, testInfo) => {
      await entrarComo(page, 'medico')
      for (const vista of ANCHOS) {
        await test.step(`${vista.width} px`, async () => {
          await page.setViewportSize(vista)
          await abrir(page, pantalla)
          await expect(page.locator('table').first()).toBeVisible()
          await capturar(page, testInfo, `${pantalla.nombre}-tabla-${vista.width}`)
          await comprobarTablas(page)
        })
      }
    })
  }

  test('c5 · buscar un paciente y abrir su ficha solo con teclado', async ({ page }) => {
    await entrarComo(page, 'medico')
    await abrir(page, INTERNAS_MEDICO[1])

    // Tab hasta el buscador de la tabla, sin hacer clic en él.
    const buscador = page.getByPlaceholder(/buscar/i).first()
    for (let i = 0; i < 40 && !(await buscador.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(buscador, 'Tab no llega al buscador de pacientes').toBeFocused()
    await page.keyboard.type('Hernández')

    // Y de ahí a la primera fila, que se abre con Enter.
    const fila = page.locator('tbody tr[role=button]').first()
    await expect(fila).toBeVisible()
    for (let i = 0; i < 20 && !(await fila.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(fila, 'Tab no llega a la primera fila de resultados').toBeFocused()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/pacientes\/[^/]+$/)
  })
})

test.describe('HU-35 · pantallas internas (sesión de Administrador)', () => {
  test.afterEach(async ({}, testInfo) => revisarApiSimulada(testInfo))

  test('c1, c3 y c4 · /usuarios a 360, 768 y 1280 px', async ({ page }, testInfo) => {
    await entrarComo(page, 'Administrador')
    await comprobarSinDesborde(page, testInfo, USUARIOS)
    for (const vista of ANCHOS) {
      await page.setViewportSize(vista)
      await abrir(page, USUARIOS)
      await comprobarTablas(page)
      await auditar(page, testInfo, `usuarios-${vista.width}`)
    }
  })
})
