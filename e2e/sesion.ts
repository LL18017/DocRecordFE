// Ayudas de sesión para las pruebas end-to-end.
//
// LAS CREDENCIALES NO SE ESCRIBEN AQUÍ. Este repositorio es público, y una
// contraseña committeada sigue estando en el historial de git aunque después se
// borre del archivo. Se leen del entorno; ver `.env.e2e.example`.
import { expect, type Page } from '@playwright/test'

/**
 * Lee una credencial del entorno o detiene la prueba explicando cómo darla.
 *
 * Falla en vez de usar un valor por defecto: un defecto silencioso haría que la
 * prueba intentara entrar con un usuario que no existe y reportara "credenciales
 * incorrectas", que manda a depurar el sitio equivocado.
 */
function delEntorno(variable: string): string {
  const valor = process.env[variable]
  if (!valor) {
    throw new Error(
      `Falta la variable ${variable}. Las pruebas e2e necesitan cuentas reales del ` +
        `entorno de desarrollo: copie .env.e2e.example, rellénelo y expórtelo antes de correr.`,
    )
  }
  return valor
}

export const CUENTAS = {
  get medico() {
    return { email: delEntorno('E2E_MEDICO_EMAIL'), password: delEntorno('E2E_MEDICO_PASSWORD') }
  },
  get enfermera() {
    return {
      email: delEntorno('E2E_ENFERMERA_EMAIL'),
      password: delEntorno('E2E_ENFERMERA_PASSWORD'),
    }
  },
}

/**
 * Entra al sistema y deja el navegador dentro del portal.
 *
 * Incluye la selección de clínica porque es un paso obligatorio del flujo real:
 * el login lleva a `/select-clinica`, no al panel. Saltárselo dejaría la sesión
 * sin sede activa y varias pantallas se comportan distinto.
 */
export async function entrar(page: Page, cuenta: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel(/correo electrónico/i).fill(cuenta.email)
  await page.getByLabel(/contraseña/i).fill(cuenta.password)
  await page.getByRole('button', { name: /ingresar al sistema/i }).click()

  await page.waitForURL('**/select-clinica', { timeout: 90_000 })

  // La primera sede que ofrezca. Cuál sea da igual para estas pruebas; lo que
  // importa es que haya alguna, y si no la hay conviene decirlo claro en vez de
  // fallar más adelante con un tiempo agotado sin explicación.
  const sedes = page.getByRole('button', { name: /clínica/i })
  await expect(
    sedes.first(),
    'La cuenta no tiene ninguna clínica asignada: asígnele una desde Usuarios y Roles.',
  ).toBeVisible({ timeout: 90_000 })
  await sedes.first().click()

  await page.waitForURL('**/dashboard', { timeout: 90_000 })
}
