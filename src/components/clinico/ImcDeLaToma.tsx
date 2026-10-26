// HU-17 (DRS-88) · El IMC de una toma, con su clasificación de la OMS.
//
// «Dado que ingreso peso en kilogramos y talla en metros, cuando guardo,
//  entonces el sistema muestra el IMC con un decimal y su clasificación según
//  la OMS.»
// «Dado un paciente menor de 18 años, cuando se calcula el IMC, entonces el
//  sistema indica que la clasificación de adultos no aplica y debe
//  interpretarse por percentiles.»
//
// Hasta ahora el IMC y su clasificación salían en la API y se leían en la
// gráfica, pero ninguna pantalla de la toma los pintaba. Este componente es
// lo que faltaba, y se usa en la tarjeta de la ficha y en el detalle de la toma
// para que digan lo mismo.
//
// El cálculo y la clasificación son del backend (`IndiceDeMasaCorporal`): aquí
// solo se muestran. Repetir la tabla de la OMS en el cliente abriría la puerta a
// que dos pantallas clasifiquen distinto al mismo paciente, y a que una olvide
// la regla de los menores.
import React from 'react'
import { esAvisoDePercentiles, imcFueraDeRango, rangoNormalComoTexto } from '@/lib/rangosVitales'
import type { SignosVitalesDto } from '@/services/signosVitales'

interface ImcDeLaTomaProps {
  toma: Pick<SignosVitalesDto, 'imc' | 'clasificacionImc'>
  /** Quita el marco propio cuando ya va dentro de una celda. */
  className?: string
}

export function ImcDeLaToma({ toma, className = '' }: ImcDeLaTomaProps) {
  const { imc, clasificacionImc } = toma

  // Sin peso o sin talla no hay IMC, y se dice. Un IMC «aproximado» con uno de
  // los dos ausentes sería un número inventado.
  if (imc === null) {
    return (
      <div data-testid="imc" className={`rounded-xl bg-slate-50 px-3 py-2 ${className}`}>
        <p className="text-[11px] uppercase tracking-wider text-slate-400">IMC</p>
        <p className="text-sm italic text-slate-400">
          sin calcular: hacen falta el peso y la talla
        </p>
      </div>
    )
  }

  const paraPercentiles = esAvisoDePercentiles(clasificacionImc)
  const fuera = imcFueraDeRango(toma)

  return (
    <div
      data-testid="imc"
      data-fuera-de-rango={fuera ? 'true' : undefined}
      className={`rounded-xl px-3 py-2 ${
        fuera ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50'
      } ${className}`}
    >
      <p className="text-[11px] uppercase tracking-wider text-slate-400">IMC</p>
      <p
        className={`text-sm font-semibold font-outfit ${
          fuera ? 'text-red-700' : 'text-slate-800'
        }`}
      >
        {imc.toFixed(1)} <span className="text-xs font-normal text-slate-500">kg/m²</span>
        {/* En adultos va la clasificación de la OMS. En menores NO: ahí va el
            aviso de abajo, nunca «Normal» ni «Sobrepeso». */}
        {!paraPercentiles && clasificacionImc && (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              fuera ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {clasificacionImc}
          </span>
        )}
      </p>

      {fuera && (
        <p className="mt-0.5 text-[10px] font-semibold text-red-700">
          Fuera de rango (normal {rangoNormalComoTexto('imc')})
        </p>
      )}

      {/* El aviso es el texto exacto que devuelve el servidor, para que la API y
          la pantalla no puedan decir cosas distintas. */}
      {paraPercentiles && (
        <p
          role="note"
          className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800"
        >
          {clasificacionImc}
        </p>
      )}
    </div>
  )
}
