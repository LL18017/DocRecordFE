// Pruebas end-to-end: el navegador de verdad contra la aplicación de verdad.
//
// Complementan a Vitest, no lo sustituyen. Vitest monta un componente con la
// sesión simulada y comprueba su lógica en milisegundos; aquí se abre Chromium,
// se escribe una URL y se ve qué pasa. Es la única forma de comprobar el
// criterio 2 de HU-03 tal como está redactado —«cuando escribo manualmente la
// URL»—, porque una prueba de componente nunca escribe una URL.
//
// EXIGEN EL BACKEND LEVANTADO en :8080 y su base en :5433. No se levanta desde
// aquí a propósito: arrancar Spring Boot por cada corrida tomaría más que las
// pruebas, y una base compartida con datos reales del equipo no debe
// reinicializarse sola.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',

  // Sin paralelismo: estas pruebas comparten una base de datos. Dos
  // trabajadores creando pacientes a la vez se pisan los DUI y los correos, y
  // el fallo aparece de forma intermitente, que es la peor clase de fallo.
  fullyParallel: false,
  workers: 1,

  // En CI no se permiten `.only` olvidados: dejarían pasar una corrida que solo
  // ejecutó una prueba.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI ? 'list' : [['html', { open: 'never' }], ['list']],

  // Generoso a propósito: `next dev` COMPILA cada ruta la primera vez que se
  // visita, y el panel con sus gráficas tarda decenas de segundos en una
  // máquina cargada. Un tiempo corto no detecta un fallo, detecta al
  // compilador -y manda a depurar la guarda cuando lo que faltaba era esperar.
  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: 'http://localhost:3000',
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    // Rastro solo del primer reintento: pesa, y guardarlo de todo convierte la
    // carpeta de resultados en cientos de megas.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-SV',
    timezoneId: 'America/El_Salvador',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Levanta `next dev` si el puerto está libre, y lo reutiliza si ya está
  // corriendo: durante el desarrollo el servidor suele estar abierto y
  // rearrancarlo por cada corrida cuesta medio minuto.
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
