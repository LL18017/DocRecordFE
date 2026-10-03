// HU-18 (DRS-89) · Evolución histórica de los signos vitales.
//
// Lo que vigila este archivo, sobre todo, es el criterio 3: que una gráfica sin
// datos suficientes explique qué falta en vez de dibujar un lienzo vacío. Una
// gráfica en blanco parece un error del sistema, y el médico no tiene forma de
// distinguir «este paciente sólo tiene una toma» de «esto se rompió».

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SignosVitalesDto } from '@/services/signosVitales'
import { EvolucionSignosVitales } from './EvolucionSignosVitales'

/** Una toma mínima; cada prueba sobreescribe lo que le interesa. */
function toma(diasAtras: number, cambios: Partial<SignosVitalesDto> = {}): SignosVitalesDto {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - diasAtras)
  return {
    signosVitalesId: diasAtras + 1,
    tomadoEn: fecha.toISOString(),
    paciente: { personaId: 1, expediente: 'EXP-000001', nombres: 'Ana', apellidos: 'Rivas' },
    enfermera: { personaId: 2, nombres: 'Marta', apellidos: 'Guevara' },
    consultaId: null,
    pesoKg: 70,
    estaturaCm: 170,
    temperaturaC: 36.8,
    presionSistolica: 120,
    presionDiastolica: 80,
    pulsoLpm: 72,
    frecuenciaRespRpm: 16,
    saturacionPct: 98,
    observaciones: null,
    imc: 24.2,
    clasificacionImc: 'Normal',
    ...cambios,
  }
}

describe('Evolución de signos vitales', () => {
  // ── Criterio 1 · alternar entre presión, peso e IMC ────────────────────────

  it('ofrece las tres medidas que pide la historia', () => {
    render(<EvolucionSignosVitales tomas={[toma(30), toma(10)]} />)

    expect(screen.getByRole('button', { name: 'Presión arterial' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Peso' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'IMC' })).toBeInTheDocument()
  })

  it('cambiar de medida marca la nueva y desmarca la anterior', async () => {
    render(<EvolucionSignosVitales tomas={[toma(30), toma(10)]} />)

    const presion = screen.getByRole('button', { name: 'Presión arterial' })
    const imc = screen.getByRole('button', { name: 'IMC' })
    expect(presion).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(imc)

    expect(imc).toHaveAttribute('aria-pressed', 'true')
    expect(presion).toHaveAttribute('aria-pressed', 'false')
  })

  // ── Criterio 2 · el rango filtra sin recargar ─────────────────────────────

  it('cambiar el rango filtra los datos que ya están en memoria', async () => {
    // Dos tomas de hace 200 días: quedan dentro del año y fuera del semestre.
    // Si al cambiar de rango hiciera falta ir al servidor, esta prueba no
    // podría pasar sin simular una petición — y ese es justo el punto.
    render(<EvolucionSignosVitales tomas={[toma(200), toma(210)]} />)

    // Con el rango por defecto (6 meses) no hay nada que dibujar.
    expect(screen.getByRole('status')).toHaveTextContent(/no hay tomas/i)

    await userEvent.click(screen.getByRole('button', { name: 'Último año' }))

    // Y ahora sí, sin que nadie haya vuelto a pedir datos.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('los tres rangos de la historia están disponibles', () => {
    render(<EvolucionSignosVitales tomas={[toma(5), toma(2)]} />)

    expect(screen.getByRole('button', { name: 'Último mes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6 meses' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Último año' })).toBeInTheDocument()
  })

  // ── Criterio 3 · menos de dos mediciones ──────────────────────────────────

  it('con una sola toma explica que hace falta otra, en vez de dibujar un punto suelto', () => {
    render(<EvolucionSignosVitales tomas={[toma(5)]} />)

    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent(/solo hay una toma/i)
    expect(aviso).toHaveTextContent(/al menos dos/i)
  })

  it('sin ninguna toma lo dice, y sugiere ampliar el rango', () => {
    render(<EvolucionSignosVitales tomas={[]} />)

    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent(/no hay tomas/i)
    expect(aviso).toHaveTextContent(/ampliar el rango/i)
  })

  it('cuenta las tomas que tienen ESA medida, no las tomas en total', async () => {
    // Una toma puede traer la presión y no el peso. Con tres tomas de las que
    // sólo una tiene peso, la gráfica de peso no puede dibujar una tendencia
    // aunque «haya tres tomas».
    const tomas = [
      toma(30, { pesoKg: 70 }),
      toma(20, { pesoKg: null, imc: null }),
      toma(10, { pesoKg: null, imc: null }),
    ]
    render(<EvolucionSignosVitales tomas={tomas} />)

    // La presión sí tiene tres puntos.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Peso' }))

    expect(screen.getByRole('status')).toHaveTextContent(/solo hay una toma/i)
  })

  // ── Criterio 4 · lo que se sale de rango se distingue ─────────────────────

  it('la leyenda anuncia el rango normal y la marca de fuera de rango', () => {
    render(<EvolucionSignosVitales tomas={[toma(30), toma(10)]} />)

    expect(screen.getByText(/rango normal/i)).toBeInTheDocument()
    expect(screen.getByText(/fuera de rango/i)).toBeInTheDocument()
  })

  it('el peso no anuncia rango normal, porque no lo tiene sin la talla', async () => {
    // Inventar una franja «normal» de peso sería afirmar algo que no se sabe:
    // depende de la estatura, y para eso está el IMC.
    render(<EvolucionSignosVitales tomas={[toma(30), toma(10)]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Peso' }))

    expect(screen.queryByText(/rango normal/i)).not.toBeInTheDocument()
  })
})
