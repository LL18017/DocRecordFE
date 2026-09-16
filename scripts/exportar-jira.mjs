// ----------------------------------------------------------------------------
// Exporta la vista de Issues de Jira para la seccion 7 del documento.
//
//   node scripts/exportar-jira.mjs
//
// ── Por que un export y no una captura ────────────────────────────────────
// Porque es lo que pide la guia, con esas palabras: "Exportaran de la vista de
// Issues de Jira Y colocaran uno tras otro, todos los Sprints con sus
// respectivos PBI de su MVP" (Orientacion Academica, pag. 16). En la MISMA
// lista, y para la carpeta compartida, dice "capturas de pantalla": usa los dos
// terminos para cosas distintas.
//
// Ademas conviene por si solo: pegado en Word, el export queda como tabla de
// texto -seleccionable, buscable, y legible aunque se imprima-, mientras que
// una imagen de la pantalla no se puede leer con lupa ni copiar.
//
// Se guarda el informe que genera el propio Jira, no una tabla fabricada a
// partir de la API: lo que se entrega tiene que venir de Jira.
//
// ── Por que se pasa por el menu y no por la URL ───────────────────────────
// La URL de la vista imprimible existe, pero escribirla a mano devuelve
// "Token de proteccion contra XSRF Ausente": Jira la firma cuando la genera
// desde su propio menu, y la cookie `atlassian.xsrf.token` por si sola no
// sirve. Asi que se hace el mismo recorrido que haria una persona:
// los tres puntos -> Exportar -> Informe HTML.
//
// ── Por que se intercepta la peticion en vez de recoger la descarga ───────
// "Informe HTML: campos visibles" es un enlace a
// /sr/jira.issueviews:searchrequest-excel-current-fields/temp/SearchRequest.html
// cuya respuesta trae `Content-Disposition: attachment`, y Jira lo abre con
// `window.open`. Chrome levanta entonces una pestana, reconoce el adjunto, lo
// convierte en descarga y cierra la pestana en el acto.
//
// De ahi venia el fallo original: el guion esperaba esa pestana -- que de
// hecho llega -- y le pedia el contenido cuando ya no existia. Pero recoger la
// descarga en su lugar tampoco alcanza: los bytes cuelgan de esa pestana
// efimera, asi que `saveAs` gana o pierde una carrera segun el dia, y cuando
// la pierde se lleva por delante a todo Chrome -- los sprints siguientes ni
// llegan a cargar. Quitarle el `target` al enlace no evita nada, porque la
// pestana no la abre el atributo sino el propio JavaScript de Jira.
//
// La salida es no dejar que esa peticion llegue a ser una descarga. Se
// intercepta con `ctx.route`, se reenvia con `route.fetch()` -- que la repite
// con sus cabeceras originales, y por eso pasa el control XSRF -- y se aborta
// la original. Los bytes quedan en Node antes de que nada pueda cerrarse: ya
// no hay carrera que perder.
//
// (Pedir esa misma URL por fuera no sirve, ni siquiera copiandola del menu:
// con `ctx.request.get`, con `Referer`, con `X-Atlassian-Token: no-check` o
// con `atl_token` en la query responde igual "Token de proteccion contra XSRF
// Ausente". Tambien falla navegando a ella en una pestana nueva. Lo unico que
// Jira acepta es la peticion que nace de su propio menu. Todo probado.)
//
// Se escribe el archivo tal como lo emitio Jira, byte por byte y sin
// reescribirlo: es una tabla HTML con las mismas columnas de la vista, que
// Word pega como tabla de verdad.
//
// Reutiliza el perfil de `capturas-jira.mjs`, asi que si ya iniciaste sesion
// ahi, aqui no hace falta volver a entrar.
// ----------------------------------------------------------------------------
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')

const SITIO = process.env.JIRA_SITIO ?? 'https://docrecordsv.atlassian.net'
const DESTINO =
  process.env.JIRA_DESTINO ??
  resolve(
    RAIZ,
    '../../entrega-drive/PROYECTO/DSI215/2. Documentación/Laboratorio 2/3. Capturas de pantalla/Jira',
  )

const PERFIL = join(process.env.TEMP ?? '/tmp', 'docrecord-capturas-jira')

const SPRINTS = [
  {
    archivo: 'export-sprint-1',
    titulo: 'Sprint 1 · Cimientos y primer incremento funcional (10 – 23 ago 2026)',
    jql: 'project = DRS AND labels = mvp AND Sprint = "Sprint 1" ORDER BY key ASC',
    esperados: 12,
  },
  {
    archivo: 'export-sprint-2',
    titulo: 'Sprint 2 · Puesta en linea y cierre de la gestion (24 ago – 17 sep 2026)',
    jql: 'project = DRS AND labels = mvp AND Sprint = "Sprint 2" ORDER BY key ASC',
    esperados: 9,
  },
  {
    archivo: 'export-sprint-3',
    titulo: 'Sprint 3 · Expediente clinico completo (18 sep – 2 oct 2026)',
    jql: 'project = DRS AND Sprint = "Sprint 3" AND issuetype in (Historia, Tarea) ORDER BY key ASC',
    esperados: 10,
  },
]

const urlIssues = (jql) => `${SITIO}/issues/?jql=${encodeURIComponent(jql)}`

