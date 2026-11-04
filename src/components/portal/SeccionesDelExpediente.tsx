'use client'

// ─── Las secciones del expediente en el portal del paciente (HU-34) ─────────
//
// Todo aquí es de SOLO LECTURA (criterio 4): no hay un botón que edite, anule
// o borre, ni un formulario. No es solo una decisión de pantalla —el backend
// no le acepta al rol PACIENTE ninguna escritura clínica y `/mi` no tiene un
// solo método que escriba—, pero ofrecer un botón que el servidor va a
// rechazar sería convertir esa regla en un 403 en la cara del paciente.
//
// Cada sección lleva sus términos explicados (criterio 3, ver Glosario.tsx) y
// su estado vacío dicho con palabras: en un expediente, «no tienes alergias
// registradas» y «no se cargaron» no son lo mismo, y una lista en blanco no
// distingue entre las dos.

import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { TablaDeMedicamentos } from '@/components/clinico/TablaDeMedicamentos'
import type { IconName } from '@/types'
import { etiquetaDeSeveridad, type AlergiaDto } from '@/services/alergias'
import type { CitaDto } from '@/services/citas'
import { formatearFechaHora, type ConsultaDto } from '@/services/consultas'
import type { PrescripcionDto } from '@/services/prescripciones'
import type { SignosVitalesDto } from '@/services/signosVitales'
import type { DatosDelPacienteDto } from '@/services/portal'
import { Explicacion, Termino, TerminosDeLaSeccion } from './Glosario'

// ─── Marco común ───────────────────────────────────────────────────────────

const Seccion: React.FC<{
  id: string
  titulo: string
  icono: IconName
  children: React.ReactNode
}> = ({ id, titulo, icono, children }) => (
  <section aria-labelledby={id} className="rounded-2xl border-2 border-slate-200 bg-white p-6 space-y-4">
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

const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-slate-500">{children}</p>
)

const etiquetaClass = 'text-xs font-semibold text-slate-500 uppercase tracking-wider'

// ─── Datos personales ──────────────────────────────────────────────────────

export const DatosPersonales: React.FC<{ paciente: DatosDelPacienteDto }> = ({ paciente }) => {
  const datos: { clave?: string; etiqueta: string; valor: string | null }[] = [
    { clave: 'expediente', etiqueta: 'Número de expediente', valor: paciente.expediente },
    { etiqueta: 'DUI', valor: paciente.dui },
    {
      etiqueta: 'Fecha de nacimiento',
      valor: paciente.fechaNacimiento ? formatearFechaHora(paciente.fechaNacimiento) : null,
    },
    { etiqueta: 'Sexo', valor: paciente.sexo === 'F' ? 'Femenino' : paciente.sexo === 'M' ? 'Masculino' : null },
    { clave: 'tipoSangre', etiqueta: 'Tipo de sangre', valor: paciente.tipoSangre },
    { etiqueta: 'Teléfono', valor: paciente.telefono },
    { etiqueta: 'Correo', valor: paciente.email },
    { etiqueta: 'Dirección', valor: paciente.direccion },
  ]

  return (
    <Seccion id="seccion-datos" titulo="Mis datos" icono="person">
      <dl className="grid gap-4 sm:grid-cols-2">
        {datos.map((d) => (
          <div key={d.etiqueta}>
            <dt className={etiquetaClass}>
              {d.clave ? <Termino clave={d.clave}>{d.etiqueta}</Termino> : d.etiqueta}
            </dt>
            <dd className="text-sm text-slate-900 mt-1">{d.valor?.trim() ? d.valor : 'No registrado'}</dd>
          </div>
        ))}
      </dl>
    </Seccion>
  )
}

// ─── Alergias ──────────────────────────────────────────────────────────────

const COLOR_DE_SEVERIDAD = { SEVERA: 'red', MODERADA: 'amber', LEVE: 'gray' } as const

export const MisAlergias: React.FC<{ alergias: AlergiaDto[] }> = ({ alergias }) => (
  <Seccion id="seccion-alergias" titulo="Mis alergias" icono="shield">
    <TerminosDeLaSeccion claves={['alergia', 'reaccion']} />
    {alergias.length === 0 ? (
      <Vacio>No tienes alergias registradas.</Vacio>
    ) : (
      <ul className="divide-y divide-slate-100">
        {alergias.map((a) => (
          <li key={a.alergiaId} className="py-3 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{a.sustancia}</span>
              <Badge color={COLOR_DE_SEVERIDAD[a.severidad]}>Severidad {etiquetaDeSeveridad(a.severidad).toLowerCase()}</Badge>
            </div>
            <Explicacion clave={`severidad.${a.severidad}`} />
            <p className="text-sm text-slate-600">
              Reacción: {a.reaccion}
              {a.fechaDeteccion && <> · Detectada el {formatearFechaHora(a.fechaDeteccion)}</>}
            </p>
          </li>
        ))}
      </ul>
    )}
  </Seccion>
)

