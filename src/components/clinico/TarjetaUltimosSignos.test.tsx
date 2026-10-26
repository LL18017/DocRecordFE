// HU-16 (DRS-26) criterio 3 · HU-17 (DRS-88) criterios 1 y 2.
//
// La tarjeta «Últimos Signos Vitales» de la ficha: lo que se sale del rango
// normal va destacado en rojo, y el IMC sale con su clasificación de la OMS (o
// con el aviso de percentiles en un menor).
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { SignosVitalesDto } from '@/services/signosVitales'
import { TarjetaUltimosSignos } from './TarjetaUltimosSignos'

const PERCENTILES =
  'La clasificación de adultos no aplica en menores de 18 años; debe interpretarse por percentiles'

function toma(cambios: Partial<SignosVitalesDto> = {}): SignosVitalesDto {
  return {
    signosVitalesId: 1,
    tomadoEn: '2026-09-02T07:45:00',
    paciente: { personaId: 1, expediente: 'EXP-1', nombres: 'Ana', apellidos: 'Rivas' },
    enfermera: { personaId: 2, nombres: 'Marta', apellidos: 'Guevara' },
    consultaId: null,
    pesoKg: 70,
    estaturaCm: 175,
    temperaturaC: 36.8,
    presionSistolica: 120,
    presionDiastolica: 80,
    pulsoLpm: 72,
    frecuenciaRespRpm: 16,
    saturacionPct: 98,
    observaciones: null,
    imc: 22.9,
    clasificacionImc: 'Normal',
    estado: 'ACTIVA',
    motivoAnulacion: null,
    anuladaEn: null,
    anuladaPor: null,
    ...cambios,
  }
}

function celda(etiqueta: string): HTMLElement {
  const rotulo = screen.getByText(etiqueta, { selector: 'p' })
  const celda = rotulo.parentElement
  if (!celda) throw new Error(`«${etiqueta}» no está en una celda`)
  return celda
}

describe('TarjetaUltimosSignos · fuera de rango en rojo (HU-16 criterio 3)', () => {
  it('una toma normal no destaca nada en rojo', () => {
    const { container } = render(
      <TarjetaUltimosSignos ultimosVitales={toma()} errorVitales={null} />,
    )

    expect(container.querySelector('[data-fuera-de-rango="true"]')).toBeNull()
    expect(screen.queryByText(/fuera de rango/i)).not.toBeInTheDocument()
  })

  it('la temperatura de 40 °C y la tensión de 150/95 salen destacadas, y lo demás no', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ temperaturaC: 40, presionSistolica: 150, presionDiastolica: 95 })}
        errorVitales={null}
      />,
    )

    expect(celda('Temperatura')).toHaveAttribute('data-fuera-de-rango', 'true')
    expect(celda('Temperatura')).toHaveClass('bg-red-50')
    expect(within(celda('Temperatura')).getByText('40')).toHaveClass('text-red-700')
    expect(celda('Tensión')).toHaveAttribute('data-fuera-de-rango', 'true')

    expect(celda('Pulso')).not.toHaveAttribute('data-fuera-de-rango')
    expect(celda('Saturación')).not.toHaveAttribute('data-fuera-de-rango')
  })

  it('lo dice con palabras, no solo con el color', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ saturacionPct: 88 })}
        errorVitales={null}
      />,
    )

    expect(within(celda('Saturación')).getByText(/fuera de rango/i)).toHaveTextContent('95–100 %')
  })

  it('el peso y la estatura nunca se destacan, por extremos que sean', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ pesoKg: 390, estaturaCm: 249, imc: 22.9 })}
        errorVitales={null}
      />,
    )

    expect(celda('Peso')).not.toHaveAttribute('data-fuera-de-rango')
    expect(celda('Estatura')).not.toHaveAttribute('data-fuera-de-rango')
  })

  it('una medida que no se tomó no se destaca: es un hueco, no un valor', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ temperaturaC: null })}
        errorVitales={null}
      />,
    )

    expect(celda('Temperatura')).not.toHaveAttribute('data-fuera-de-rango')
    expect(within(celda('Temperatura')).getByText('—')).toBeInTheDocument()
  })
})

describe('TarjetaUltimosSignos · IMC (HU-17)', () => {
  it('muestra el IMC con un decimal y su clasificación de la OMS', () => {
    render(<TarjetaUltimosSignos ultimosVitales={toma()} errorVitales={null} />)

    const imc = screen.getByTestId('imc')
    expect(imc).toHaveTextContent('22.9')
    expect(imc).toHaveTextContent('kg/m²')
    expect(within(imc).getByText('Normal')).toBeInTheDocument()
    expect(imc).not.toHaveAttribute('data-fuera-de-rango')
  })

  it('un IMC de adulto fuera de la franja normal se destaca en rojo, con su clasificación', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ imc: 31, clasificacionImc: 'Obesidad grado I' })}
        errorVitales={null}
      />,
    )

    const imc = screen.getByTestId('imc')
    expect(imc).toHaveAttribute('data-fuera-de-rango', 'true')
    expect(within(imc).getByText('Obesidad grado I')).toBeInTheDocument()
    expect(imc).toHaveTextContent(/fuera de rango/i)
  })

  it('un IMC con un solo decimal se escribe con él: 16 sale «16.0»', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ imc: 16, clasificacionImc: PERCENTILES })}
        errorVitales={null}
      />,
    )

    expect(screen.getByTestId('imc')).toHaveTextContent('16.0')
  })

  it('en un menor de 18 años muestra el aviso de percentiles, no una etiqueta de adultos', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ imc: 16, clasificacionImc: PERCENTILES })}
        errorVitales={null}
      />,
    )

    const imc = screen.getByTestId('imc')
    expect(within(imc).getByRole('note')).toHaveTextContent(PERCENTILES)
    // Ni «Bajo peso» ni «Normal» ni «Sobrepeso»: la tabla de adultos no aplica,
    // y el 16 NO se marca en rojo aunque esté bajo 18.5.
    expect(within(imc).queryByText(/^(Bajo peso|Normal|Sobrepeso)/)).not.toBeInTheDocument()
    expect(imc).not.toHaveAttribute('data-fuera-de-rango')
  })

  it('sin peso o sin talla dice que el IMC no se pudo calcular, en vez de inventarlo', () => {
    render(
      <TarjetaUltimosSignos
        ultimosVitales={toma({ pesoKg: null, imc: null, clasificacionImc: null })}
        errorVitales={null}
      />,
    )

    expect(screen.getByTestId('imc')).toHaveTextContent(/sin calcular/i)
  })
})

describe('TarjetaUltimosSignos · estados vacíos', () => {
  it('sin tomas lo dice', () => {
    render(<TarjetaUltimosSignos ultimosVitales={null} errorVitales={null} />)

    expect(screen.getByText(/No hay signos vitales registrados/)).toBeInTheDocument()
  })

  it('si no se pudo consultar, no lo presenta como «sin tomas»', () => {
    render(<TarjetaUltimosSignos ultimosVitales={null} errorVitales="Fallo de red" />)

    expect(screen.getByText(/No lo lea como «sin tomas»/)).toBeInTheDocument()
  })
})
