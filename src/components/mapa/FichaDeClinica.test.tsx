// La ficha es lo que se lee en el globo de cada marcador (HU-28, criterio 2).

import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FichaDeClinica } from './FichaDeClinica'
import type { ClinicaPublica } from '@/lib/mapaDeLaRed'

const CLINICA: ClinicaPublica = {
  id: 1,
  name: 'Clínica Regional de Santa Ana',
  lat: 13.9942,
  lng: -89.5597,
  departamento: 'Santa Ana',
  municipio: 'Chalchuapa',
  direccion: 'Avenida Independencia Sur, Barrio Santa Bárbara',
  telefono: '2440-1234',
  horario: 'Lunes a viernes, 7:00 a 16:00',
}

/** El valor que acompaña a una etiqueta de la lista de definiciones. */
function valorDe(etiqueta: string): HTMLElement {
  const dt = screen.getByText(etiqueta, { selector: 'dt' })
  return dt.nextElementSibling as HTMLElement
}

describe('FichaDeClinica', () => {
  it('muestra el nombre, la dirección, el teléfono y el horario', () => {
    render(<FichaDeClinica clinica={CLINICA} />)

    expect(screen.getByRole('heading', { name: 'Clínica Regional de Santa Ana' })).toBeInTheDocument()
    expect(screen.getByText('Chalchuapa, Santa Ana')).toBeInTheDocument()
    expect(valorDe('Dirección')).toHaveTextContent('Avenida Independencia Sur, Barrio Santa Bárbara')
    expect(valorDe('Horario')).toHaveTextContent('Lunes a viernes, 7:00 a 16:00')
  })

  it('el teléfono es un enlace para llamar', () => {
    render(<FichaDeClinica clinica={CLINICA} />)
    const enlace = within(valorDe('Teléfono')).getByRole('link', { name: '2440-1234' })
    expect(enlace).toHaveAttribute('href', 'tel:24401234')
  })

  it('lo que falta se dice en vez de omitir la línea', () => {
    render(<FichaDeClinica clinica={{ ...CLINICA, direccion: null, telefono: null, horario: '' }} />)

    expect(valorDe('Dirección')).toHaveTextContent('No registrado')
    expect(valorDe('Teléfono')).toHaveTextContent('No registrado')
    expect(within(valorDe('Teléfono')).queryByRole('link')).toBeNull()
    expect(valorDe('Horario')).toHaveTextContent('No registrado')
  })
})
