'use client'

// ─── Mi perfil · el portal del paciente (DEF-07: HU-33 c4, HU-14 c4) ───────
//
// La segunda pantalla del rol PACIENTE, junto a «Mi expediente»: sus datos
// básicos, la preferencia de recordatorios de cita por correo (lo único que
// puede cambiar aquí) y sus hábitos en solo lectura.
//
// · Nada lleva un id: `GET /api/mi-perfil` y `GET /api/mi-perfil/habitos`
//   resuelven al paciente por la sesión, como `/mi/expediente`.
// · El interruptor NO es optimista: cambia cuando el servidor confirmó. Si el
//   PUT falla, el interruptor se queda como estaba y se dice por qué; si no,
//   la pantalla mostraría una preferencia que el servidor no guardó, y el
//   recordatorio llegaría (o no) en contra de lo que se ve.
// · Los hábitos son de solo lectura: el backend no le acepta escrituras al
//   paciente, y los anulados no vienen (los corrigió el personal).

import React, { useCallback, useEffect, useId, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { etiquetaDeNivel, ordenarPorRiesgo, type HabitoDto, type NivelDeHabito } from '@/services/habitos'
import { actualizarRecordatorios, listarMisHabitos, obtenerMiPerfil, type MiPerfilDto } from '@/services/miPerfil'
import type { IconName } from '@/types'

const mensajeDe = (err: unknown, porDefecto: string) =>
  err instanceof Error && err.message ? err.message : porDefecto

export default function MiPerfilPage() {
  const [perfil, setPerfil] = useState<MiPerfilDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setPerfil(await obtenerMiPerfil())
      setError(null)
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo abrir tu perfil.'))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver mi-panel/page.tsx
    void cargar()
  }, [cargar])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 font-outfit">Mi perfil</h1>
        <p className="text-sm text-slate-600 mt-1">
          {perfil
            ? `${perfil.nombres} ${perfil.apellidos} · Expediente ${perfil.expediente}`
            : 'Tus datos y tus preferencias en DocRecord Sv.'}
        </p>
      </header>

      {cargando && !perfil && (
        <p role="status" className="text-sm text-slate-600">
          Cargando tu perfil…
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

      {perfil && (
        <>
          <MisDatos perfil={perfil} />
          <PreferenciaDeRecordatorios perfil={perfil} onActualizado={setPerfil} />
          <MisHabitos />
        </>
      )}
    </div>
  )
}

const Seccion: React.FC<{ id: string; titulo: string; icono: IconName; children: React.ReactNode }> = ({
  id,
  titulo,
  icono,
  children,
}) => (
  <section aria-labelledby={id} className="rounded-2xl border-2 border-slate-200 bg-white p-4 sm:p-6 space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-doc-navy flex items-center justify-center flex-shrink-0">
        <Icon name={icono} size={18} color="white" />
      </div>
      <h2 id={id} className="text-lg font-bold text-slate-900 font-outfit">
        {titulo}
      </h2>
    </div>
    {children}
  </section>
)

const etiquetaClass = 'text-xs font-semibold text-slate-600 uppercase tracking-wider'