/**
 * Abre el menu de los tres puntos del ENCABEZADO, no el de una fila.
 *
 * La pagina tiene un boton "Mas acciones" por cada incidencia -- mas de
 * sesenta --, y todos comparten nombre accesible con el del encabezado. Se
 * distingue por lo unico que de verdad los separa: el del encabezado no vive
 * dentro de la tabla de resultados, y su menu es el que ofrece "Exportar".
 */
async function abrirMenuDeExportar(page) {
  const candidatos = page.getByRole('button', { name: /más|mas|more/i })
  const total = await candidatos.count()
  for (let i = 0; i < total; i++) {
    const boton = candidatos.nth(i)
    // Fuera los de las filas: son mas de sesenta y comparten nombre con el del
    // encabezado, que es el unico cuyo menu ofrece "Exportar".
    if (await boton.evaluate((el) => !!el.closest('table')).catch(() => true)) continue
    // Descartar lo que no se ve ANTES de pulsarlo, y pulsar con un limite
    // corto. Sin las dos cosas, cada boton oculto se come el timeout por
    // defecto -- sesenta segundos cada uno -- y la busqueda tarda minutos en
    // llegar al que sirve.
    if (!(await boton.isVisible().catch(() => false))) continue
    await boton.click({ timeout: 2500 }).catch(() => {})
    await page.waitForTimeout(700)
    const exportar = page.getByRole('menuitem', { name: /^exportar$/i })
    if (await exportar.count()) return exportar.first()
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(250)
  }
  return null
}

/** La peticion que devuelve el informe; la unica que hay que interceptar. */
const RUTA_DEL_INFORME = /jira\.issueviews:searchrequest-excel-current-fields/

/** Espera hasta `limite` a que `leer()` devuelva algo distinto de null. */
async function esperarA(leer, limite) {
  const fin = Date.now() + limite
  while (Date.now() < fin) {
    const v = leer()
    if (v) return v
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

mkdirSync(DESTINO, { recursive: true })

const ctx = await chromium.launchPersistentContext(PERFIL, {
  headless: false,
  channel: 'chrome',
  viewport: null,
  locale: 'es-SV',
  timezoneId: 'America/El_Salvador',
  args: ['--start-maximized', '--force-device-scale-factor=1', '--test-type',
         '--hide-crash-restore-bubble', '--disable-session-crashed-bubble'],
})

// En el contexto y no en la pagina: la peticion nace en la pestana que Jira
// abre con `window.open`, no en la vista de incidencias.
let informeRecibido = null
await ctx.route(RUTA_DEL_INFORME, async (route) => {
  // `route.fetch()` repite la peticion tal cual la hizo Chrome -- mismas
  // cookies, mismo Referer, mismas cabeceras Sec-Fetch --, que es justo lo que
  // el control XSRF de Jira exige y lo que no se puede imitar desde fuera.
  try {
    informeRecibido = await (await route.fetch()).body()
  } catch {
    informeRecibido = null
  }
  // Abortada: sin respuesta que entregar, Chrome no llega a abrir la descarga
  // ni a cerrar la pestana que la sostiene.
  await route.abort().catch(() => {})
})

const page = ctx.pages()[0] ?? (await ctx.newPage())
page.setDefaultTimeout(60_000)

console.log(`\nDestino: ${DESTINO}\n`)

let fallos = 0
for (const s of SPRINTS) {
  informeRecibido = null
  await page.goto(urlIssues(s.jql), { waitUntil: 'domcontentloaded' })
  await page.locator('a[href*="/browse/DRS-"]').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(2000)

  console.log(`  .. ${s.archivo}: buscando el menu de exportar`)
  const exportar = await abrirMenuDeExportar(page)
  if (!exportar) {
    fallos++
    console.log(`  x ${s.archivo} - no se encontro el menu Exportar`)
    continue
  }
  await exportar.click()
  await page.waitForTimeout(800)

  // "Campos visibles" y no "todos los campos": son las columnas que se
  // configuraron en la vista, que es lo que se quiere llevar al documento.
  // Todos los campos agrega decenas de columnas vacias e ilegibles en Word.
  const informe = page.getByRole('menuitem', { name: /informe html.*visibles/i }).first()
  await informe.click().catch(() => {})

  const cuerpo = await esperarA(() => informeRecibido, 60_000)
  // Las pestanas en blanco que Jira abrio y quedaron sin respuesta: se cierran
  // aqui para no ir acumulando una por sprint.
  for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {})
  if (!cuerpo) {
    fallos++
    console.log(`  x ${s.archivo} - el clic no produjo ningun informe`)
    continue
  }

  // Se cuenta sobre el informe y no sobre lo que se vio en pantalla: trae
  // `tempMax=1000`, asi que incluye tambien las filas que la vista todavia no
  // habia pintado. Por clave unica, porque cada incidencia aparece enlazada
  // mas de una vez dentro de su fila.
  const claves = new Set(cuerpo.toString('utf8').match(/\/browse\/DRS-\d+/g) ?? [])
  if (claves.size !== s.esperados) {
    fallos++
    console.log(`  x ${s.archivo} - ${claves.size} elementos, se esperaban ${s.esperados}`)
    continue
  }
  writeFileSync(join(DESTINO, `${s.archivo}.html`), cuerpo)
  console.log(`  OK ${s.archivo}.html - ${claves.size} elementos - ${s.titulo}`)
}

await ctx.close()
console.log(`\n${fallos === 0 ? 'Exports listos.' : fallos + ' fallo(s).'}`)
console.log('Para el documento: abrir el .html en el navegador, seleccionar la tabla y pegarla en Word.')
process.exit(fallos ? 1 : 0)
