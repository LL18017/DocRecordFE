// Casos pendientes del plan de pruebas ejecutados contra producción (DRS-102).
//
// A diferencia de casos-manuales.spec.ts, ESTOS SÍ CREAN DATOS de prueba en
// producción (autorizado por el PO): pacientes ficticios «Prueba Persistencia» y
// «Prueba Agenda E2E», tres citas, una toma de signos y una consulta. Los datos
// se preparan por la API antes de correr cada fase y se limpian (cancelación /
// anulación) después; aquí solo va la parte que se hace en el navegador.
//
// Las credenciales llegan SOLO por variables de entorno (ver `sesion.ts`). Los
// identificadores de los datos de prueba también, para no fijarlos en el código:
//
//   TT-04 CP003  E2E_PERSISTENCIA_EXPEDIENTE  número de expediente anotado antes
//                E2E_FASE_TT04                «antes» o «despues» del redespliegue
//   HU-31 CP001  E2E_AGENDA_DIA               día con las tres citas (AAAA-MM-DD)
//   HU-35 CP005  E2E_TECLADO_PACIENTE         apellido del paciente con toma de hoy
//
// Cada prueba se omite si falta su variable, para poder correrlas por separado.
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { CUENTAS } from './sesion'

// Playwright vacía test-results/ al empezar cada corrida, así que la evidencia
// se escribe aparte (E2E_EVIDENCIA) para que no la borre la fase siguiente.
const CARPETA = process.env.E2E_EVIDENCIA ?? path.join('e2e-evidencia', 'pendientes')

async function capturar(page: Page, testInfo: TestInfo, nombre: string, fullPage = true) {
  fs.mkdirSync(CARPETA, { recursive: true })
  const ruta = path.join(CARPETA, `${nombre}.png`)
  await page.screenshot({ path: ruta, fullPage })
  await testInfo.attach(nombre, { path: ruta, contentType: 'image/png' })
}

/**
 * Como `entrar` de sesion.ts, pero eligiendo la sede por nombre: los datos de
 * prueba se crearon en la Clínica Demostración, y `entrar` toma la primera que
 * ofrezca, que para el médico demo es otra.
 */
async function entrarEnSede(page: Page, cuenta: { email: string; password: string }, sede: RegExp) {
  await page.goto('/login')
  await page.getByLabel(/correo electrónico/i).fill(cuenta.email)
  await page.getByLabel(/contraseña/i).fill(cuenta.password)
  await page.getByRole('button', { name: /ingresar al sistema/i }).click()
  await page.waitForURL('**/select-clinica', { timeout: 90_000 })
  await page.getByRole('button', { name: sede }).first().click()
  await page.waitForURL('**/dashboard', { timeout: 90_000 })
}

const DEMO = /demostración/i