const MisDatos: React.FC<{ perfil: MiPerfilDto }> = ({ perfil }) => {
  const datos = [
    { etiqueta: 'Nombre', valor: `${perfil.nombres} ${perfil.apellidos}` },
    { etiqueta: 'Número de expediente', valor: perfil.expediente },
    { etiqueta: 'Correo', valor: perfil.correo },
    { etiqueta: 'Teléfono', valor: perfil.telefono },
  ]
  return (
    <Seccion id="perfil-datos" titulo="Mis datos" icono="person">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {datos.map((d) => (
          <div key={d.etiqueta} className="min-w-0">
            <dt className={etiquetaClass}>{d.etiqueta}</dt>
            <dd className="text-sm text-slate-900 mt-1 break-words">{d.valor?.trim() ? d.valor : 'No registrado'}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-600">
        Si algún dato no es correcto, pide en tu clínica que lo corrijan.
      </p>
    </Seccion>
  )
}

/** HU-33 c4: el interruptor de los recordatorios de cita por correo. */
const PreferenciaDeRecordatorios: React.FC<{
  perfil: MiPerfilDto
  onActualizado: (p: MiPerfilDto) => void
}> = ({ perfil, onActualizado }) => {
  const uid = useId()
  const idEtiqueta = `${uid}-etiqueta`
  const idAyuda = `${uid}-ayuda`
  const [guardando, setGuardando] = useState(false)
  const [confirmacion, setConfirmacion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activo = perfil.recibeRecordatorios

  const alternar = async () => {
    if (guardando) return
    setGuardando(true)
    setError(null)
    setConfirmacion(null)
    try {
      const actualizado = await actualizarRecordatorios(!activo)
      onActualizado(actualizado)
      setConfirmacion(
        actualizado.recibeRecordatorios
          ? 'Listo: te enviaremos un recordatorio por correo antes de cada cita.'
          : 'Listo: ya no te enviaremos recordatorios de citas por correo.',
      )
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo guardar tu preferencia de recordatorios.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Seccion id="perfil-recordatorios" titulo="Recordatorios" icono="bell">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={idEtiqueta} className="text-sm font-semibold text-slate-900">
            Recibir recordatorios de citas por correo
          </p>
          <p id={idAyuda} className="text-xs text-slate-600 mt-1">
            Un día antes de cada cita. Las confirmaciones de cita agendada, cancelada o reprogramada te seguirán
            llegando aunque lo apagues.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          aria-labelledby={idEtiqueta}
          aria-describedby={idAyuda}
          aria-busy={guardando}
          disabled={guardando}
          onClick={() => void alternar()}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-doc-blue focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
            activo ? 'border-doc-blue bg-doc-blue' : 'border-slate-500 bg-slate-200'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              activo ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      <p className="text-xs font-semibold text-slate-700" aria-hidden="true">
        {guardando ? 'Guardando…' : activo ? 'Activado' : 'Desactivado'}
      </p>
      {confirmacion && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {confirmacion}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </Seccion>
  )
}

const COLOR_DE_NIVEL: Record<NivelDeHabito, string> = {
  ALTO: 'bg-red-100 text-red-700 border-red-200',
  MODERADO: 'bg-amber-100 text-amber-800 border-amber-200',
  BAJO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** HU-14 c4: los hábitos del paciente, sin un solo control que los cambie. */
const MisHabitos: React.FC = () => {
  const [habitos, setHabitos] = useState<HabitoDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setHabitos(ordenarPorRiesgo(await listarMisHabitos()))
      setError(null)
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron cargar tus hábitos.'))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar
    void cargar()
  }, [cargar])

  return (
    <Seccion id="perfil-habitos" titulo="Mis hábitos y estilo de vida" icono="vitals">
      <p className="text-xs text-slate-600">
        Solo lectura: los registra el personal de tu clínica durante tus consultas.
      </p>
      {error ? (
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
      ) : habitos === null ? (
        <p className="text-sm text-slate-600">Cargando tus hábitos…</p>
      ) : habitos.length === 0 ? (
        <p className="text-sm text-slate-600">No tienes hábitos registrados.</p>
      ) : (
        <ul aria-label="Mis hábitos" className="divide-y divide-slate-100">
          {habitos.map((h) => (
            <li key={h.id} className="py-3 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 break-words">{h.tipoHabito.descripcion}</span>
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    COLOR_DE_NIVEL[h.nivel] ?? COLOR_DE_NIVEL.BAJO
                  }`}
                >
                  {etiquetaDeNivel(h.nivel)}
                </span>
              </div>
              <p className="text-sm text-slate-700 break-words">{h.descripcion}</p>
              <p className="text-sm text-slate-700 break-words">Frecuencia: {h.frecuencia}</p>
              {h.observaciones && <p className="text-sm text-slate-700 break-words">Observaciones: {h.observaciones}</p>}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}
