'use client'

// ─── Mi expediente · el portal del paciente (HU-34) ────────────────────────
//
// La pantalla del rol PACIENTE: su expediente clínico, en solo lectura, con
// los términos técnicos explicados y la descarga en PDF.
//
// ── De dónde salen los datos ──────────────────────────────────────────────
// De UNA sola llamada, `GET /mi/expediente`, que no lleva ningún id: el
// backend arma siempre el expediente de la sesión (PacienteAutenticado). Por
// eso esta pantalla no lee un id de la URL ni del contexto, y no hay forma de
// que muestre el de otra persona (criterio 2). Abrirla y descargar el PDF
// quedan registrados en la bitácora de accesos del servidor (criterio 6).
//
// ── Por qué no hay un solo botón de edición ───────────────────────────────
// Criterio 4: el portal es de solo lectura. El backend no le acepta a este rol
// ninguna escritura clínica; ofrecer aquí un botón de «editar» sería prometer
// algo que el servidor va a rechazar con 403. Si un dato está mal, lo corrige
// el personal de la clínica, y la pantalla lo dice.
//
// ── La ruta sigue siendo /mi-panel ────────────────────────────────────────
// Era la pantalla «Mi información», que solo mostraba la sesión porque el
// backend todavía no le permitía nada a este rol. Se conserva la dirección
// —es la que `rutaPorDefecto` le da al paciente al iniciar sesión— y aquí
// creció el portal, como estaba previsto.

import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ProveedorDelGlosario, TerminosDeLaSeccion } from '@/components/portal/Glosario'
import {
  DatosPersonales,
  MisAlergias,
  MisConsultas,
  MisProximasCitas,
  MisRecetas,
  MisSignosVitales,
} from '@/components/portal/SeccionesDelExpediente'
import { descargarMiExpedientePdf, obtenerMiExpediente, type MiExpedienteDto } from '@/services/portal'

export default function MiExpedientePage() {
  const [expediente, setExpediente] = useState<MiExpedienteDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setExpediente(await obtenerMiExpediente())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir tu expediente.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver medicamentos/page.tsx
    void cargar()
  }, [cargar])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-outfit">Mi expediente</h1>
          <p className="text-sm text-slate-500 mt-1">
            {expediente
              ? `${expediente.paciente.nombres} ${expediente.paciente.apellidos} · Expediente ${expediente.paciente.expediente}`
              : 'Tu historia clínica en DocRecord Sv.'}
          </p>
        </div>
        {expediente && <BotonDescargarPdf expediente={expediente.paciente.expediente} />}
      </header>

      <p
        role="note"
        className="rounded-xl border-2 border-doc-blue/20 bg-doc-blue/5 px-4 py-3 text-sm text-slate-700 flex gap-3"
      >
        <Icon name="eye" size={18} className="mt-0.5" />
        <span>
          <span className="font-semibold">Solo lectura.</span> Esto es lo que el personal de tu clínica registró en
          tu expediente. Desde aquí no se puede modificar: si algún dato no es correcto, pide en tu clínica que lo
          corrijan.
        </span>
      </p>

      {cargando && !expediente && (
        <p role="status" className="text-sm text-slate-500">
          Cargando tu expediente…
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-2 text-sm font-semibold underline cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {expediente && (
        <ProveedorDelGlosario terminos={expediente.glosario}>
          <DatosPersonales paciente={expediente.paciente} />
          <MisAlergias alergias={expediente.alergias} />
          <MisProximasCitas citas={expediente.proximasCitas} />
          <MisSignosVitales toma={expediente.ultimosSignosVitales} />
          <MisConsultas consultas={expediente.consultas} />
          <MisRecetas recetas={expediente.recetas} />

          {/* El glosario entero, para leerlo de corrido; cada sección ya trae
              sus términos explicados donde aparecen. */}
          <details className="rounded-2xl border-2 border-slate-200 bg-white p-6">
            <summary className="cursor-pointer font-bold text-slate-900 font-outfit">
              Glosario: qué significa cada término
            </summary>
            <div className="mt-4">
              <TerminosDeLaSeccion claves={expediente.glosario.map((t) => t.clave)} titulo="Términos del expediente" />
            </div>
          </details>
        </ProveedorDelGlosario>
      )}
    </div>
  )
}

/** HU-34 c5: baja el expediente en PDF. */
const BotonDescargarPdf: React.FC<{ expediente: string }> = ({ expediente }) => {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const descargar = async () => {
    setGenerando(true)
    setError(null)
    try {
      await descargarMiExpedientePdf(expediente)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF de tu expediente.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={descargar}
        disabled={generando}
        className="h-10 px-4 rounded-xl bg-doc-blue text-white text-sm font-semibold hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {generando ? 'Generando PDF…' : 'Descargar mi expediente (PDF)'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