test.describe('Casos pendientes del plan, contra producción', () => {
  test('TT-04 CP003 · «Prueba Persistencia» conserva su expediente', async ({ page }, testInfo) => {
    const expediente = process.env.E2E_PERSISTENCIA_EXPEDIENTE
    const fase = process.env.E2E_FASE_TT04 ?? 'antes'
    test.skip(!expediente, 'Falta E2E_PERSISTENCIA_EXPEDIENTE')

    await entrarEnSede(page, CUENTAS.medico, DEMO)
    await page.goto('/pacientes')
    await page.getByPlaceholder(/buscar/i).first().fill('Persistencia')
    const fila = page.locator('tbody tr').filter({ hasText: 'Persistencia' })
    await expect(fila).toHaveCount(1)
    await capturar(page, testInfo, `tt04-cp003-${fase}-1-busqueda`)
    // La tabla no muestra el número de expediente: está en «Editar paciente»,
    // como dato de solo lectura junto al DUI. Se abre y no se guarda nada.
    await fila.getByTitle('Editar paciente').click()
    const dialogo = page.getByRole('dialog').first()
    await expect(dialogo).toContainText('Número de expediente')
    await expect(dialogo).toContainText(expediente!)
    await expect(dialogo).toContainText('09999999-5')
    await capturar(page, testInfo, `tt04-cp003-${fase}-2-expediente`, false)
  })

  test('HU-31 CP001 · la vista Día lista las citas en orden de hora', async ({ page }, testInfo) => {
    const dia = process.env.E2E_AGENDA_DIA
    test.skip(!dia, 'Falta E2E_AGENDA_DIA')

    await entrarEnSede(page, CUENTAS.medico, DEMO)
    await page.goto('/agenda')
    await capturar(page, testInfo, 'hu31-cp001-1-agenda-al-abrir')

    // Vista Día y «Mis citas»; luego, del día de hoy al de las citas con el
    // botón «Día siguiente», como lo haría el médico.
    await page.getByRole('group', { name: 'Vista de la agenda' }).getByRole('button', { name: 'Día' }).click()
    await page.getByRole('group', { name: 'Qué citas ver' }).getByRole('button', { name: 'Mis citas' }).click()
    const fecha = page.getByLabel('Día de la agenda')
    const hoy = await fecha.inputValue()
    for (let i = 0; i < 7 && (await fecha.inputValue()) !== dia; i++) {
      await page.getByRole('button', { name: 'Día siguiente' }).click()
    }
    await expect(fecha).toHaveValue(dia!)

    // Cada cita es un <li> con aria-label «Cita de <paciente> a las HH:MM».
    const lista = page.getByRole('list', { name: 'Citas del día' })
    // Solo las vivas: las canceladas siguen en la agenda con su motivo (HU-32).
    const deE2E = lista.locator(':scope > li').filter({ hasText: 'Agenda E2E' }).filter({ hasText: 'AGENDADA' })
    await expect(deE2E).toHaveCount(3)
    await capturar(page, testInfo, 'hu31-cp001-2-dia-con-tres-citas')

    const etiquetas = await lista.locator(':scope > li').evaluateAll((lis) => lis.map((li) => li.getAttribute('aria-label') ?? ''))
    const horas = etiquetas.map((e) => e.match(/(\d{1,2}:\d{2})\s*$/)?.[1] ?? '?')
    const horasE2E = (await deE2E.evaluateAll((lis) => lis.map((li) => li.getAttribute('aria-label') ?? ''))).map(
      (e) => e.match(/(\d{1,2}:\d{2})\s*$/)?.[1] ?? '?',
    )
    fs.writeFileSync(
      path.join(CARPETA, 'hu31-cp001-horas.json'),
      JSON.stringify({ fechaAlAbrir: hoy, dia, etiquetas, horas, horasE2E }, null, 1),
    )
    expect(horasE2E, 'Las citas de prueba no salen en orden de hora').toEqual(['09:00', '10:00', '11:00'])
    expect(horas, 'La lista del día no está ordenada por hora').toEqual([...horas].sort())
  })

  test('HU-35 CP005 · registrar una consulta solo con teclado (HTTP 201)', async ({ page }, testInfo) => {
    const apellido = process.env.E2E_TECLADO_PACIENTE
    test.skip(!apellido, 'Falta E2E_TECLADO_PACIENTE')

    // Bitácora de cada tecla y de dónde quedó el foco, para la evidencia.
    const pasos: { tecla: string; foco: string }[] = []
    const foco = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return '(body)'
        const etiqueta =
          el.getAttribute('aria-label') ||
          (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
          el.getAttribute('placeholder') ||
          el.getAttribute('name') ||
          el.innerText?.slice(0, 40) ||
          ''
        return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} «${etiqueta.trim()}»`
      })
    const tecla = async (k: string) => {
      await page.keyboard.press(k)
      pasos.push({ tecla: k, foco: await foco() })
    }
    const escribir = async (texto: string) => {
      await page.keyboard.type(texto)
      pasos.push({ tecla: `escribir «${texto}»`, foco: await foco() })
    }
    /** Tab hasta que el foco cumpla la condición; falla si no llega. */
    const tabHasta = async (descripcion: string, cond: () => Promise<boolean>, max = 60) => {
      for (let i = 0; i < max; i++) {
        if (await cond()) return
        await tecla('Tab')
      }
      throw new Error(`Con Tab no se llega a: ${descripcion}. Recorrido: ${JSON.stringify(pasos.slice(-max))}`)
    }
    const guardarBitacora = () =>
      fs.writeFileSync(path.join(CARPETA, 'hu35-cp005-teclado.json'), JSON.stringify(pasos, null, 1))

    // Inicio de sesión solo con teclado (ya probado en HU-35 c5; se repite
    // porque el caso es el flujo completo sin ratón).
    await page.goto('/login')
    await tabHasta('correo', () => page.getByLabel(/correo electrónico/i).evaluate((el) => el === document.activeElement))
    await escribir(CUENTAS.medico.email)
    await page.keyboard.press('Tab')
    await page.keyboard.type(CUENTAS.medico.password)
    pasos.push({ tecla: 'Tab + escribir contraseña (no se registra)', foco: await foco() })
    await tecla('Enter')
    await page.waitForURL('**/select-clinica', { timeout: 90_000 })
    const sede = page.getByRole('button', { name: DEMO }).first()
    await tabHasta('sede Demostración', () => sede.evaluate((el) => el === document.activeElement))
    await tecla('Enter')
    await page.waitForURL('**/dashboard', { timeout: 90_000 })

    // A Consultas por el menú lateral, con Tab y Enter.
    const enlace = page.getByRole('link', { name: /^consultas/i }).first()
    await tabHasta('enlace Consultas del menú', () => enlace.evaluate((el) => el === document.activeElement), 80)
    await tecla('Enter')
    await page.waitForURL('**/consultas', { timeout: 60_000 })
    await capturar(page, testInfo, 'hu35-cp005-1-consultas')

    const nueva = page.getByRole('button', { name: /nueva consulta|registrar consulta/i }).first()
    await tabHasta('botón de nueva consulta', () => nueva.evaluate((el) => el === document.activeElement), 80)
    await tecla('Enter')
    const dialogo = page.getByRole('dialog').first()
    await expect(dialogo).toBeVisible()
    await capturar(page, testInfo, 'hu35-cp005-2-formulario-abierto', false)

    // Paciente: un <select> nativo. Se llega con Tab y se baja con la flecha
    // hasta la opción del paciente de prueba (sin abrir la lista con el ratón).
    const selectPaciente = dialogo.getByLabel(/^paciente/i)
    await tabHasta('selector de paciente', () => selectPaciente.evaluate((el) => el === document.activeElement))
    await expect(selectPaciente.locator('option', { hasText: apellido! })).toHaveCount(1)
    const textoElegido = () => selectPaciente.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.text ?? '')
    const total = await selectPaciente.locator('option').count()
    for (let i = 0; i < total && !(await textoElegido()).includes(apellido!); i++) {
      await tecla('ArrowDown')
    }
    pasos.push({ tecla: '(opción elegida)', foco: await textoElegido() })
    expect(await textoElegido(), 'Con las flechas no se llega al paciente de prueba').toContain(apellido!)
    await capturar(page, testInfo, 'hu35-cp005-3-paciente-elegido', false)
    guardarBitacora()

    const campo = (re: RegExp) => async () =>
      dialogo.evaluate((d, src) => {
        const el = document.activeElement as HTMLElement | null
        if (!el || !d.contains(el)) return false
        const txt =
          (el.getAttribute('aria-label') ?? '') + ' ' + (el.getAttribute('placeholder') ?? '') + ' ' +
          (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent ?? '' : '') + ' ' +
          (el.getAttribute('name') ?? '')
        return new RegExp(src, 'i').test(txt) && /^(input|textarea)$/i.test(el.tagName)
      }, re.source)

    await tabHasta('campo Motivo', campo(/motivo/))
    await escribir('Control de prueba E2E (teclado)')
    await tabHasta('campo Diagnóstico', campo(/diagn/))
    await escribir('Paciente sano, prueba E2E del plan de pruebas')
    guardarBitacora()
    await capturar(page, testInfo, 'hu35-cp005-4-formulario-lleno', false)

    // Guardar con el teclado: Tab hasta el botón de guardar y Enter.
    const guardar = dialogo.getByRole('button', { name: /guardar|registrar/i }).last()
    await tabHasta('botón Guardar', () => guardar.evaluate((el) => el === document.activeElement), 40)
    const respuesta = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/consultas\/?(\?|$)/.test(new URL(r.url()).pathname + new URL(r.url()).search),
      { timeout: 60_000 },
    )
    await tecla('Enter')
    const r = await respuesta
    const cuerpo = await r.json().catch(() => null)
    fs.writeFileSync(
      path.join(CARPETA, 'hu35-cp005-respuesta.json'),
      JSON.stringify({ status: r.status(), url: r.url(), consultaId: cuerpo?.consultaId ?? cuerpo?.id, cuerpo }, null, 1),
    )
    guardarBitacora()
    await page.waitForTimeout(1500)
    await capturar(page, testInfo, 'hu35-cp005-5-resultado')
    expect(r.status(), 'El POST de consultas no respondió 201').toBe(201)
  })
})
