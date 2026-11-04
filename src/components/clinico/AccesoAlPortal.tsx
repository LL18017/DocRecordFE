'use client'

// ─── Acceso del paciente a su portal (HU-34) ───────────────────────────────
//
// Va en el expediente del paciente, del lado del PERSONAL: muestra si el
// paciente ya puede entrar a su portal y, si no, se lo da. Es el mismo modelo
// que el acceso de un médico (HU-02, pantalla Médicos): la cuenta nace sin
// activar y al paciente le llega una invitación para elegir su contraseña en
// /activar. Nadie le inventa ni le dicta una contraseña.
//
// Es un componente independiente —carga su propio estado con
// `GET /pacientes/{id}/acceso-portal`— para que la página del expediente solo
// tenga que montarlo con el id:
//
//   <AccesoAlPortal pacienteId={paciente.personaId} nombrePaciente="Ana Pérez" />
//
// Lo pueden usar médico, enfermera y administrador, los mismos que registran
// pacientes: abrirle la cuenta del portal es parte de recibirlo en la
// clínica. El backend no permite una escalada por aquí: el rol es siempre
// Paciente y la cuenta queda colgada de la persona de ESE expediente.

import React, { useCallback, useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import {
  darAccesoAlPortal,
  estadoDelAccesoAlPortal,
  obtenerAccesoAlPortal,
  type AccesoAlPortalDto,
} from '@/services/portal'

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'
const botonPrincipal =
  'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
const botonSecundario =
  'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer'

export interface AccesoAlPortalProps {
  /** persona_id del paciente del expediente. */
  pacienteId: number
  /** Para los mensajes y el título del diálogo; si falta se dice «el paciente». */
  nombrePaciente?: string
  /** Se llama cada vez que el acceso cambia (p. ej. para refrescar algo de la página). */
  onCambio?: (acceso: AccesoAlPortalDto) => void
}

export const AccesoAlPortal: React.FC<AccesoAlPortalProps> = ({ pacienteId, nombrePaciente, onCambio }) => {
  const [acceso, setAcceso] = useState<AccesoAlPortalDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setAcceso(await obtenerAccesoAlPortal(pacienteId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el acceso al portal.')
    }
  }, [pacienteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver medicamentos/page.tsx
    void cargar()
  }, [cargar])

  const quien = nombrePaciente?.trim() || 'el paciente'
  const textoDelBoton = acceso ? textoDeAccion(acceso) : null

  return (
    <section
      aria-label="Acceso al portal del paciente"
      className="rounded-2xl border-2 border-slate-200 bg-white px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-doc-navy flex items-center justify-center flex-shrink-0">
            <Icon name="shield" size={18} color="white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 font-outfit">Portal del paciente</p>
            {acceso ? (
              <p className="text-xs text-slate-500 truncate">{descripcion(acceso)}</p>
            ) : (
              !error && (
                <p role="status" className="text-xs text-slate-500">
                  Consultando el acceso…
                </p>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {acceso && (
            <Badge color={estadoDelAccesoAlPortal(acceso).color}>{estadoDelAccesoAlPortal(acceso).texto}</Badge>
          )}
          {textoDelBoton && (
            <button
              type="button"
              onClick={() => {
                setAviso(null)
                setAbierto(true)
              }}
              className="h-8 px-3 rounded-lg bg-doc-blue text-white text-xs font-semibold hover:opacity-90 transition-colors cursor-pointer"
            >
              {textoDelBoton}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      )}
      {aviso && (
        <p
          role="status"
          className="mt-3 rounded-xl border-2 border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          {aviso}
        </p>
      )}

      <Modal
        isOpen={abierto && acceso !== null}
        onClose={() => setAbierto(false)}
        title={textoDelBoton ?? 'Acceso al portal'}
        subtitle={nombrePaciente}
        icon="shield"
        maxWidth="md"
      >
        {acceso && (
          <FormularioDeAcceso
            acceso={acceso}
            quien={quien}
            textoDelBoton={textoDelBoton ?? 'Dar acceso al portal'}
            onListo={(nuevo, mensaje) => {
              setAcceso(nuevo)
              setAbierto(false)
              setAviso(mensaje)
              onCambio?.(nuevo)
            }}
            onCancelar={() => setAbierto(false)}
          />
        )}
      </Modal>
    </section>
  )
}

/**
 * Qué se le ofrece al personal según cómo esté la cuenta, o `null` si no hay
 * nada que hacer desde aquí.
 *
 * Con la cuenta DESACTIVADA no se ofrece nada: reactivarla es decisión del
 * administrador en Usuarios y Roles, y mandarle una invitación a una cuenta
 * que de todos modos no puede entrar solo confundiría al paciente.
 */
function textoDeAccion(acceso: AccesoAlPortalDto): string | null {
  const cuenta = acceso.cuenta
  if (!cuenta) return 'Dar acceso al portal'
  if (cuenta.estado === 'DESACTIVADA') return null
  if (cuenta.estado === 'SIN_ACTIVAR') return 'Reenviar invitación'
  if (!cuenta.conRolPaciente) return 'Dar acceso al portal'
  return null
}

function descripcion(acceso: AccesoAlPortalDto): string {
  const cuenta = acceso.cuenta
  if (!cuenta) return 'Todavía no tiene cuenta para ver su expediente en línea.'
  if (cuenta.estado === 'DESACTIVADA') {
    return `La cuenta ${cuenta.email} está desactivada; un administrador puede reactivarla en Usuarios y Roles.`
  }
  if (cuenta.estado === 'SIN_ACTIVAR') return `Invitación enviada a ${cuenta.email}; todavía no la activa.`
  if (!cuenta.conRolPaciente) return `Tiene la cuenta ${cuenta.email}, pero sin acceso a su portal.`
  return `Entra con ${cuenta.email}.`
}

const FormularioDeAcceso: React.FC<{
  acceso: AccesoAlPortalDto
  quien: string
  textoDelBoton: string
  onListo: (acceso: AccesoAlPortalDto, mensaje: string) => void
  onCancelar: () => void
}> = ({ acceso, quien, textoDelBoton, onListo, onCancelar }) => {
  const uid = useId()
  const sinCuenta = acceso.cuenta === null
  // Se propone el correo de contacto de la ficha: casi siempre es el mismo, y
  // el backend lo usa igual si no se manda ninguno.
  const [email, setEmail] = useState(acceso.correoDeContacto ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const faltaCorreo = sinCuenta && !email.trim()

  const enviar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (faltaCorreo) return
    setEnviando(true)
    setError(null)
    try {
      const r = await darAccesoAlPortal(acceso.pacienteId, sinCuenta ? email : undefined)
      const correo = r.cuenta?.email ?? email.trim()
      onListo(
        r,
        r.invitacionEnviada
          ? r.correoEnviado
            ? `Se envió la invitación a ${correo}. Con el enlace del correo, ${quien} elige su contraseña y entra a su portal.`
            : `La cuenta quedó lista, pero el correo a ${correo} no salió. Vuelva a enviar la invitación más tarde.`
          : `Listo: ${quien} ya puede ver su expediente en el portal con ${correo}. Si tenía la sesión abierta, debe volver a iniciarla.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar el acceso al portal.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm text-slate-600">
        En el portal, {quien} ve su expediente en solo lectura —alergias, consultas, recetas y próximas citas— y lo
        puede descargar en PDF. No puede modificar nada.
      </p>
      {sinCuenta ? (
        <div>
          <label htmlFor={`${uid}-email`} className={labelClass}>
            Correo para iniciar sesión *
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={100}
            placeholder="nombre.apellido@correo.sv"
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">
            Le llegará una invitación para elegir su contraseña. Hasta que la use, la cuenta no se puede usar.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Cuenta: <strong>{acceso.cuenta?.email}</strong>
          {acceso.cuenta?.estado === 'SIN_ACTIVAR'
            ? '. Todavía no la activa: se le enviará una invitación nueva y la anterior dejará de servir.'
            : '. Ya la usa para entrar; se le agregará el acceso a su portal.'}
        </p>
      )}
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancelar} className={botonSecundario}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando || faltaCorreo} className={botonPrincipal}>
          {enviando ? 'Enviando…' : textoDelBoton}
        </button>
      </div>
    </form>
  )
}
