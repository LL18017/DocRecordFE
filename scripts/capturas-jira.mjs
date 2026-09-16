// ----------------------------------------------------------------------------
// Capturas de la vista de Incidencias de Jira para la seccion 7 del documento.
//
//   node scripts/capturas-jira.mjs
//
// Abre Chrome, ESPERA A QUE INICIES SESION EN JIRA en esa ventana, y recien
// entonces navega y fotografia los tres sprints.
//
// ── Por que la sesion la inicias vos ──────────────────────────────────────
// Porque la contrasena de Atlassian no tiene por que pasar por este script ni
// por el historial del shell. El unico paso manual es el login; el filtro, las
// columnas y el encuadre los hace el script igual en las tres, que es lo que
// hace que las tres capturas se parezcan entre si.
//
// Se usa un perfil propio y persistente (`PERFIL`), de modo que la sesion
// sobrevive entre corridas: la segunda vez ya no hay que volver a entrar.
//
// ── Por que tres capturas y no una agrupada ───────────────────────────────
// La guia pide los sprints "uno tras otro". Agrupar por sprint en el
// navegador de incidencias depende de un menu que cambia entre versiones de
// Jira; un filtro por sprint es estable, y da exactamente la misma
// informacion con una captura por sprint.
// ----------------------------------------------------------------------------
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
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

// Persistente y no por corrida: la sesion de Atlassian se guarda aqui, asi que
// solo hace falta iniciarla la primera vez.
const PERFIL = join(process.env.TEMP ?? '/tmp', 'docrecord-capturas-jira')

// El campo Sprint y no la etiqueta: la rubrica pide que las PBI esten "dentro
// del Sprint correspondiente", y eso lo dice el campo. Ambos coinciden en este
// tablero, pero es el campo el que lo demuestra.
const SPRINTS = [
  {
    archivo: 'jira-sprint-1',
    titulo: 'Sprint 1 · Cimientos y primer incremento funcional',
    jql: 'project = DRS AND labels = mvp AND Sprint = "Sprint 1" ORDER BY key ASC',
    esperados: 12,
  },
  {
    archivo: 'jira-sprint-2',
    titulo: 'Sprint 2 · Puesta en linea y cierre de la gestion',
    jql: 'project = DRS AND labels = mvp AND Sprint = "Sprint 2" ORDER BY key ASC',
    esperados: 9,
  },
  {
    // Sin filtro de `mvp`: el Sprint 3 no tiene elementos etiquetados asi. Se
    // incluye para mostrar que queda planificado.
    archivo: 'jira-sprint-3',
    titulo: 'Sprint 3 · Expediente clinico completo y prescripcion asistida',
    jql: 'project = DRS AND Sprint = "Sprint 3" AND issuetype in (Historia, Tarea) ORDER BY key ASC',
    esperados: 10,
  },
]

const urlDe = (jql) => `${SITIO}/issues/?jql=${encodeURIComponent(jql)}`

function capturar(nombre) {
  const salida = join(DESTINO, `${nombre}.png`)
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass',
     '-File', join(AQUI, 'capturar-ventana.ps1'),
     '-PerfilDir', PERFIL, '-Salida', salida, '-AlFrente'],
    { encoding: 'utf8', timeout: 30_000 },
  ).trim()
  if (!out.startsWith('OK')) throw new Error(out)
  return salida
}

mkdirSync(DESTINO, { recursive: true })

const ctx = await chromium.launchPersistentContext(PERFIL, {
  headless: false,
  channel: 'chrome',
  viewport: null,
  locale: 'es-SV',
  timezoneId: 'America/El_Salvador',
  args: [
    // Maximizada, y no a un tamano fijo como las capturas del sistema: la vista
    // de incidencias tiene nueve columnas y a 1400px se corta en «Prioridad»,
    // dejando fuera Estado y las fechas, que son justo lo que la guia pide que
    // se vea. Con la pantalla entera entran todas.
    '--start-maximized',
    '--force-device-scale-factor=1',
    '--hide-crash-restore-bubble',
    '--disable-session-crashed-bubble',
    '--test-type',
  ],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.setDefaultTimeout(60_000)

console.log(`\nDestino: ${DESTINO}`)
console.log(`Sitio:   ${SITIO}\n`)

/** Cierto cuando la vista de incidencias ya muestra resultados. */
async function hayResultados() {
  return (await page.locator('a[href*="/browse/DRS-"]').count()) > 0
}

await page.goto(urlDe(SPRINTS[0].jql), { waitUntil: 'domcontentloaded' })

if (!(await hayResultados().catch(() => false))) {
  console.log('┌───────────────────────────────────────────────────────────┐')
  console.log('│  IniciÃ¡ sesiÃ³n en Jira en la ventana que se abriÃ³.        │')
  console.log('│  En cuanto se vea la lista de incidencias, sigo solo.     │')
  console.log('└───────────────────────────────────────────────────────────┘\n')
}

// Hasta 15 minutos: el login puede pasar por Google y por un segundo factor.
const LIMITE = Date.now() + 15 * 60_000
let listo = false
while (Date.now() < LIMITE) {
  if (await hayResultados().catch(() => false)) { listo = true; break }
  await page.waitForTimeout(3000)
}
if (!listo) {
  console.log('✗ Se agotaron los 15 minutos sin ver la lista de incidencias.')
  await ctx.close()
  process.exit(1)
}
console.log('Sesión detectada. Capturando los tres sprints.\n')

let fallos = 0
for (const s of SPRINTS) {
  await page.goto(urlDe(s.jql), { waitUntil: 'domcontentloaded' })
  await page.locator('a[href*="/browse/DRS-"]').first().waitFor({ timeout: 60_000 })
  // Jira pinta las filas por tandas; sin este respiro la captura sale con la
  // mitad de la tabla todavia en blanco.
  await page.waitForTimeout(3500)

  const filas = await page.locator('a[href*="/browse/DRS-"]').count()
  try {
    capturar(s.archivo)
    const aviso = filas < s.esperados ? `  (se ven ${filas}, se esperaban ${s.esperados})` : ''
    console.log(`  ✓ ${s.archivo}  ${s.titulo}${aviso}`)
  } catch (e) {
    fallos++
    console.log(`  ✗ ${s.archivo} — ${e.message.split('\n')[0]}`)
  }
}

await ctx.close()
console.log(`\n${fallos === 0 ? 'Listas las tres.' : fallos + ' fallo(s).'}`)
process.exit(fallos ? 1 : 0)
