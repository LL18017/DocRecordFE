'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'
import { useAppContext } from '@/context/AppContext'
import {
  formatearFechaHora,
  nombreDeClinica,
  nombreDeMedico,
  nombreDePaciente,
  textoOpcional,
  type ConsultaDto,
} from '@/services/consultas'
import {
  listarPrescripcionesDeConsulta,
  nombreDeMedicoQueReceta,
  type PrescripcionDto,
} from '@/services/prescripciones'
import { AvisoDeAnulacion, BotonAnularReceta, BotonImprimirReceta } from './AccionesDeReceta'
import { TablaDeMedicamentos } from './TablaDeMedicamentos'

const COLOR_DE_ESTADO = { PENDIENTE: 'yellow', FINALIZADA: 'green' } as const

interface DetalleDeConsultaProps {
  consulta: ConsultaDto
  /**
   * Se llama cuando desde aquí se emite o se anula una receta, para que la
   * pantalla de abajo (el expediente) refresque sus propias listas de recetas.
   */
  onRecetasCambiaron?: () => void
}

/**
 * Una consulta con todos sus datos y las recetas emitidas en ella
 * (HU-20 c3), y desde aquí mismo se emite una receta nueva (HU-19 c5).
 *
 * «Emitir receta» abre el formulario de receta con ESTA consulta ya elegida:
 * no hay que volver a Prescripciones a buscar al paciente y la consulta. Lo
 * ofrece solo quien puede recetar (el médico); el servidor además exige que
 * sea el médico de la consulta.
 */
export const DetalleDeConsulta: React.FC<DetalleDeConsultaProps> = ({
  consulta,
  onRecetasCambiaron,
}) => {
  const { user } = useAppContext()
  const esMedico = user ? user.roles.includes('medico') : false
  // Anula el médico que firmó o un administrador; el servidor decide cuál de
  // los dos es, la pantalla solo evita ofrecerlo a quien nunca podría.
  const puedeAnular = user ? user.roles.some((r) => r === 'medico' || r === 'Administrador') : false
  // El diagnóstico no sale hacia enfermería (HU-20 c4): ahí llega null, y
  // decir «sin diagnóstico» sería afirmar algo falso.
  const puedeVerDiagnostico = user
    ? user.roles.some((r) => r === 'medico' || r === 'Administrador')
    : false

  const [recetas, setRecetas] = useState<PrescripcionDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [emitiendo, setEmitiendo] = useState(false)

  const cargarRecetas = useCallback(async () => {
    try {
      setRecetas(await listarPrescripcionesDeConsulta(consulta.consultaId))
      setError(null)
    } catch (err) {
      setRecetas([])
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las recetas.')
    } finally {
      setCargando(false)
    }
  }, [consulta.consultaId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver consultas/page.tsx
    void cargarRecetas()
  }, [cargarRecetas])

  const clinica = nombreDeClinica(consulta)

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Dato etiqueta="Paciente">
          {nombreDePaciente(consulta)} ({consulta.paciente.expediente})
        </Dato>
        <Dato etiqueta="Fecha y hora">{formatearFechaHora(consulta.fecha)}</Dato>
        <Dato etiqueta="Médico">
          {nombreDeMedico(consulta)}
          {consulta.medico.especialidad && (
            <span className="text-slate-400"> · {consulta.medico.especialidad}</span>
          )}
        </Dato>
        <Dato etiqueta="Clínica">
          {clinica ?? <span className="text-slate-400 italic">Sin sede registrada</span>}
        </Dato>
        <Dato etiqueta="Estado">
          <Badge color={COLOR_DE_ESTADO[consulta.estado] ?? 'gray'}>{consulta.estado}</Badge>
        </Dato>
      </dl>

      <dl className="space-y-3 text-sm">
        <Dato etiqueta="Motivo de consulta">{textoOpcional(consulta.motivo)}</Dato>
        <Dato etiqueta="Diagnóstico">
          {puedeVerDiagnostico ? (
            textoOpcional(consulta.diagnostico)
          ) : (
            <span className="text-slate-400 italic">Reservado al médico responsable</span>
          )}
        </Dato>
        <Dato etiqueta="Exploración física">{textoOpcional(consulta.exploracionFisica)}</Dato>
        <Dato etiqueta="Indicaciones">{textoOpcional(consulta.indicaciones)}</Dato>
      </dl>

      <section aria-label="Recetas de la consulta">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 font-outfit">Recetas emitidas</h3>
          {esMedico && (
            <button
              type="button"
              onClick={() => setEmitiendo(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer"
            >
              Emitir receta
            </button>
          )}
        </div>

        {cargando ? (
          <p className="text-sm text-slate-500">Cargando recetas…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : recetas.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            No se ha emitido ninguna receta en esta consulta.
          </p>
        ) : (
          <div className="space-y-3">
            {recetas.map((rx) => (
              <div
                key={rx.prescripcionId}
                className={`rounded-xl border p-4 ${
                  rx.estado === 'ANULADA' ? 'border-red-200 bg-red-50/30' : 'border-slate-100'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm font-outfit">
                      Receta #{rx.prescripcionId}{' '}
                      {rx.estado === 'ANULADA' && <Badge color="red">Anulada</Badge>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatearFechaHora(rx.fecha)} · {nombreDeMedicoQueReceta(rx)}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <BotonImprimirReceta prescripcionId={rx.prescripcionId} />
                    {puedeAnular && rx.estado === 'EMITIDA' && (
                      <BotonAnularReceta
                        prescripcionId={rx.prescripcionId}
                        onAnulada={() => {
                          void cargarRecetas()
                          onRecetasCambiaron?.()
                        }}
                      />
                    )}
                  </div>
                </div>
                <TablaDeMedicamentos medicamentos={rx.medicamentos} />
                <AvisoDeAnulacion receta={rx} />
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        isOpen={emitiendo}
        onClose={() => setEmitiendo(false)}
        title="Emitir receta"
        subtitle="Receta de esta consulta"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
        maxWidth="xl"
      >
        {/* La consulta va fija: la receta hereda de ella el paciente, el
            médico, la clínica y la fecha, y no se vuelve a elegir nada. */}
        <PrescriptionForm
          pacientes={[]}
          consulta={consulta}
          onCreada={() => {
            setEmitiendo(false)
            void cargarRecetas()
            onRecetasCambiaron?.()
          }}
          onCancel={() => setEmitiendo(false)}
        />
      </Modal>
    </div>
  )
}

const Dato: React.FC<{ etiqueta: string; children: React.ReactNode }> = ({ etiqueta, children }) => (
  <div>
    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
      {etiqueta}
    </dt>
    <dd className="text-slate-800 whitespace-pre-line">{children}</dd>
  </div>
)
