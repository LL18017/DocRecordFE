'use client'

// ─── Glosario del portal del paciente (HU-34, criterio 3) ──────────────────
//
// «Los términos técnicos vienen acompañados de una explicación breve en
// lenguaje comprensible». El texto de cada explicación NO vive aquí: lo manda
// el backend en `GET /mi/expediente` (ver GlosarioClinico.java), porque el PDF
// que se descarga tiene que explicar exactamente lo mismo y dos copias
// escritas a mano acaban diciendo cosas distintas. Este archivo solo decide
// CÓMO se muestra.
//
// ── Por qué la explicación va siempre a la vista ──────────────────────────
// Se descartaron el tooltip y el `<abbr title>` porque los dos esconden lo que
// el criterio pide mostrar: el `title` no se abre con el teclado ni en un
// teléfono, y un tooltip obliga a saber que hay algo que buscar. La
// explicación es una línea corta debajo del término, que se lee sin hacer
// nada y que un lector de pantalla recorre en orden. Para los campos que se
// repiten en cada consulta o receta, la explicación va una sola vez al
// principio de la sección (`TerminosDeLaSeccion`) en vez de repetirse en cada
// tarjeta.
//
// Una clave que el glosario no trae no rompe nada: se pinta el término sin
// explicación. Es preferible a un hueco o a un texto inventado aquí.

import React, { createContext, useContext, useMemo } from 'react'
import type { TerminoDelGlosarioDto } from '@/services/portal'

const ContextoDelGlosario = createContext<ReadonlyMap<string, TerminoDelGlosarioDto>>(new Map())

export const ProveedorDelGlosario: React.FC<{
  terminos: TerminoDelGlosarioDto[]
  children: React.ReactNode
}> = ({ terminos, children }) => {
  const mapa = useMemo(() => new Map(terminos.map((t) => [t.clave, t])), [terminos])
  return <ContextoDelGlosario.Provider value={mapa}>{children}</ContextoDelGlosario.Provider>
}

export function useTermino(clave: string): TerminoDelGlosarioDto | undefined {
  return useContext(ContextoDelGlosario).get(clave)
}

/** La explicación de una clave, en una línea pequeña. Nada si el glosario no la trae. */
export const Explicacion: React.FC<{ clave: string; className?: string }> = ({ clave, className = '' }) => {
  const termino = useTermino(clave)
  if (!termino) return null
  return <span className={`block text-xs font-normal normal-case tracking-normal text-slate-500 leading-relaxed ${className}`}>{termino.explicacion}</span>
}

/**
 * Un término con su explicación debajo. Sin `children` se pinta el nombre que
 * da el glosario.
 */
export const Termino: React.FC<{ clave: string; children?: React.ReactNode }> = ({ clave, children }) => {
  const termino = useTermino(clave)
  return (
    <span className="block">
      <span className="block">{children ?? termino?.termino ?? clave}</span>
      <Explicacion clave={clave} className="mt-0.5" />
    </span>
  )
}

/**
 * «Qué significa cada dato» de una sección: los campos que se repiten en cada
 * tarjeta, explicados una sola vez.
 */
export const TerminosDeLaSeccion: React.FC<{ claves: string[]; titulo?: string }> = ({
  claves,
  titulo = 'Qué significa cada dato',
}) => {
  const glosario = useContext(ContextoDelGlosario)
  const terminos = claves.map((c) => glosario.get(c)).filter((t): t is TerminoDelGlosarioDto => !!t)
  if (terminos.length === 0) return null
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{titulo}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {terminos.map((t) => (
          <div key={t.clave}>
            <dt className="text-xs font-semibold text-slate-700">{t.termino}</dt>
            <dd className="text-xs text-slate-500 leading-relaxed">{t.explicacion}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