// ─── Próximas citas ────────────────────────────────────────────────────────

export const MisProximasCitas: React.FC<{ citas: CitaDto[] }> = ({ citas }) => (
  <Seccion id="seccion-citas" titulo="Mis próximas citas" icono="agenda">
    {citas.length === 0 ? (
      <Vacio>No tienes citas próximas.</Vacio>
    ) : (
      <>
        <Explicacion clave="cita.AGENDADA" />
        <ul className="divide-y divide-slate-100">
          {citas.map((c) => (
            <li key={c.citaId} className="py-3">
              <p className="text-sm font-semibold text-slate-900">{formatearFechaHora(c.fechaHora)}</p>
              <p className="text-sm text-slate-600">
                {[c.tipoCita, c.medico && `con ${c.medico}`, c.clinica].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      </>
    )}
  </Seccion>
)

// ─── Signos vitales ────────────────────────────────────────────────────────

export const MisSignosVitales: React.FC<{ toma: SignosVitalesDto | null }> = ({ toma }) => {
  if (!toma) {
    return (
      <Seccion id="seccion-signos" titulo="Mis últimos signos vitales" icono="vitals">
        <Explicacion clave="signosVitales" />
        <Vacio>Todavía no se te han tomado signos vitales.</Vacio>
      </Seccion>
    )
  }

  // Solo las medidas que se tomaron: un «—» en la saturación se leería como
  // un dato raro, cuando lo que pasó es que no se midió.
  const medidas: { clave?: string; etiqueta: string; valor: string | null }[] = [
    {
      clave: 'presionArterial',
      etiqueta: 'Presión arterial',
      valor:
        toma.presionSistolica !== null && toma.presionDiastolica !== null
          ? `${toma.presionSistolica}/${toma.presionDiastolica} mmHg`
          : null,
    },
    { clave: 'frecuenciaCardiaca', etiqueta: 'Frecuencia cardiaca', valor: conUnidad(toma.pulsoLpm, 'lpm') },
    { clave: 'frecuenciaRespiratoria', etiqueta: 'Frecuencia respiratoria', valor: conUnidad(toma.frecuenciaRespRpm, 'rpm') },
    { clave: 'temperatura', etiqueta: 'Temperatura', valor: conUnidad(toma.temperaturaC, '°C') },
    { clave: 'saturacion', etiqueta: 'Saturación de oxígeno', valor: conUnidad(toma.saturacionPct, '%') },
    { etiqueta: 'Peso', valor: conUnidad(toma.pesoKg, 'kg') },
    { etiqueta: 'Estatura', valor: conUnidad(toma.estaturaCm, 'cm') },
    {
      clave: 'imc',
      etiqueta: 'Índice de masa corporal (IMC)',
      valor: toma.imc === null ? null : `${toma.imc}${toma.clasificacionImc ? ` (${toma.clasificacionImc})` : ''}`,
    },
  ]

  return (
    <Seccion id="seccion-signos" titulo="Mis últimos signos vitales" icono="vitals">
      <p className="text-sm text-slate-600">Tomados el {formatearFechaHora(toma.tomadoEn)}.</p>
      <Explicacion clave="signosVitales" />
      <dl className="grid gap-4 sm:grid-cols-2">
        {medidas
          .filter((m) => m.valor !== null)
          .map((m) => (
            <div key={m.etiqueta}>
              <dt className={etiquetaClass}>
                {m.clave ? <Termino clave={m.clave}>{m.etiqueta}</Termino> : m.etiqueta}
              </dt>
              <dd className="text-sm font-semibold text-slate-900 mt-1">{m.valor}</dd>
            </div>
          ))}
      </dl>
      <p className="text-xs text-slate-500">
        Las explicaciones dicen qué mide cada dato; si tus valores están bien o no lo interpreta tu médico.
      </p>
    </Seccion>
  )
}

function conUnidad(valor: number | null, unidad: string): string | null {
  return valor === null ? null : `${valor} ${unidad}`
}

// ─── Consultas ─────────────────────────────────────────────────────────────

const COLOR_DE_CONSULTA = { FINALIZADA: 'green', PENDIENTE: 'yellow', ANULADA: 'red' } as const
const ETIQUETA_DE_CONSULTA = { FINALIZADA: 'Finalizada', PENDIENTE: 'Pendiente', ANULADA: 'Anulada' } as const

export const MisConsultas: React.FC<{ consultas: ConsultaDto[] }> = ({ consultas }) => (
  <Seccion id="seccion-consultas" titulo="Mis consultas" icono="consultas">
    {consultas.length === 0 ? (
      <Vacio>No tienes consultas registradas.</Vacio>
    ) : (
      <>
        <TerminosDeLaSeccion claves={['motivo', 'diagnostico', 'exploracionFisica', 'indicaciones']} />
        <ul className="space-y-3">
          {consultas.map((c) => (
            <li
              key={c.consultaId}
              aria-label={`Consulta del ${formatearFechaHora(c.fecha)}`}
              className={`rounded-xl border px-4 py-3 ${c.estado === 'ANULADA' ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{formatearFechaHora(c.fecha)}</p>
                <Badge color={COLOR_DE_CONSULTA[c.estado]}>{ETIQUETA_DE_CONSULTA[c.estado]}</Badge>
              </div>
              <p className="text-sm text-slate-600 mt-0.5">
                {c.medico.nombres} {c.medico.apellidos}
                {c.medico.especialidad && <> · {c.medico.especialidad}</>}
                {c.clinica && <> · {c.clinica.name}</>}
              </p>
              <Explicacion clave={`consulta.${c.estado}`} className="mt-1" />
              <dl className="mt-3 grid gap-2 text-sm">
                <Dato etiqueta="Motivo" valor={c.motivo} />
                <Dato etiqueta="Diagnóstico" valor={c.diagnostico ?? 'Pendiente'} />
                <Dato etiqueta="Exploración física" valor={c.exploracionFisica} />
                <Dato etiqueta="Indicaciones" valor={c.indicaciones} />
              </dl>
              {c.estado === 'ANULADA' && (
                <p role="note" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <span className="font-semibold">Consulta anulada</span>
                  {c.anuladaEn && <> el {formatearFechaHora(c.anuladaEn)}</>}. Motivo: {c.motivoAnulacion}
                </p>
              )}
            </li>
          ))}
        </ul>
      </>
    )}
  </Seccion>
)

/** Un dato de la consulta; el que no se anotó no se pinta. */
const Dato: React.FC<{ etiqueta: string; valor: string | null | undefined }> = ({ etiqueta, valor }) => {
  if (!valor?.trim()) return null
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{etiqueta}</dt>
      <dd className="text-slate-800 whitespace-pre-line">{valor}</dd>
    </div>
  )
}

// ─── Recetas ───────────────────────────────────────────────────────────────

export const MisRecetas: React.FC<{ recetas: PrescripcionDto[] }> = ({ recetas }) => (
  <Seccion id="seccion-recetas" titulo="Mis recetas" icono="prescripciones">
    {recetas.length === 0 ? (
      <Vacio>No tienes recetas registradas.</Vacio>
    ) : (
      <>
        <TerminosDeLaSeccion claves={['receta', 'dosis', 'viaAdministracion', 'frecuencia', 'duracion']} />
        <ul className="space-y-3">
          {recetas.map((r) => (
            <li
              key={r.prescripcionId}
              aria-label={`Receta ${r.prescripcionId}`}
              className={`rounded-xl border px-4 py-3 ${r.estado === 'ANULADA' ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Receta #{r.prescripcionId} · {formatearFechaHora(r.fecha)}
                </p>
                <Badge color={r.estado === 'ANULADA' ? 'red' : 'green'}>
                  {r.estado === 'ANULADA' ? 'Anulada' : 'Vigente'}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 mt-0.5">
                {r.medico.nombres} {r.medico.apellidos}
                {r.clinica && <> · {r.clinica.name}</>}
              </p>
              <Explicacion clave={`receta.${r.estado}`} className="mt-1" />
              <div className="mt-3">
                <TablaDeMedicamentos medicamentos={r.medicamentos} />
              </div>
              {r.estado === 'ANULADA' && (
                <p role="note" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <span className="font-semibold">Receta anulada</span>
                  {r.anuladaEn && <> el {formatearFechaHora(r.anuladaEn)}</>}: no la uses para comprar ni tomar el
                  medicamento. Motivo: {r.motivoAnulacion}
                </p>
              )}
            </li>
          ))}
        </ul>
      </>
    )}
  </Seccion>
)
