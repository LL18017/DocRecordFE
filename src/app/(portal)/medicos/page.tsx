'use client'

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { formatoDeJuntaValido } from '@/lib/registroJunta'
import { listarTodasLasClinicas, type ClinicaDto } from '@/services/clinicas'
import { listarEspecialidades, type EspecialidadDto } from '@/services/personas'
import {
  actualizarMedico,
  cambiarEstadoMedico,
  crearMedico,
  darAcceso,
  estadoDeAcceso,
  listarMedicos,
  nombreDeMedicoEnFicha,
  type MedicoDto,
} from '@/services/medicos'

const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40'
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'
const botonPrincipal =
  'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
const botonSecundario =
  'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer'

/**
 * Médicos (HU-02). Solo la ve el Administrador (ver `RUTAS_DEL_PORTAL`).
 *
 * El médico se registra aquí como FICHA —quién es como profesional:
 * especialidad y número de junta— y el acceso al sistema se le da aparte,
 * desde la misma fila: se crea su cuenta con el rol Médico y le llega una
 * invitación para elegir su contraseña. Es el mismo modelo que el paciente,
 * cuya cuenta se activa sobre un expediente que ya existe. Usuarios y Roles
 * queda para cuentas y permisos.
 */
export default function MedicosPage() {
  const [lista, setLista] = useState<MedicoDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [editando, setEditando] = useState<MedicoDto | 'nuevo' | null>(null)
  const [dandoAcceso, setDandoAcceso] = useState<MedicoDto | null>(null)
  const [cambiando, setCambiando] = useState<number | null>(null)
  const [especialidades, setEspecialidades] = useState<EspecialidadDto[] | null>(null)
  const [sedes, setSedes] = useState<ClinicaDto[] | null>(null)
  const uid = useId()

  const cargar = useCallback(async () => {
    try {
      setLista(await listarMedicos())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los médicos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver medicamentos/page.tsx
    void cargar()
  }, [cargar])

  useEffect(() => {
    let vigente = true
    listarEspecialidades()
      .then((l) => vigente && setEspecialidades(l.filter((e) => e.activa)))
      .catch(() => vigente && setEspecialidades([]))
    listarTodasLasClinicas()
      .then((l) => vigente && setSedes(l))
      .catch(() => vigente && setSedes([]))
    return () => {
      vigente = false
    }
  }, [])

  const bajas = lista.filter((m) => !m.activo).length
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return lista.filter(
      (m) =>
        (verBajas || m.activo) &&
        (!q ||
          nombreDeMedicoEnFicha(m).toLowerCase().includes(q) ||
          m.registroJunta.toLowerCase().includes(q) ||
          m.especialidad.toLowerCase().includes(q)),
    )
  }, [lista, verBajas, busqueda])

  /** Reemplaza la fila por la que devolvió el servidor, o la agrega si es nueva. */
  const reflejar = (guardado: MedicoDto) =>
    setLista((prev) =>
      prev.some((m) => m.personaId === guardado.personaId)
        ? prev.map((m) => (m.personaId === guardado.personaId ? guardado : m))
        : [...prev, guardado],
    )

  const cambiarEstado = async (medico: MedicoDto, activo: boolean) => {
    setCambiando(medico.personaId)
    setError(null)
    setAviso(null)
    try {
      reflejar(await cambiarEstadoMedico(medico.personaId, activo))
      setAviso(
        activo
          ? `${nombreDeMedicoEnFicha(medico)} quedó reactivado. Para que vuelva a atender, dele acceso.`
          : `${nombreDeMedicoEnFicha(medico)} quedó dado de baja: ya no atiende. Sus consultas siguen firmadas por él.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado de la ficha.')
    } finally {
      setCambiando(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Médicos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            La ficha de cada médico y su acceso al sistema.
          </p>
        </div>
        <button
          onClick={() => setEditando('nuevo')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Registrar médico
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {aviso && (
        <div role="status" className="mb-4 rounded-xl border-2 border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {aviso}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <label htmlFor={`${uid}-buscar`} className="sr-only">
            Buscar médicos
          </label>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" size={16} />
          </span>
          <input
            id={`${uid}-buscar`}
            type="search"
            placeholder="Buscar por nombre, especialidad o número de junta"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verBajas}
            onChange={(e) => setVerBajas(e.target.checked)}
            className="w-4 h-4 accent-doc-blue"
          />
          Mostrar dados de baja ({bajas})
        </label>
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          Cargando médicos…
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
          {lista.length === 0
            ? 'Todavía no hay médicos registrados. Registre el primero y después dele acceso.'
            : 'Ningún médico coincide con la búsqueda.'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th scope="col" className="px-4 py-3 font-semibold">Médico</th>
                <th scope="col" className="px-4 py-3 font-semibold">Especialidad</th>
                <th scope="col" className="px-4 py-3 font-semibold">Junta</th>
                <th scope="col" className="px-4 py-3 font-semibold">Acceso</th>
                <th scope="col" className="px-4 py-3 font-semibold">Ficha</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m) => {
                const acceso = estadoDeAcceso(m)
                const nombre = nombreDeMedicoEnFicha(m)
                return (
                  <tr
                    key={m.personaId}
                    className={`border-b border-slate-50 last:border-0 ${m.activo ? '' : 'bg-slate-50/70 text-slate-400'}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{nombre}</p>
                      {m.cuenta && <p className="text-xs text-slate-400">{m.cuenta.email}</p>}
                    </td>
                    <td className="px-4 py-3">{m.especialidad}</td>
                    <td className="px-4 py-3 font-mono text-xs">{m.registroJunta}</td>
                    <td className="px-4 py-3">
                      <Badge color={acceso.color}>{acceso.texto}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {m.activo ? <Badge color="green">Vigente</Badge> : <Badge color="gray">De baja</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditando(m)}
                          aria-label={`Editar la ficha de ${nombre}`}
                          className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        {m.activo && (
                          <button
                            onClick={() => setDandoAcceso(m)}
                            aria-label={`${textoDeAcceso(m)}: ${nombre}`}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 text-doc-blue hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            {textoDeAcceso(m)}
                          </button>
                        )}
                        <button
                          onClick={() => void cambiarEstado(m, !m.activo)}
                          disabled={cambiando === m.personaId}
                          aria-label={`${m.activo ? 'Dar de baja' : 'Reactivar'} a ${nombre}`}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                            m.activo
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {m.activo ? 'Dar de baja' : 'Reactivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nuevo' ? 'Registrar médico' : 'Editar ficha de médico'}
        subtitle="Datos personales y profesionales. El acceso al sistema se da aparte."
        icon="usuarios"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
        maxWidth="md"
      >
        {editando !== null && (
          <FormularioDeFicha
            medico={editando === 'nuevo' ? null : editando}
            especialidades={especialidades}
            onGuardado={(guardado) => {
              reflejar(guardado)
              setEditando(null)
              setAviso(
                editando === 'nuevo'
                  ? `Ficha de ${nombreDeMedicoEnFicha(guardado)} registrada. Dele acceso para que pueda entrar.`
                  : 'Ficha actualizada.',
              )
            }}
            onCancelar={() => setEditando(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={dandoAcceso !== null}
        onClose={() => setDandoAcceso(null)}
        title={dandoAcceso ? textoDeAcceso(dandoAcceso) : ''}
        subtitle={dandoAcceso ? nombreDeMedicoEnFicha(dandoAcceso) : ''}
        icon="shield"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
        maxWidth="md"
      >
        {dandoAcceso && (
          <FormularioDeAcceso
            medico={dandoAcceso}
            sedes={sedes}
            onListo={(resultado, mensaje) => {
              reflejar(resultado)
              setDandoAcceso(null)
              setAviso(mensaje)
            }}
            onCancelar={() => setDandoAcceso(null)}
          />
        )}
      </Modal>
    </div>
  )
}

/** El texto del botón de acceso según cómo esté la cuenta. */
function textoDeAcceso(medico: MedicoDto): string {
  if (!medico.cuenta) return 'Dar acceso'
  if (medico.cuenta.estado === 'SIN_ACTIVAR') return 'Reenviar invitación'
  if (!medico.cuenta.conRolMedico) return 'Devolver acceso'
  return 'Agregar sede'
}

const FormularioDeFicha: React.FC<{
  medico: MedicoDto | null
  especialidades: EspecialidadDto[] | null
  onGuardado: (medico: MedicoDto) => void
  onCancelar: () => void
}> = ({ medico, especialidades, onGuardado, onCancelar }) => {
  const uid = useId()
  const [nombres, setNombres] = useState(medico?.nombres ?? '')
  const [apellidos, setApellidos] = useState(medico?.apellidos ?? '')
  const [telefono, setTelefono] = useState(medico?.telefono ?? '')
  const [especialidadId, setEspecialidadId] = useState<number | ''>(medico?.especialidadId ?? '')
  const [junta, setJunta] = useState(medico?.registroJunta ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const juntaInvalida = junta.trim() !== '' && !formatoDeJuntaValido(junta)
  const incompleto = !nombres.trim() || !apellidos.trim() || especialidadId === '' || !formatoDeJuntaValido(junta)

  const guardar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (incompleto) return
    setGuardando(true)
    setError(null)
    const payload = { nombres, apellidos, telefono, especialidadId, registroJunta: junta }
    try {
      onGuardado(medico ? await actualizarMedico(medico.personaId, payload) : await crearMedico(payload))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la ficha.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${uid}-nombres`} className={labelClass}>
            Nombres *
          </label>
          <input id={`${uid}-nombres`} value={nombres} onChange={(e) => setNombres(e.target.value)} maxLength={80} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${uid}-apellidos`} className={labelClass}>
            Apellidos *
          </label>
          <input id={`${uid}-apellidos`} value={apellidos} onChange={(e) => setApellidos(e.target.value)} maxLength={80} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-especialidad`} className={labelClass}>
          Especialidad *
        </label>
        <select
          id={`${uid}-especialidad`}
          value={especialidadId}
          onChange={(e) => setEspecialidadId(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={especialidades === null}
          className={inputClass}
        >
          <option value="">{especialidades === null ? 'Cargando especialidades…' : 'Seleccione…'}</option>
          {(especialidades ?? []).map((e) => (
            <option key={e.especialidadId} value={e.especialidadId}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-junta`} className={labelClass}>
          Número de junta de vigilancia *
        </label>
        <input
          id={`${uid}-junta`}
          value={junta}
          onChange={(e) => setJunta(e.target.value)}
          maxLength={20}
          placeholder="JVPM-12345"
          aria-invalid={juntaInvalida}
          className={inputClass}
        />
        {juntaInvalida && (
          <p className="text-xs text-red-600 mt-1">Use de 3 a 20 letras, números o guiones, con al menos un número.</p>
        )}
      </div>
      <div>
        <label htmlFor={`${uid}-telefono`} className={labelClass}>
          Teléfono
        </label>
        <input
          id={`${uid}-telefono`}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          maxLength={9}
          placeholder="7777-0000"
          className={inputClass}
        />
      </div>
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancelar} className={botonSecundario}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando || incompleto} className={botonPrincipal}>
          {guardando ? 'Guardando…' : medico ? 'Guardar cambios' : 'Registrar médico'}
        </button>
      </div>
    </form>
  )
}

const FormularioDeAcceso: React.FC<{
  medico: MedicoDto
  sedes: ClinicaDto[] | null
  onListo: (medico: MedicoDto, mensaje: string) => void
  onCancelar: () => void
}> = ({ medico, sedes, onListo, onCancelar }) => {
  const uid = useId()
  const [email, setEmail] = useState('')
  const [sedeId, setSedeId] = useState<number | ''>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sinCuenta = medico.cuenta === null
  // Sin ninguna sede el médico entra y se queda en la selección de clínica.
  const necesitaSede = sinCuenta || (medico.cuenta?.sedes.length ?? 0) === 0
  const faltaDato = (sinCuenta && !email.trim()) || (necesitaSede && sedeId === '')

  const enviar = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (faltaDato) return
    setEnviando(true)
    setError(null)
    try {
      const r = await darAcceso(medico.personaId, {
        email: sinCuenta ? email : undefined,
        clinicaId: sedeId === '' ? undefined : sedeId,
      })
      const correo = r.medico.cuenta?.email ?? email
      onListo(
        r.medico,
        r.invitacionEnviada
          ? r.correoEnviado
            ? `Se envió la invitación a ${correo}. El médico elige su contraseña desde el enlace del correo.`
            : `La cuenta quedó lista, pero el correo a ${correo} no salió. Vuelva a enviar la invitación más tarde.`
          : `${nombreDeMedicoEnFicha(r.medico)} ya tiene acceso como médico.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar el acceso.')
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
            placeholder="nombre.apellido@clinica.sv"
            className={inputClass}
          />
          <p className="text-xs text-slate-400 mt-1">
            Le llegará una invitación para elegir su contraseña. Hasta que la use, la cuenta no se puede usar.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Cuenta: <strong>{medico.cuenta?.email}</strong>
          {medico.cuenta?.estado === 'SIN_ACTIVAR' &&
            '. Todavía no la activa: se le enviará una invitación nueva y la anterior dejará de servir.'}
        </p>
      )}
      <div>
        <label htmlFor={`${uid}-sede`} className={labelClass}>
          Sede donde va a trabajar{necesitaSede ? ' *' : ' (opcional)'}
        </label>
        <select
          id={`${uid}-sede`}
          value={sedeId}
          onChange={(e) => setSedeId(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={sedes === null}
          className={inputClass}
        >
          <option value="">{sedes === null ? 'Cargando sedes…' : 'Seleccione…'}</option>
          {(sedes ?? []).map((s) => (
            <option key={s.clinicaId} value={s.clinicaId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancelar} className={botonSecundario}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando || faltaDato} className={botonPrincipal}>
          {enviando ? 'Enviando…' : textoDeAcceso(medico)}
        </button>
      </div>
    </form>
  )
}
