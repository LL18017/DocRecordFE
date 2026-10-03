// ----------------------------------------------------------------------------
// Capturas del sistema para el Laboratorio 2.
//
//   node scripts/capturas-lab2.mjs             # todas las que se puedan
//   node scripts/capturas-lab2.mjs 02 15a      # solo esas
//   node scripts/capturas-lab2.mjs --publicas  # solo las que no piden sesión
//
// Una captura por ELEMENTO del Product Backlog, no por pantalla: la rúbrica
// evalúa elementos, y un elemento sin captura propia es uno que la tutora no
// puede verificar.
//
// ── Por qué Chrome del sistema y no el Chromium de Playwright ──────────────
// El Chromium empaquetado está bloqueado por la directiva de Control de
// aplicaciones de Windows (error 0x11C7 al cargar chrome.dll). El Chrome
// instalado sí arranca, y además es el navegador con el que cualquiera del
// equipo reproduciría esto a mano.
//
// ── Por qué no se usa page.screenshot() ───────────────────────────────────
// Porque fotografía el documento, no el navegador: nunca sale la barra de
// direcciones. La evidencia que pide el laboratorio es precisamente esa barra
// -- el dominio público visible es lo que distingue el sistema desplegado de
// una instalación local. Se captura la ventana entera con
// `scripts/capturar-ventana.ps1`.
//
// ── Credenciales ──────────────────────────────────────────────────────────
// No se escriben aquí: este repositorio es público y una contraseña commiteada
// queda en el historial aunque después se borre. Se leen del entorno. Copie
// `.env.capturas.example` a `.env.capturas`, rellénelo y expórtelo.
// ----------------------------------------------------------------------------
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')

const BASE = process.env.CAP_BASE_URL ?? 'https://docrecordsv.duckdns.org'
const API = process.env.CAP_API_URL ?? 'https://api-docrecordsv.duckdns.org'
const DESTINO =
  process.env.CAP_DESTINO ??
  resolve(
    RAIZ,
    '../../entrega-drive/PROYECTO/DSI215/1. Captura de Pantallas/Laboratorio 2',
  )

// Perfil propio por corrida: es lo que permite identificar la ventana sin
// confundirla con otra de Chrome que el equipo tenga abierta.
const PERFIL = join(process.env.TEMP ?? '/tmp', `docrecord-capturas-${process.pid}`)

// La pantalla de esta máquina es 1440x900. La ventana se deja algo menor para
// que quepa entera: PrintWindow solo fotografía lo que la ventana ocupa.
const VENTANA = { ancho: 1400, alto: 880 }

// Expediente con varias tomas de signos vitales, que es lo que la gráfica de
// evolución necesita para mostrar una tendencia. Se deja configurable porque
// depende de los datos del entorno, no del código.
const EXPEDIENTE_CON_EVOLUCION = process.env.CAP_EXPEDIENTE ?? '/pacientes/2'

// El paciente sobre el que se demuestra la baja logica (17a y 17b). Se elige
// uno SIN consultas ni recetas: la baja es reversible, pero aun asi no tiene
// sentido sacar del listado a quien sostiene otras capturas.
const PACIENTE_DE_BAJA = process.env.CAP_PACIENTE_DE_BAJA ?? 'Portillo Avilés'

// Paciente y telefono de la captura 08. Distinto del de la baja: 17a lo deja
// INACTIVO y entonces ya no sale en el listado por omision.
const PACIENTE_A_EDITAR = process.env.CAP_PACIENTE_A_EDITAR ?? 'Hernández Cruz'
const TELEFONO_NUEVO = process.env.CAP_TELEFONO_NUEVO ?? '2225-3080'

const cuenta = (rol) => {
  const email = process.env[`CAP_${rol}_EMAIL`]
  const password = process.env[`CAP_${rol}_PASSWORD`]
  return email && password ? { email, password } : null
}

const CUENTAS = {
  admin: cuenta('ADMIN'),
  medico: cuenta('MEDICO'),
  enfermera: cuenta('ENFERMERA'),
  paciente: cuenta('PACIENTE'),
}

// ─── Captura ────────────────────────────────────────────────────────────────

let tomadas = 0
const fallidas = []
const omitidas = []

