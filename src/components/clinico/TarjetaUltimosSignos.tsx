// La tarjeta «Últimos Signos Vitales» de la ficha del paciente.
//
// Salió de `pacientes/[id]/page.tsx` para poder probarla sola y porque ahora
// tiene lógica propia: resalta en rojo lo que está fuera de rango (HU-16,
// criterio 3) y muestra el IMC con su clasificación (HU-17).
//
// Lo toma enfermería y el médico solo lo lee —por eso aquí no hay ningún botón
// de «Registrar»: ofrecerlo a un médico sería pedirle algo que el backend le va
// a responder con 403—.
//
// Ya NO lleva `AvisoSinRegistro`: ese aviso decía «el sistema todavía no guarda
// esto», y desde V9 sí lo guarda. Dejarlo puesto mentiría en el otro sentido,
// que es el mismo error de la maqueta al revés.
import React from 'react'
import { ImcDeLaToma } from '@/components/clinico/ImcDeLaToma'
import {
  rangoNormalComoTexto,
  valoresFueraDeRango,
  type ClaveDeRango,
} from '@/lib/rangosVitales'
import { formatearFechaHora } from '@/services/consultas'
import { nombreDeEnfermera, tensionArterial, type SignosVitalesDto } from '@/services/signosVitales'

interface TarjetaUltimosSignosProps {
  /** `null` = el paciente aún no tiene ninguna toma activa. */
  ultimosVitales: SignosVitalesDto | null
  /** Si no se pudo consultar, el motivo: no se debe leer como «sin tomas». */
  errorVitales: string | null
}

export function TarjetaUltimosSignos({ ultimosVitales, errorVitales }: TarjetaUltimosSignosProps) {
  const fuera = ultimosVitales ? valoresFueraDeRango(ultimosVitales) : new Set<ClaveDeRango>()

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/80">
      <h4 className="font-bold text-slate-800 text-sm font-outfit mb-3">Últimos Signos Vitales</h4>

      {errorVitales ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800">
          {errorVitales}. No lo lea como «sin tomas»: no se pudo consultar.
        </p>
      ) : ultimosVitales === null ? (
        <p className="text-sm text-slate-500">
          No hay signos vitales registrados. Enfermería aún no le ha tomado constantes a este
          paciente.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {(
              [
                // [etiqueta, valor, unidad, claves que, si salen de rango, lo marcan]
                [
                  'Tensión',
                  tensionArterial(ultimosVitales),
                  'mmHg',
                  ['presionSistolica', 'presionDiastolica'],
                ],
                ['Pulso', ultimosVitales.pulsoLpm, 'lpm', ['pulsoLpm']],
                ['Temperatura', ultimosVitales.temperaturaC, '°C', ['temperaturaC']],
                ['Saturación', ultimosVitales.saturacionPct, '%', ['saturacionPct']],
                ['Frec. resp.', ultimosVitales.frecuenciaRespRpm, 'rpm', ['frecuenciaRespRpm']],
                // Peso y estatura no tienen rango normal: nunca se marcan. El
                // peso se juzga por el IMC, que va más abajo.
                ['Peso', ultimosVitales.pesoKg, 'kg', []],
                ['Estatura', ultimosVitales.estaturaCm, 'cm', []],
              ] as [string, string | number | null, string, ClaveDeRango[]][]
            ).map(([etiqueta, valor, unidad, claves]) => {
              const salePorFuera = valor !== null && claves.some((c) => fuera.has(c))
              return (
                // Una medida que no se tomó se pinta «—», nunca 0: la diferencia
                // entre «no se tomó la saturación» y «la saturación es 0» es la
                // diferencia entre un hueco y una urgencia.
                <div
                  key={etiqueta}
                  data-fuera-de-rango={salePorFuera ? 'true' : undefined}
                  className={`rounded-xl px-3 py-2 ${
                    salePorFuera ? 'bg-red-50 ring-1 ring-red-200' : 'bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">{etiqueta}</p>
                  <p
                    className={`text-sm font-semibold font-outfit ${
                      valor === null
                        ? 'text-slate-400'
                        : salePorFuera
                          ? 'text-red-700'
                          : 'text-slate-800'
                    }`}
                  >
                    {valor === null ? (
                      '—'
                    ) : (
                      <>
                        {valor}{' '}
                        <span className="text-xs font-normal text-slate-500">{unidad}</span>
                      </>
                    )}
                  </p>
                  {/* Con palabras y no solo con el color: quien no distingue el
                      rojo también tiene que ver que algo salió de rango. */}
                  {salePorFuera && (
                    <p className="text-[10px] font-semibold text-red-700">
                      Fuera de rango (normal{' '}
                      {claves.map((c) => rangoNormalComoTexto(c)).filter(Boolean).join(' / ')})
                    </p>
                  )}
                </div>
              )
            })}

            {/* HU-17: el IMC con su clasificación, o el aviso de percentiles. */}
            <ImcDeLaToma toma={ultimosVitales} className="col-span-2" />
          </div>

          {ultimosVitales.observaciones && (
            <p className="text-sm text-slate-600 mb-3 leading-relaxed">
              {ultimosVitales.observaciones}
            </p>
          )}

          {/* Quién y cuándo, siempre: una constante sin responsable ni hora no le
              sirve al médico para decidir nada. */}
          <p className="text-xs text-slate-400">
            Tomado el {formatearFechaHora(ultimosVitales.tomadoEn)} ·{' '}
            {nombreDeEnfermera(ultimosVitales)}
          </p>
        </>
      )}
    </div>
  )
}
