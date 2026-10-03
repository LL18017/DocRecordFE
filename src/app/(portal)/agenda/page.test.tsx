// Guardas de la agenda.
//
// EL FALLO: la pantalla mostraba cinco citas inventadas, todas asignadas a un
// «Dr. Juan Guerra» que no existe, sacadas de `@/data/mockData` y sin una sola
// llamada al backend. No hay endpoint de citas: no hay nada que cargar.
//
// Un médico podía organizar su día con esa agenda. Estas pruebas fijan que la
// pantalla no vuelva a parecer real: ni citas, ni tabla, ni botón que prometa
// agendar algo que no llega a ninguna parte.
//
// Y tampoco un «no tiene citas» vacío: eso también es una afirmación, y es una
// que este sistema no puede hacer porque no existe ningún registro de citas
// del que pueda ser verdad. Una agenda vacía se lee como «tengo la mañana
// libre», el mismo error que las cinco citas falsas pero al revés.

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { appointments } from '@/data/mockData'
import AgendaPage from './page'

describe('agenda · lo que ya no inventa', () => {
  it('no muestra ninguna de las citas de la maqueta', () => {
    render(<AgendaPage />)

    // Se leen del propio mockData: si alguien vuelve a conectarlo, aunque
    // cambie los nombres, esta prueba lo ve.
    for (const cita of appointments) {
      expect(screen.queryByText(new RegExp(cita.patient.split(' ')[0]))).toBeNull()
      expect(screen.queryByText(cita.time)).toBeNull()
    }
    expect(screen.queryByText(/juan guerra/i)).toBeNull()
  })

  it('no pinta una tabla ni un calendario que parezcan una agenda', () => {
    render(<AgendaPage />)

    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByPlaceholderText(/buscar cita/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /calendario/i })).toBeNull()
  })

  it('no ofrece agendar una cita que no se guardaría en ninguna parte', () => {
    render(<AgendaPage />)

    expect(screen.queryByRole('button', { name: /nueva cita/i })).toBeNull()
  })

  it('dice que la sección no está disponible, no que no haya citas', () => {
    render(<AgendaPage />)

    expect(screen.getByRole('status')).toHaveTextContent(/todavía no está disponible/i)
    // La frase que NO puede aparecer: afirmaría algo sobre unas citas que
    // nadie ha registrado nunca.
    expect(screen.queryByText(/no tiene citas/i)).toBeNull()
    expect(screen.queryByText(/sin citas para hoy/i)).toBeNull()
  })

  it('deja una salida hacia lo que sí está registrado', () => {
    render(<AgendaPage />)

    expect(screen.getByRole('link', { name: /ver consultas médicas/i })).toHaveAttribute(
      'href',
      '/consultas',
    )
  })
})