async function capturar(page, nombre, { sinClic = false } = {}) {
  // Chrome deja el foco en la barra de direcciones al abrir una ventana nueva,
  // y entonces la URL sale resaltada en azul -- se lee peor justo en lo que la
  // captura debe demostrar. Un clic en el documento devuelve el foco a la
  // página. Se comprueba antes que el punto no caiga sobre algo pulsable: un
  // clic a ciegas podría navegar y arruinar la escena.
  if (!sinClic) {
    try {
      const seguro = await page.evaluate(() => {
        const el = document.elementFromPoint(6, 6)
        return !el || !el.closest('a,button,input,select,textarea,label,[role="button"],[onclick]')
      })
      if (seguro) await page.mouse.click(6, 6)
    } catch {}
  }

  // `networkidle` no siempre llega en una app con sondeos; un respiro corto
  // después de que la red se calma evita fotografiar un esqueleto de carga.
  await page.waitForTimeout(900)
  const salida = join(DESTINO, `${nombre}.png`)
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass',
       '-File', join(AQUI, 'capturar-ventana.ps1'),
       '-PerfilDir', PERFIL, '-Salida', salida],
      { encoding: 'utf8', timeout: 30_000 },
    ).trim()
    if (out.startsWith('OK')) {
      tomadas++
      console.log(`  ✓ ${nombre}`)
    } else {
      fallidas.push([nombre, out])
      console.log(`  ✗ ${nombre} — ${out}`)
    }
  } catch (e) {
    fallidas.push([nombre, e.message.split('\n')[0]])
    console.log(`  ✗ ${nombre} — ${e.message.split('\n')[0]}`)
  }
}

// ─── Sesión ─────────────────────────────────────────────────────────────────

/**
 * Entra al sistema y deja el navegador dentro del portal.
 *
 * Incluye la selección de clínica porque es un paso obligatorio del flujo real
 * para el personal: el login lleva a `/select-clinica`, no al panel. El
 * paciente no pasa por ahí y cae directo en `/mi-panel`.
 */
async function entrar(page, cred, { esPaciente = false } = {}) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/correo electrónico/i).fill(cred.email)
  await page.getByLabel(/contraseña/i).fill(cred.password)
  await page.getByRole('button', { name: /ingresar al sistema/i }).click()

  if (esPaciente) {
    await page.waitForURL('**/mi-panel', { timeout: 60_000 })
    return
  }

  await page.waitForURL('**/select-clinica', { timeout: 60_000 })
  const sedes = page.getByRole('button', { name: /clínica/i })
  await sedes.first().waitFor({ state: 'visible', timeout: 60_000 })
  await sedes.first().click()
  await page.waitForURL('**/dashboard', { timeout: 60_000 })
}

async function salir(page) {
  // Limpia la sesión sin depender del menú: entre escenas lo que importa es
  // quedar sin token, no ejercitar el botón (eso lo hace la escena 16a).
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.context().clearCookies()
}

/**
 * Deja un bloque centrado en la ventana.
 *
 * `scrollIntoViewIfNeeded` lo deja apenas asomando por el borde, que en una
 * captura de evidencia equivale a no mostrarlo.
 */
async function encuadrar(page, localizador) {
  await localizador.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(700)
}

/** Abre el menú de la cuenta (el botón con la inicial, arriba a la derecha). */
async function abrirMenuDeCuenta(page, inicial) {
  const avatar = page.locator('header button, nav button')
    .filter({ hasText: new RegExp(`^${inicial}$`, 'i') }).first()
  await avatar.click()
  await page.getByText(/cerrar sesión/i).first().waitFor({ state: 'visible', timeout: 20_000 })
}

/** Primera fila de la tabla cuya columna CONSULTAS tenga al menos `minimo`. */
async function pacienteConConsultas(page, minimo) {
  const filas = page.locator('table tbody tr')
  for (let i = 0; i < (await filas.count()); i++) {
    const fila = filas.nth(i)
    const enlace = await fila.locator('a').first().getAttribute('href').catch(() => null)
    const texto = await fila.innerText()
    const n = [...texto.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]))
    if (enlace && n.some((x) => x >= minimo)) return enlace
  }
  return null
}

