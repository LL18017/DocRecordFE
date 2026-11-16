// HU-35 criterio 5 (DEF-18): una ventana modal se usa entera con el teclado.
// Al abrirla el foco entra a su primer campo; Tab y Shift+Tab no se escapan a la
// página de fondo; al cerrarla el foco vuelve al botón que la abrió.
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

function Pantalla() {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button>Control del fondo</button>
      <button onClick={() => setAbierta(true)}>Abrir</button>
      <Modal isOpen={abierta} onClose={() => setAbierta(false)} title="Nueva consulta">
        <label htmlFor="motivo">Motivo</label>
        <input id="motivo" />
        <button>Guardar</button>
      </Modal>
    </>
  )
}

describe('Modal · teclado (HU-35 c5)', () => {
  it('al abrirse, el foco entra al primer campo de la ventana', async () => {
    const user = userEvent.setup()
    render(<Pantalla />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(screen.getByLabelText('Motivo')).toHaveFocus()
  })

  it('Tab y Shift+Tab giran dentro de la ventana y no llegan al fondo', async () => {
    const user = userEvent.setup()
    render(<Pantalla />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    await user.tab() // Motivo → Guardar
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
    await user.tab() // Guardar → vuelve al primero de la ventana (Cerrar modal)
    expect(screen.getByRole('button', { name: 'Cerrar modal' })).toHaveFocus()
    await user.tab({ shift: true }) // Cerrar modal → último de la ventana
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Control del fondo' })).not.toHaveFocus()
  })

  it('al cerrarse con Escape, el foco vuelve al botón que la abrió', async () => {
    const user = userEvent.setup()
    render(<Pantalla />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    await user.click(abrir)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
  })
})
