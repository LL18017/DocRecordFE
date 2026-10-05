// Al mapa público se llega sin cuenta (HU-28): desde la portada y desde el
// login, que es donde cae quien busca dónde atenderse sin saber que no
// necesita iniciar sesión.

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomePage from '../page'
import LoginPage from '../login/page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ iniciarSesion: vi.fn() }),
}))

describe('enlaces al mapa de clínicas', () => {
  it('la portada lleva al mapa', () => {
    render(<HomePage />)
    expect(screen.getByRole('link', { name: /ver clínicas en el mapa/i })).toHaveAttribute('href', '/mapa')
  })

  it('el login lleva al mapa', () => {
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: /ver el mapa de clínicas/i })).toHaveAttribute('href', '/mapa')
  })
})