// ─── Escenas ────────────────────────────────────────────────────────────────
// Cada escena: qué elemento respalda, qué cuenta necesita y qué hace.

const ESCENAS = [
  // ── Sprint 1 ──
  {
    id: '01', nombre: '01-TT-01-DRS-7-formato-de-error', rol: null,
    desc: 'TT-01 · DRS-7 — cuerpo de error de la API, ejecutado desde Swagger',
    async run(page) {
      // Se ejecuta desde Swagger y no escribiendo la URL en la barra porque el
      // error tiene que venir del manejador global. Cualquier ruta escrita a
      // mano la corta antes el filtro de seguridad, que responde texto plano
      // «Debe enviar token Bearer» -- eso no demuestra el formato de TT-01.
      // `POST /auth/login` con un correo inexistente sí llega al manejador y
      // devuelve el cuerpo JSON, y además no necesita credenciales.
      await page.goto(`${API}/swagger-ui/index.html`, { waitUntil: 'networkidle' })

      const bloque = page.locator('.opblock').filter({ hasText: '/auth/login' }).first()
      await bloque.waitFor({ state: 'visible', timeout: 60_000 })
      await bloque.locator('.opblock-summary').click()

      await bloque.getByRole('button', { name: /try it out/i }).click()
      const cuerpo = bloque.locator('textarea')
      await cuerpo.fill(JSON.stringify(
        { email: 'no-existe@docrecordsv.sv', password: 'ClaveIncorrecta1' }, null, 2))

      await bloque.getByRole('button', { name: /^execute$/i }).click()
      // La fila de respuesta en vivo aparece cuando el servidor contesta.
      await bloque.locator('.live-responses-table').waitFor({ state: 'visible', timeout: 60_000 })
      await bloque.locator('.live-responses-table').scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
    },
  },
  {
    id: '02', nombre: '02-HU-01-DRS-3-inicio-de-sesion', rol: null,
    desc: 'HU-01 · DRS-3 — pantalla de inicio de sesión',
    async run(page) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    },
  },
  {
    id: '04a', nombre: '04a-HU-02-DRS-77-registro-de-medico', rol: null,
    desc: 'HU-02 · DRS-77 — formulario de autorregistro del médico',
    async run(page) {
      // El alta del médico es pública por diseño: es lo que le permite
      // incorporarse sin esperar a un administrador. La pantalla de perfil
      // editable (04b) sí exige sesión.
      await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' })
    },
  },
  {
    id: '03c', nombre: '03c-HU-04-DRS-12-ruta-protegida-redirige', rol: null,
    desc: 'HU-04 · DRS-12 criterio 5 — /dashboard sin sesión redirige al login',
    async run(page) {
      await salir(page)
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForURL('**/login**', { timeout: 30_000 })
    },
  },
  // ── Sprint 2 ──
  {
    id: '14a', nombre: '14a-HU-03-DRS-8-solicitud-de-recuperacion', rol: null,
    desc: 'HU-03 · DRS-8 — formulario de solicitud de recuperación',
    async run(page) {
      await page.goto(`${BASE}/recuperar`, { waitUntil: 'networkidle' })
    },
  },
  {
    id: '15a', nombre: '15a-TT-04-DRS-30-frontend-en-dominio-publico', rol: null,
    desc: 'TT-04 · DRS-30 — la aplicación en su dominio público con HTTPS',
    async run(page) {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    },
  },
  {
    id: '15b', nombre: '15b-TT-04-DRS-30-swagger-en-dominio-publico', rol: null,
    desc: 'TT-04 · DRS-30 — Swagger de la API en su subdominio',
    async run(page) {
      await page.goto(`${API}/swagger-ui/index.html`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500)
    },
  },
  {
    id: '13a', nombre: '13a-TT-02-DRS-103-ci-backend', rol: null,
    desc: 'TT-02 · DRS-103 — integración continua del backend',
    async run(page) {
      await page.goto('https://github.com/LL18017/DocRecordBE/actions/workflows/ci.yml', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
    },
  },
  {
    id: '13b', nombre: '13b-TT-02-DRS-103-ci-frontend', rol: null,
    desc: 'TT-02 · DRS-103 — integración continua del frontend',
    async run(page) {
      await page.goto('https://github.com/LL18017/DocRecordFE/actions/workflows/ci.yml', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
    },
  },

  // ── Con sesión ──────────────────────────────────────────────────────────
  {
    id: '03a', nombre: '03a-HU-04-DRS-12-menu-de-enfermeria', rol: 'enfermera',
    desc: 'HU-04 · DRS-12 criterio 1 — el menú de enfermería no ofrece Consultas ni Usuarios',
    async run(page) { await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }) },
  },
  {
    id: '03b', nombre: '03b-HU-04-DRS-12-menu-de-medico', rol: 'medico',
    desc: 'HU-04 · DRS-12 — el menú del médico sí ofrece Consultas y Prescripciones',
    async run(page) { await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' }) },
  },
  {
    id: '04b', nombre: '04b-HU-02-DRS-77-perfil-del-medico', rol: 'medico',
    desc: 'HU-02 · DRS-77 — pantalla de perfil del médico',
    async run(page) {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
      await abrirMenuDeCuenta(page, 'm')
      await page.getByText(/mi perfil/i).first().click()
      await page.waitForTimeout(2500)
    },
  },
  {
    id: '05a', nombre: '05a-HU-05-DRS-78-listado-de-usuarios', rol: 'admin',
    desc: 'HU-05 · DRS-78 criterio 1 — listado de usuarios con rol y estado',
    async run(page) {
      await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle' })
      await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 })
    },
  },
  {
    id: '05b', nombre: '05b-HU-05-DRS-78-alta-con-rol-y-sede', rol: 'admin',
    desc: 'HU-05 · DRS-78 — alta de usuario con rol asignado',
    async run(page) {
      await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: /nuevo usuario/i }).click()
      await page.locator('[role=dialog]').waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '06', nombre: '06-HU-07-DRS-15-registro-de-paciente', rol: 'enfermera',
    desc: 'HU-07 · DRS-15 — formulario de registro de paciente',
    async run(page) {
      await page.goto(`${BASE}/pacientes`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: /nuevo paciente/i }).click()
      await page.locator('[role=dialog]').waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '07', nombre: '07-HU-08-DRS-80-busqueda-sin-tildes', rol: 'medico',
    desc: 'HU-08 · DRS-80 criterio 2 — «Martinez» sin tilde encuentra «Martínez»',
    async run(page) {
      await page.goto(`${BASE}/pacientes`, { waitUntil: 'networkidle' })
      const buscador = page.getByPlaceholder(/buscar/i).first()
      await buscador.waitFor({ state: 'visible', timeout: 30_000 })
      // Escrito a propósito SIN tilde: es lo que demuestra el criterio.
      await buscador.fill('Martinez')
      await page.waitForTimeout(2500)
    },
  },
  {
    id: '08', nombre: '08-HU-09-DRS-81-edicion-de-paciente', rol: 'admin',
    desc: 'HU-09 · DRS-81 — edición de los datos de contacto del paciente',
    async run(page) {
      await page.goto(`${BASE}/pacientes`, { waitUntil: 'networkidle' })
      await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 })

      // Se edita un paciente sin consultas para no tocar los que sostienen las
      // capturas 09, 10, 11, 20 y 21.
      const fila = page.locator('table tbody tr').filter({ hasText: PACIENTE_A_EDITAR }).first()
      await fila.locator('button[title="Editar paciente"]').click()
      const dialogo = page.locator('[role=dialog]')
      await dialogo.waitFor({ state: 'visible', timeout: 30_000 })
      await page.waitForTimeout(1200)

      // El criterio pide el cambio YA GUARDADO, no el formulario lleno: un
      // campo escrito y sin enviar no demuestra que la edicion persista.
      // El telefono es el dato que la tabla muestra, asi que es el unico que
      // puede verse cambiado en la captura.
      await dialogo.getByLabel(/teléfono/i).first().fill(TELEFONO_NUEVO)
      await dialogo.getByRole('button', { name: /guardar|actualizar/i }).first().click()
      await dialogo.waitFor({ state: 'hidden', timeout: 40_000 })

      await page.locator('table tbody tr')
        .filter({ hasText: TELEFONO_NUEVO })
        .first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.waitForTimeout(1000)
    },
  },
  {
    id: '17a', nombre: '17a-HU-10-DRS-82-paciente-de-baja-fuera-del-listado', rol: 'admin',
    desc: 'HU-10 · DRS-82 — el paciente dado de baja sale del listado de trabajo',
    async run(page) {
      await page.goto(`${BASE}/pacientes`, { waitUntil: 'networkidle' })
      await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 })

      // Se da de baja a un paciente SIN consultas: es reversible -la baja es
      // logica- y no deja huerfana ninguna de las otras capturas.
      const fila = page.locator('table tbody tr').filter({ hasText: PACIENTE_DE_BAJA }).first()
      if (await fila.count()) {
        await fila.locator('button[title="Desactivar paciente"]').click()
        // Desde HU-10 criterio 1 la baja pide confirmacion, asi que el boton ya
        // no da de baja: abre un dialogo. Sin este paso la fila nunca se va y
        // la captura sale con el listado intacto, mostrando lo contrario de lo
        // que dice demostrar.
        const dialogo = page.locator('[role=dialog]')
        await dialogo.waitFor({ state: 'visible', timeout: 20_000 })
        await dialogo.getByRole('button', { name: /^desactivar$/i }).click()
        await fila.waitFor({ state: 'detached', timeout: 30_000 })
      }
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '17b', nombre: '17b-HU-10-DRS-82-filtro-lo-muestra-inactivo', rol: 'admin',
    desc: 'HU-08 · DRS-80 criterio 4 — «Incluir inactivos» lo devuelve, marcado INACTIVO',
    async run(page) {
      await page.goto(`${BASE}/pacientes`, { waitUntil: 'networkidle' })
      await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 })
      await page.getByLabel(/incluir inactivos/i).check()
      // La casilla recarga pidiendole los inactivos al servidor; sin esperar a
      // que vuelva la respuesta se fotografia la tabla anterior.
      await page.locator('table tbody tr').filter({ hasText: PACIENTE_DE_BAJA })
        .first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '18', nombre: '18-HU-27-DRS-95-baja-de-clinica', rol: 'admin',
    desc: 'HU-27 · DRS-95 — diálogo de confirmación de la baja de una clínica',
    async run(page) {
      await page.goto(`${BASE}/clinicas`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
      // Se abre el diálogo y NO se confirma: la captura que pide el laboratorio
      // es la confirmación en pantalla, y confirmarla borraría una clínica de
      // verdad -- el backend hace `repository.delete`, no un cambio de estado.
      const boton = page.locator('button[title="Desactivar clínica"]').first()
      await boton.waitFor({ state: 'visible', timeout: 20_000 })
      await boton.click()
      await page.getByText(/eliminar/i).first().waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '09', nombre: '09-HU-19-DRS-53-consulta-con-diagnostico', rol: 'medico',
    desc: 'HU-19 · DRS-53 — consultas registradas con su diagnóstico',
    async run(page) {
      await page.goto(`${BASE}/consultas`, { waitUntil: 'networkidle' })
      await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '10', nombre: '10-HU-20-DRS-90-historial-de-consultas', rol: 'medico',
    desc: 'HU-20 · DRS-90 — historial de consultas en el expediente',
    async run(page) {
      await page.goto(`${BASE}${EXPEDIENTE_CON_EVOLUCION}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      await encuadrar(page, page.locator('h2,h3').filter({ hasText: /consultas médicas/i }).first())
    },
  },
  {
    id: '11', nombre: '11-HU-22-DRS-27-receta-con-medicamentos', rol: 'medico',
    desc: 'HU-22 · DRS-27 — recetas emitidas con dosis, frecuencia y duración',
    async run(page) {
      await page.goto(`${BASE}/prescripciones`, { waitUntil: 'networkidle' })
      await page.getByText(/receta/i).first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(1500)
    },
  },
  {
    id: '12', nombre: '12-HU-26-DRS-28-clinica-georreferenciada', rol: 'admin',
    desc: 'HU-26 · DRS-28 — clínicas de la red con sus coordenadas y el mapa',
    async run(page) {
      await page.goto(`${BASE}/clinicas`, { waitUntil: 'networkidle' })
      // El mapa tarda en pintar los marcadores; sin esta espera sale en gris.
      await page.waitForTimeout(4000)
    },
  },
  {
    id: '14b', nombre: '14b-HU-03-DRS-8-definir-contrasena-nueva', rol: null,
    desc: 'HU-03 · DRS-8 criterio 2 — pantalla a la que lleva el enlace del correo',
    async run(page) {
      // Es la ruta exacta que el backend pone en el correo
      // (`${app.frontend.url}/restablecer?token=...`). El formulario se muestra
      // con cualquier token; la validación ocurre al enviarlo, y NO se envía:
      // consumir un token real dejaría la captura sin poder repetirse.
      await salir(page)
      await page.goto(`${BASE}/restablecer?token=enlace-de-ejemplo`, { waitUntil: 'networkidle' })
    },
  },
  {
    id: '16a', nombre: '16a-HU-06-DRS-79-menu-con-cerrar-sesion', rol: 'medico',
    desc: 'HU-06 · DRS-79 criterio 1 — menú de cuenta con «Cerrar sesión»',
    async run(page) {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
      await abrirMenuDeCuenta(page, 'm')
      await page.waitForTimeout(800)
    },
  },
  {
    id: '19', nombre: '19-HU-16-DRS-26-signos-vitales', rol: 'enfermera',
    desc: 'HU-16 · DRS-26 — signos vitales del triage ya registrados',
    async run(page) {
      await page.goto(`${BASE}/enfermeria`, { waitUntil: 'networkidle' })
      await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(1200)
    },
  },
  {
    id: '16b', nombre: '16b-HU-06-DRS-79-expiracion-por-inactividad', rol: 'medico',
    lento: true,
    // El clic que quita el foco de la barra cuenta como actividad y reiniciaría
    // el contador justo antes de fotografiar el aviso.
    sinClic: true,
    desc: 'HU-06 · DRS-79 criterios 2 y 3 — aviso previo y expiración por inactividad (~18 min)',
    async run(page) {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
      // No se simula: el aviso sale a los 18 minutos y la sesión cae a los 20
      // (INACTIVIDAD_MS en useExpiracionPorInactividad). Adelantar el reloj
      // daría una captura de algo que no ocurrió.
      const aviso = page.getByText(/sesión|sigues|continuar/i).filter({ hasText: /expir|inactiv/i })
      const expirado = page.getByText(/tu sesión expiró por inactividad/i)
      await Promise.race([
        aviso.first().waitFor({ state: 'visible', timeout: 22 * 60_000 }),
        expirado.first().waitFor({ state: 'visible', timeout: 22 * 60_000 }),
      ])
      await page.waitForTimeout(500)
    },
  },
  {
    id: '20', nombre: '20-HU-17-DRS-88-imc-calculado', rol: 'medico',
    desc: 'HU-17 · DRS-88 — índice de masa corporal calculado por el sistema',
    async run(page) {
      // El IMC NO se muestra en el formulario de captura: el backend lo calcula
      // al leer (`peso / talla²`, ver signosVitales.ts) y la interfaz lo expone
      // en la evolución del expediente. Por eso la evidencia de HU-17 sale de
      // aquí y no de la pantalla de enfermería.
      await page.goto(`${BASE}${EXPEDIENTE_CON_EVOLUCION}`, { waitUntil: 'networkidle' })
      await encuadrar(page, page.getByText(/evolución/i).first())
      await page.getByRole('button', { name: /^imc$/i }).click()
      await page.waitForTimeout(2000)
    },
  },
  {
    id: '21', nombre: '21-HU-18-DRS-89-evolucion-signos-vitales', rol: 'medico',
    desc: 'HU-18 · DRS-89 — gráfica de evolución con varias mediciones',
    async run(page) {
      await page.goto(`${BASE}${EXPEDIENTE_CON_EVOLUCION}`, { waitUntil: 'networkidle' })
      await encuadrar(page, page.getByText(/evolución/i).first())
      await page.getByRole('button', { name: /^peso$/i }).click()
      await page.waitForTimeout(2000)
    },
  },
]

// ─── Ejecución ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const soloPublicas = args.includes('--publicas')
const pedidas = args.filter((a) => !a.startsWith('--'))

let plan = ESCENAS
if (pedidas.length) plan = plan.filter((e) => pedidas.includes(e.id))
if (soloPublicas) plan = plan.filter((e) => e.rol === null)
// Las escenas lentas esperan tiempo real (16b espera 18 minutos de
// inactividad). Se quedan fuera salvo que se pidan por id o con --lentas.
if (!pedidas.length && !args.includes('--lentas')) plan = plan.filter((e) => !e.lento)

mkdirSync(DESTINO, { recursive: true })

console.log(`\nDestino: ${DESTINO}`)
console.log(`Sistema: ${BASE}`)
console.log(`Escenas: ${plan.length}\n`)

// Contexto persistente y no `launch()`: Playwright exige que el perfil se pase
// como parámetro, y aquí el perfil no es un detalle -- es lo que identifica la
// ventana a la hora de fotografiarla.
const ctx = await chromium.launchPersistentContext(PERFIL, {
  headless: false,
  channel: 'chrome',
  viewport: null,
  locale: 'es-SV',
  timezoneId: 'America/El_Salvador',
  args: [
    '--window-position=0,0',
    `--window-size=${VENTANA.ancho},${VENTANA.alto}`,
    // Sin esto Chrome hereda el escalado de Windows y la página sale ampliada:
    // cabe la mitad de contenido y la captura pierde lo que debía demostrar.
    '--force-device-scale-factor=1',
    '--hide-crash-restore-bubble',
    '--disable-session-crashed-bubble',
    // Calla la franja amarilla «Estás utilizando una marca de línea de comandos
    // no admitida». Sale porque Playwright arranca Chrome con banderas de
    // automatización, y en una captura de evidencia ese aviso distrae y
    // ensucia la parte de la imagen que debe mostrar el dominio.
    '--test-type',
  ],
})

const page = ctx.pages()[0] ?? (await ctx.newPage())

// Las escenas se ordenan por rol para no repetir inicios de sesión: cada uno
// cuesta dos navegaciones y la selección de sede.
const orden = { null: 0, admin: 1, medico: 2, enfermera: 3, paciente: 4 }
plan = [...plan].sort((a, b) => (orden[a.rol] ?? 9) - (orden[b.rol] ?? 9))

let rolActivo = 'ninguno'

for (const escena of plan) {
  const cred = escena.rol ? CUENTAS[escena.rol] : null
  if (escena.rol && !cred) {
    omitidas.push([escena.nombre, `falta CAP_${escena.rol.toUpperCase()}_EMAIL/PASSWORD`])
    console.log(`  – ${escena.nombre} — sin credenciales de ${escena.rol}`)
    continue
  }
  console.log(`${escena.id}. ${escena.desc}`)
  try {
    if (escena.rol && rolActivo !== escena.rol) {
      await salir(page)
      await entrar(page, cred, { esPaciente: escena.rol === 'paciente' })
      rolActivo = escena.rol
    }
    await escena.run(page, cred)
    await capturar(page, escena.nombre, { sinClic: escena.sinClic })
    // Una escena sin rol pudo haber cerrado la sesión (14b, 03c): se olvida
    // cuál estaba activa para que la siguiente vuelva a entrar.
    if (!escena.rol) rolActivo = 'ninguno'
  } catch (e) {
    fallidas.push([escena.nombre, e.message.split('\n')[0]])
    console.log(`  ✗ ${escena.nombre} — ${e.message.split('\n')[0]}`)
    // Una escena que deja un modal abierto arruinaría la siguiente.
    await page.keyboard.press('Escape').catch(() => {})
  }
}

await ctx.close()
try { rmSync(PERFIL, { recursive: true, force: true }) } catch {}

console.log(`\n── Resumen ──`)
console.log(`Tomadas:  ${tomadas}`)
if (omitidas.length) {
  console.log(`Omitidas: ${omitidas.length}`)
  for (const [n, r] of omitidas) console.log(`   – ${n}: ${r}`)
}
if (fallidas.length) {
  console.log(`Fallidas: ${fallidas.length}`)
  for (const [n, r] of fallidas) console.log(`   ✗ ${n}: ${r}`)
}
process.exit(fallidas.length ? 1 : 0)
