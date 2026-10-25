// Flujos completos de HU-30, HU-32 y HU-14 contra el backend real.
//
// Necesitan un médico con sede, al menos un paciente cuyo nombre empiece por
// «Rosa» y otro por «Carlos», un tipo de cita y tipos de hábito en el
// catálogo. Agendan, reprograman y cancelan de verdad: correrlas solo contra
// un backend de desarrollo, nunca contra producción.

import { expect, test, type Page } from '@playwright/test'
import { CUENTAS, entrar } from './sesion'

/** Pasado mañana en El Salvador, `AAAA-MM-DD`: lejos de la regla de las 4 horas. */
function pasadoManana(): string {
  const f = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  return f.toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' })
}

async function agendar(page: Page, paciente: string, dia: string, hora: string) {
  await page.getByRole('button', { name: 'Agendar cita' }).click()
  const form = page.getByRole('form', { name: 'Agendar cita' })
  await form.getByLabel(/Paciente/).fill(paciente)
  await form.getByRole('button', { name: 'Buscar' }).click()
  await form.getByRole('list', { name: 'Pacientes encontrados' }).getByRole('button').first().click()
  await form.getByLabel(/^Día/).fill(dia)
  await form.getByLabel(/Hora disponible/).selectOption(hora)
  await form.getByRole('button', { name: 'Confirmar cita' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Cita agendada' })).toBeVisible()
}

test.describe('HU-30 y HU-32 · agenda de la sede', () => {
  test('agendar, reprogramar y cancelar con motivo; la franja cancelada queda libre', async ({ page }) => {
    const dia = pasadoManana()
    await entrar(page, CUENTAS.medico)
    await page.goto('/agenda')

    // HU-30 c4: se agenda y queda AGENDADA en la agenda de ese día.
    await agendar(page, 'Rosa', dia, '09:00')
    const deRosa = page.getByRole('listitem', { name: /Cita de Rosa .* a las 09:00/ })
    await expect(deRosa.getByText('Agendada')).toBeVisible()

    // HU-30 c1: la franja ocupada ya no se ofrece para ese médico.
    await page.getByRole('button', { name: 'Agendar cita' }).click()
    const form = page.getByRole('form', { name: 'Agendar cita' })
    await form.getByLabel(/^Día/).fill(dia)
    await expect(form.getByLabel(/Hora disponible/).locator('option', { hasText: '09:00' })).toHaveCount(0)
    await form.getByRole('button', { name: 'Volver' }).click()

    // HU-32 c3: reprogramar a otra franja libre.
    await deRosa.getByRole('button', { name: 'Reprogramar' }).click()
    const reprogramar = page.getByRole('form', { name: 'Reprogramar cita' })
    await reprogramar.getByLabel(/Hora disponible/).selectOption('10:00')
    await reprogramar.getByRole('button', { name: 'Reprogramar' }).click()
    const reprogramada = page.getByRole('listitem', { name: /Cita de Rosa .* a las 10:00/ })
    await expect(reprogramada).toBeVisible()

    // HU-32 c1 y c5: cancelar exige motivo y la cita sigue, cancelada.
    await reprogramada.getByRole('button', { name: 'Cancelar' }).click()
    const cancelar = page.getByRole('form', { name: 'Cancelar cita' })
    await cancelar.getByRole('button', { name: 'Cancelar la cita' }).click()
    await expect(cancelar.getByRole('alert')).toHaveText('El motivo de la cancelación es obligatorio.')
    await cancelar.getByLabel(/Motivo/).fill('La paciente viaja ese día')
    await cancelar.getByRole('button', { name: 'Cancelar la cita' }).click()
    await expect(reprogramada.getByText('Cancelada')).toBeVisible()
    await expect(reprogramada.getByText('Motivo: La paciente viaja ese día')).toBeVisible()

    // La franja de las 10:00 quedó libre: otro paciente la toma.
    await agendar(page, 'Carlos', dia, '10:00')
    await expect(page.getByRole('listitem', { name: /Cita de Carlos .* a las 10:00/ })).toBeVisible()
  })
})

test.describe('HU-14 · hábitos en el expediente', () => {
  test('registrar un hábito de riesgo alto, verlo destacado y editarlo', async ({ page }) => {
    await entrar(page, CUENTAS.medico)
    await page.goto('/pacientes')
    await page.getByText(/Rosa/).first().click()
    await page.waitForURL('**/pacientes/*')

    const seccion = page.getByRole('region', { name: 'Hábitos y Estilo de Vida' })
    await seccion.getByRole('button', { name: '+ Agregar' }).click()
    const form = seccion.getByRole('form', { name: 'Nuevo hábito' })
    await form.getByLabel(/Tipo de hábito/).selectOption({ label: 'Tabaquismo' })
    await form.getByLabel(/Nivel de riesgo/).selectOption('ALTO')
    await form.getByLabel(/Descripción/).fill('Fuma 10 cigarrillos al día')
    await form.getByRole('button', { name: 'Guardar hábito' }).click()

    const fila = seccion.getByRole('listitem').filter({ hasText: 'Fuma 10 cigarrillos al día' })
    await expect(fila.getByText('Riesgo alto')).toBeVisible()

    // Sigue ahí al recargar: quedó en la base, no solo en la pantalla.
    await page.reload()
    await page.getByRole('button', { name: 'Expandir Hábitos y Estilo de Vida' }).click()
    await expect(seccion.getByText('Fuma 10 cigarrillos al día')).toBeVisible()

    await seccion.getByRole('button', { name: 'Editar hábito: Tabaquismo' }).click()
    const edicion = seccion.getByRole('form', { name: 'Editar hábito' })
    await edicion.getByLabel(/Nivel de riesgo/).selectOption('BAJO')
    await edicion.getByLabel(/Descripción/).fill('Dejó de fumar hace un mes')
    await edicion.getByRole('button', { name: 'Guardar hábito' }).click()
    await expect(seccion.getByText('Dejó de fumar hace un mes')).toBeVisible()
    await expect(seccion.getByText('Riesgo bajo')).toBeVisible()
  })
})
