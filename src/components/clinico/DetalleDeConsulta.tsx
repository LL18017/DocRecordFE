'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'
import { useAppContext } from '@/context/AppContext'
import {
  anularConsulta,
  formatearFechaHora,
  nombreDeClinica,
  nombreDeMedico,
  nombreDePaciente,
  textoOpcional,
  type ConsultaDto,
} from '@/services/consultas'
import { listarSolicitudes, type SolicitudDeAnulacionDto } from '@/services/anulaciones'
import {
  listarPrescripcionesDeConsulta,
  nombreDeMedicoQueReceta,
  type PrescripcionDto,
} from '@/services/prescripciones'
import { AvisoDeAnulacion, BotonAnularReceta, BotonImprimirReceta } from './AccionesDeReceta'
import { AvisoDeAnulacionPendiente, DialogoDeAnulacion } from './DialogoDeAnulacion'
import { TablaDeMedicamentos } from './TablaDeMedicamentos'

const COLOR_DE_ESTADO = { PENDIENTE: 'yellow', FINALIZADA: 'green', ANULADA: 'red' } as const

interface DetalleDeConsultaProps {
  consulta: ConsultaDto
  /**
   * Se llama cuando desde aquí se emite o se anula una receta, para que la
   * pantalla de abajo (el expediente) refresque sus propias listas de recetas.
   */
  onRecetasCambiaron?: () => void
  /**
   * Se llama cuando desde aquí se anula la consulta (HU-21), con la consulta
   * ya ANULADA, para que la lista de donde se abrió la pinte marcada.
   */
  onConsultaCambio?: (consulta: ConsultaDto) => void
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
  consulta: consultaInicial,
  onRecetasCambiaron,
  onConsultaCambio,
}) => {
  // La consulta puede cambiar aquí mismo (anularla); se guarda la última
  // versión que devolvió el servidor en vez de esperar a que el padre la pase.
  const [consulta, setConsulta] = useState(consultaInicial)
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
  const [anulando, setAnulando] = useState(false)
  // Anulaciones pedidas y sin aprobar (de la consulta o de sus recetas). Solo
  // las pide quien puede anular: enfermería no anula y el servidor no le deja
  // listarlas.
  const [pendientes, setPendientes] = useState<SolicitudDeAnulacionDto[]>([])

  const cargarPendientes = useCallback(async () => {
    if (!puedeAnular) return
    try {
      setPendientes(
        await listarSolicitudes({ consultaId: consulta.consultaId, estado: 'PENDIENTE' }),
      )
    } catch {
      // Sin la lista la pantalla sigue sirviendo: si alguien intenta anular
      // algo que ya tiene una solicitud en curso, el servidor responde 409 con
      // el motivo. No vale la pena tapar la consulta con un error por esto.
      setPendientes([])
    }
  }, [consulta.consultaId, puedeAnular])

  const anulada = consulta.estado === 'ANULADA'
  const pendienteDeLaConsulta = pendientes.find((p) => p.tipo === 'CONSULTA')
  const pendienteDeReceta = (prescripcionId: number) =>
    pendientes.find((p) => p.tipo === 'RECETA' && p.prescripcionId === prescripcionId)

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver consultas/page.tsx
    void cargarPendientes()
  }, [cargarPendientes])

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

      {anulada && (
        <p
          role="note"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          <span className="font-semibold">Consulta anulada</span>
          {consulta.anuladaEn && <> el {formatearFechaHora(consulta.anuladaEn)}</>}
          {consulta.anuladaPor && <> por {consulta.anuladaPor}</>}. Motivo: {consulta.motivoAnulacion}.
          Sigue en el expediente, pero ya no se edita ni recibe recetas.
        </p>
      )}
      {!anulada && pendienteDeLaConsulta && (
        <AvisoDeAnulacionPendiente solicitud={pendienteDeLaConsulta} />
      )}
      {puedeAnular && !anulada && !pendienteDeLaConsulta && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAnulando(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
          >
            Anular consulta
          </button>
        </div>
      )}

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
          {esMedico && !anulada && (
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
                    {puedeAnular && rx.estado === 'EMITIDA' && !pendienteDeReceta(rx.prescripcionId) && (
                      <BotonAnularReceta
                        prescripcionId={rx.prescripcionId}
                        onAnulada={() => {
                          void cargarRecetas()
                          onRecetasCambiaron?.()
                        }}
                        onSolicitada={() => void cargarPendientes()}
                      />
                    )}
                  </div>
                </div>
                <TablaDeMedicamentos medicamentos={rx.medicamentos} />
                <AvisoDeAnulacion receta={rx} />
                <AvisoDePendienteDeReceta solicitud={rx.estado === 'EMITIDA' ? pendienteDeReceta(rx.prescripcionId) : undefined} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* HU-21: anular la consulta anula también sus recetas vigentes. */}
      <DialogoDeAnulacion<ConsultaDto>
        abierto={anulando}
        onCerrar={() => setAnulando(false)}
        idCampo={`motivo-anulacion-consulta-${consulta.consultaId}`}
        titulo={`Anular la consulta #${consulta.consultaId}`}
        subtitulo="La consulta no se borra: queda marcada como anulada"
        ayuda="Úsela para una consulta registrada por error (otro paciente, datos equivocados). Sus recetas vigentes quedan anuladas con ella. Quedan guardados el motivo, quién la anuló y cuándo."
        textoDelBoton="Anular consulta"
        anular={(motivo) => anularConsulta(consulta.consultaId, motivo)}
        onAnulado={(actualizada) => {
          setConsulta(actualizada)
          onConsultaCambio?.(actualizada)
          void cargarRecetas()
          onRecetasCambiaron?.()
        }}
        onSolicitada={() => void cargarPendientes()}
      />

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

const AvisoDePendienteDeReceta: React.FC<{ solicitud?: SolicitudDeAnulacionDto }> = ({ solicitud }) =>
  solicitud ? <AvisoDeAnulacionPendiente solicitud={solicitud} /> : null

const Dato: React.FC<{ etiqueta: string; children: React.ReactNode }> = ({ etiqueta, children }) => (
  <div>
    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
      {etiqueta}
    </dt>
    <dd className="text-slate-800 whitespace-pre-line">{children}</dd>
  </div>
)
