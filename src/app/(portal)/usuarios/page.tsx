'use client'

import React, { useCallback, useEffect, useId, useState } from 'react'
import { Role } from '@/types'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import { useUsuarioAutenticado } from '@/context/AppContext'
import { etiquetaDeRoles } from '@/lib/roles'
import {
  asignarContrasena,
  asignarRol,
  crearUsuario,
  listarRoles,
  listarUsuarios,
  type AltaUsuarioDto,
  type RolDto,
  type UsuarioDto,
} from '@/services/usuarios'

// Esta pantalla ya no es de solo lectura: sabe listar, dar de alta personal,
// asignar un rol inicial y asignar/reestablecer contraseña. Lo que SIGUE sin
// tener es editar y eliminar, y eso no es una omisión, es que `/user` no
// expone ningún endpoint para ninguna de las dos —«Editar» y «Eliminar»
// llegaron a existir en la maqueta, pero no llamaban a nada real: el primero
// no tenía a dónde escribir, y el segundo borraba la fila de la pantalla
// dejando la cuenta viva en la base—.
//
// La columna «Estado» sigue sin existir por el mismo motivo de siempre:
// `UserResponseDto` no trae `enabled`, así que la pantalla no puede prometer
// una columna que el backend no respalda.

/**
 * Único rol al que el backend le deja usar esta pantalla. `/user` entero es
 * `hasRole('ADMIN')`, y `services/auth.ts` traduce ese ADMIN al rol
 * 'Administrador' del tipo `Role`, que es el nombre que viaja en la sesión.
 */
const ROL_CON_ACCESO: Role = 'Administrador'

/** Nombres de la tabla `role` del backend, en el idioma de la interfaz. */
const ETIQUETAS_DE_ROL: Record<string, string> = {
  ADMIN: 'Administrador',
  MEDICO: 'Médico',
  ENFERMERA: 'Enfermera',
  PACIENTE: 'Paciente',
}

/**
 * Lo que se muestra cuando la fila de `role` no tiene nombre.
 *
 * `role.name` admite NULL en la base, así que el rol puede llegar sin nombre.
 * No se pinta el guion de los datos opcionales: aquí no falta un dato de
 * relleno, hay un rol ASIGNADO que nadie puede leer, y quien administra
 * permisos tiene que notarlo para ir a arreglarlo.
 */
const ROL_SIN_NOMBRE = 'Rol sin nombre'

/**
 * `GET /user/all` devuelve los roles sin prefijo ('MEDICO') mientras que el
 * login los manda con él ('ROLE_MEDICO'). Se normaliza igual que en
 * `mapearRoles`: primero a mayúsculas y después quitar el prefijo, para no
 * depender del case. Un rol que no esté en la tabla se muestra tal cual en vez
 * de desaparecer.
 *
 * `nombre` es anulable porque la columna lo es (ver `RolDto`): sin esta
 * guarda, `nombre.toUpperCase()` tumba la pantalla entera de Usuarios y Roles
 * por una sola fila mal cargada del catálogo.
 */
function etiquetaDeRol(nombre: string | null): string {
  if (!nombre) return ROL_SIN_NOMBRE
  const clave = nombre.toUpperCase().replace(/^ROLE_/, '')
  return ETIQUETAS_DE_ROL[clave] ?? nombre
}

function colorDeRol(nombre: string | null): string {
  if (!nombre) return 'gray'
  const clave = nombre.toUpperCase().replace(/^ROLE_/, '')
  if (clave === 'ADMIN') return 'purple'
  if (clave === 'ENFERMERA') return 'green'
  return 'blue'
}

/**
 * Igual que la normalización de arriba, pero como valor para comparar en vez
 * de texto para pintar. La necesita el código nuevo de esta pantalla: el
 * selector de roles asignables (para descartar los que la cuenta ya tiene) y
 * la comprobación admin-contra-admin (para saber si la fila es ADMIN).
 */
function normalizarNombreDeRol(nombre: string | null): string | null {
  return nombre ? nombre.toUpperCase().replace(/^ROLE_/, '') : null
}

/**
 * Los roles que esta pantalla deja asignar, aunque `GET /roles/all` traiga
 * los cuatro del catálogo.
 *
 * PACIENTE queda fuera, pero NO porque una cuenta de personal no pueda serlo
 * también —el modelo de `persona` con especializaciones de clave compartida
 * existe justo para eso: una enfermera puede a la vez ser paciente—. Se
 * excluye porque hoy asignarlo no concede NADA: no existe ningún portal del
 * paciente bajo `src/app/(portal)/` (DRS-101), así que el rol quedaría
 * decorativo, exactamente lo que se ha ido quitando de esta pantalla todo el
 * día. Cuando exista ese portal, este es el sitio donde volver a asignarlo
 * —incluido el caso de una cuenta que ya tiene otro rol de personal—.
 */
const NOMBRES_DE_ROL_ASIGNABLES: readonly string[] = ['ADMIN', 'MEDICO', 'ENFERMERA']

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter((palabra) => palabra.length > 0)
    .map((palabra) => palabra[0])
    .slice(0, 2)
    .join('')
}

/** Cabecera de la pantalla, igual con acceso y sin él. */
function Encabezado() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-800 font-outfit">Usuarios y Roles</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Administración del personal médico, enfermería y permisos
      </p>
    </div>
  )
}

/**
 * Lo que ve quien no puede usar la pantalla.
 *
 * Existe porque el menú no es una protección: cualquiera puede escribir
 * /usuarios en la barra de direcciones, y antes eso llevaba a una tabla que
 * pedía el listado y recibía 403. Un rol sin permiso merece leer que no tiene
 * acceso, no un error del servidor ni una tabla vacía que insinúa que no hay
 * personal registrado.
 *
 * No ofrece «Reintentar» a propósito: la falta de permiso no se arregla
 * repitiendo la petición, y un botón que siempre falla es una promesa falsa.
 */
function SinAcceso({ detalle }: { detalle: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
        <Icon name="shield" size={22} />
      </div>
      <h2 className="text-lg font-bold text-slate-800 font-outfit">
        No tiene acceso a esta sección
      </h2>
      <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">{detalle}</p>
    </div>
  )
}

export default function UsuariosPage() {
  const usuario = useUsuarioAutenticado()
  // Basta con que Administrador esté ENTRE sus roles, no que sea el único: una
  // cuenta ADMIN+MEDICO conserva el acceso a esta pantalla.
  const tieneAcceso = usuario.roles.includes(ROL_CON_ACCESO)

  // La lista sale de GET /user/all. Antes se sembraba con `users` de
  // `@/data/mockData` y la búsqueda recorría personal inventado, así que un
  // usuario real de la base nunca aparecía por más que se le buscara.
  const [usuarios, setUsuarios] = useState<UsuarioDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Un 403 no es un error que se pueda reintentar, así que no comparte estado
  // con el resto: se muestra como falta de permiso, no como fallo del sistema.
  const [sinPermiso, setSinPermiso] = useState(false)

  // Los tres modales de esta pantalla, cada uno con su propio "quién": `null`
  // es "cerrado", y el usuario guardado es a quién se le está dando de alta,
  // asignando rol o asignando contraseña.
  const [mostrarNuevoUsuario, setMostrarNuevoUsuario] = useState(false)
  const [usuarioParaRol, setUsuarioParaRol] = useState<UsuarioDto | null>(null)
  const [usuarioParaContrasena, setUsuarioParaContrasena] = useState<UsuarioDto | null>(null)

  // Ningún setState antes del primer await (regla react-hooks/set-state-in-effect);
  // `cargando` ya arranca en true, así que la carga inicial no se anuncia.
  const cargarUsuarios = useCallback(async () => {
    try {
      const lista = await listarUsuarios()
      setUsuarios(lista)
      setError(null)
      setSinPermiso(false)
    } catch (err) {
      // El rol de la sesión se comprobó antes de pedir, pero puede haber
      // dejado de ser cierto: el token vive más que un cambio de roles en la
      // base. Si el backend dice 403, manda el backend.
      if (err instanceof ApiError && err.status === 403) {
        setSinPermiso(true)
        setError(null)
      } else {
        setError(
          err instanceof ApiError ? err.message : 'No se pudo cargar la lista de usuarios.',
        )
      }
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // Sin el rol adecuado no se pide nada: la petición sería un 403 seguro y
    // le dejaría al backend un intento de acceso por cada visita.
    if (!tieneAcceso) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver pacientes/page.tsx
    void cargarUsuarios()
  }, [cargarUsuarios, tieneAcceso])

  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargarUsuarios()
  }

  /** Reemplaza en la lista la cuenta que acaba de volver actualizada del API. */
  const actualizarEnLista = (actualizado: UsuarioDto) => {
    setUsuarios((prev) => prev.map((u) => (u.userId === actualizado.userId ? actualizado : u)))
  }

  /** Inserta la cuenta recién creada. `POST /user` no la devuelve en el listado paginado hasta el próximo `GET /user/all`. */
  const agregarALista = (nuevo: AltaUsuarioDto) => {
    setUsuarios((prev) => [nuevo, ...prev])
  }

  const columns: Column<UsuarioDto>[] = [
    {
      header: 'Usuario',
      cell: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-2xs bg-doc-blue">
            {iniciales(u.userName)}
          </div>
          <span className="font-medium text-slate-800 text-sm font-outfit">{u.userName}</span>
        </div>
      ),
    },
    {
      header: 'Correo',
      accessorKey: 'email',
      className: 'font-mono text-xs text-slate-600',
    },
    {
      header: 'Roles',
      // Una cuenta puede tener varios roles a la vez (en la base hay usuarios
      // ADMIN y MEDICO), y `POST /user` las crea sin ninguno; por eso se
      // pintan todos y se contempla la lista vacía en vez de leer `roles[0]`.
      cell: (u) =>
        u.roles.length === 0 ? (
          // El texto reutiliza la entrada como acción directa: sin esto, el
          // admin tendría que adivinar que hay que ir a otra parte a asignar
          // el rol que toda cuenta recién creada necesita.
          <button
            type="button"
            onClick={() => setUsuarioParaRol(u)}
            className="text-xs text-amber-600 italic underline underline-offset-2 cursor-pointer"
          >
            Sin rol asignado — asignar ahora
          </button>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {/* `id` y `name` pueden venir los dos null (ver `RolDto`), así que
                la clave cae al índice antes que a `null`, que React trata como
                «sin clave» y avisa por consola. */}
            {u.roles.map((rol, i) => (
              <Badge key={rol.id ?? rol.name ?? i} color={colorDeRol(rol.name)}>
                {etiquetaDeRol(rol.name)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      header: 'Acciones',
      cell: (u) => {
        // El backend rechaza con 403 a un ADMIN que intente asignarle
        // contraseña a OTRO ADMIN que no sea él mismo. Se anticipa aquí en
        // vez de solo reaccionar al 403: el botón directamente no se ofrece,
        // con un texto que explica por qué en vez de esconderlo sin más
        // —eso parecería un bug, no una regla—. La comparación es por
        // `email`: el `User` de esta sesión no trae un `id` fiable (`login()`
        // nunca lo llena), y `email` es el único identificador estable (ver
        // `identidadDe` en `AppContext.tsx`).
        const filaEsAdmin = u.roles.some((rol) => normalizarNombreDeRol(rol.name) === 'ADMIN')
        const esLaPropiaCuenta = u.email === usuario.email
        const puedeAsignarContrasena = !filaEsAdmin || esLaPropiaCuenta

        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUsuarioParaRol(u)}
              title="Añadir un rol a esta cuenta"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-doc-blue bg-doc-blue/10 hover:bg-doc-blue/20 transition-colors cursor-pointer"
            >
              <Icon name="shield" size={13} /> Rol
            </button>
            {puedeAsignarContrasena ? (
              <button
                type="button"
                onClick={() => setUsuarioParaContrasena(u)}
                title="Asignar o reestablecer la contraseña"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <Icon name="edit" size={13} /> Contraseña
              </button>
            ) : (
              <span
                className="text-[11px] text-slate-400 italic"
                title="Un administrador no puede asignar la contraseña de otra cuenta administradora; solo la cuenta propia puede hacerlo desde aquí."
              >
                Contraseña no disponible (admin↔admin)
              </span>
            )}
          </div>
        )
      },
    },
  ]

  if (!tieneAcceso) {
    return (
      <div>
        <Encabezado />
        <SinAcceso
          detalle={`Usuarios y Roles solo está disponible para el rol Administrador, porque el listado expone el correo de todo el personal. Su sesión tiene el rol ${etiquetaDeRoles(usuario.roles)}. Solicite el permiso al administrador del sistema si necesita entrar.`}
        />
      </div>
    )
  }

  return (
    <div>
      <Encabezado />

      {sinPermiso ? (
        <SinAcceso detalle="El servidor rechazó la consulta por falta de permisos. Es probable que su rol haya cambiado desde que inició sesión: cierre sesión y vuelva a entrar para actualizarlo." />
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setMostrarNuevoUsuario(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
            >
              <Icon name="add" size={16} color="white" /> Nuevo usuario
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between gap-4 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <span>{error}</span>
              <button
                onClick={reintentar}
                className="font-semibold underline underline-offset-2 cursor-pointer whitespace-nowrap"
              >
                Reintentar
              </button>
            </div>
          )}

          {cargando ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-500">
              Cargando usuarios…
            </div>
          ) : (
            <DataTable
              data={usuarios}
              columns={columns}
              keyExtractor={(u) => u.userId}
              searchable
              searchPlaceholder="Buscar por nombre, correo o rol..."
              searchFilter={(u, q) =>
                u.userName.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.roles.some((rol) => etiquetaDeRol(rol.name).toLowerCase().includes(q))
              }
              // `DataTable` usa el mismo texto para «no hay nada» y para «la
              // búsqueda no encontró nada», así que tiene que ser cierto en los
              // dos casos: «No hay usuarios registrados» sería mentira con 16
              // cuentas en la base y un filtro que no casa con ninguna.
              emptyMessage="No se encontraron usuarios."
              pageSize={5}
            />
          )}
        </>
      )}

      {/* Modal: Nuevo usuario (alta + segundo paso de rol/contraseña) */}
      <Modal
        isOpen={mostrarNuevoUsuario}
        onClose={() => setMostrarNuevoUsuario(false)}
        title="Nuevo usuario"
        subtitle="Alta de personal médico, enfermería o administración"
        icon="add"
      >
        <FormularioNuevoUsuario
          onCreado={agregarALista}
          onAsignarRolAhora={(u) => {
            setMostrarNuevoUsuario(false)
            setUsuarioParaRol(u)
          }}
          onAsignarContrasenaAhora={(u) => {
            setMostrarNuevoUsuario(false)
            setUsuarioParaContrasena(u)
          }}
          onCerrar={() => setMostrarNuevoUsuario(false)}
        />
      </Modal>

      {/* Modal: Asignar rol */}
      <Modal
        isOpen={usuarioParaRol !== null}
        onClose={() => setUsuarioParaRol(null)}
        title="Asignar rol"
        subtitle="Solo añade; no reemplaza ni quita ningún rol"
        icon="shield"
        headerGradient="bg-gradient-to-r from-amber-500 to-amber-600"
      >
        {usuarioParaRol && (
          <FormularioAsignarRol
            usuario={usuarioParaRol}
            onAsignado={(actualizado) => {
              actualizarEnLista(actualizado)
              setUsuarioParaRol(null)
            }}
            onCancel={() => setUsuarioParaRol(null)}
          />
        )}
      </Modal>

      {/* Modal: Asignar contraseña */}
      <Modal
        isOpen={usuarioParaContrasena !== null}
        onClose={() => setUsuarioParaContrasena(null)}
        title="Asignar contraseña"
        subtitle="También habilita la cuenta si estaba deshabilitada"
        icon="edit"
      >
        {usuarioParaContrasena && (
          <FormularioAsignarContrasena
            usuario={usuarioParaContrasena}
            onAsignada={(actualizado) => {
              actualizarEnLista(actualizado)
              setUsuarioParaContrasena(null)
            }}
            onCancel={() => setUsuarioParaContrasena(null)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Formularios de los tres modales ────────────────────────────────────────
// Viven aquí y no en components/forms/UserForm.tsx porque aquel construye un
// `User` de sesión en memoria (con especialidad y estado que el alta real no
// pide) y no habla con el API. Estos tres reflejan exactamente lo que
// `UserRequestDto`, `POST /user/{id}/role/{id}` y `POST /user/{id}/password`
// aceptan.

// Clases de los controles, compartidas por los tres formularios. Lo único que
// se agrega a las que ya había en el resto de la app es
// `focus-visible:ring-*`, que acompaña al `focus:outline-none`: quitar el
// contorno del navegador sin reponer nada deja a quien navega con teclado sin
// saber dónde está parado.
const inputClass =
  'w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-doc-blue focus-visible:ring-2 focus-visible:ring-doc-blue/40 transition-colors disabled:opacity-60'
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide'
const botonCancelar =
  'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60'
const botonConfirmar =
  'flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'

/** El asterisco es decoración: lo obligatorio ya lo dice el atributo `required`. */
const Obligatorio = () => <span aria-hidden="true"> *</span>

interface FormularioNuevoUsuarioProps {
  onCreado: (usuario: AltaUsuarioDto) => void
  onAsignarRolAhora: (usuario: AltaUsuarioDto) => void
  onAsignarContrasenaAhora: (usuario: AltaUsuarioDto) => void
  onCerrar: () => void
}

const FormularioNuevoUsuario: React.FC<FormularioNuevoUsuarioProps> = ({
  onCreado,
  onAsignarRolAhora,
  onAsignarContrasenaAhora,
  onCerrar,
}) => {
  // Un prefijo por instancia: con ids fijos, la etiqueta de un segundo modal
  // montado en la misma pantalla apuntaría al campo del primero.
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  const [nombreCompleto, setNombreCompleto] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `POST /user` nace SIEMPRE sin rol: cerrar el modal en cuanto responde
  // dejaría al admin adivinando que hace falta otra pantalla para poder usar
  // la cuenta que acaba de crear. En vez de eso, el mismo modal pasa a este
  // segundo paso.
  const [creado, setCreado] = useState<AltaUsuarioDto | null>(null)

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const nombre = nombreCompleto.trim()
    const correo = email.trim()
    // Validación mínima: solo que no falte nada. El backend no exige ninguna
    // regla de complejidad sobre la contraseña, así que aquí tampoco se
    // inventa una.
    if (!nombre || !correo || !password) {
      setError('Complete nombre completo, correo y contraseña.')
      return
    }

    setGuardando(true)
    setError(null)
    try {
      const nuevo = await crearUsuario({ email: correo, userName: nombre, password })
      onCreado(nuevo)
      setCreado(nuevo)
    } catch (err) {
      // Nada se pierde: un 409 (correo duplicado) o un 400 de validación no
      // debería obligar al admin a volver a teclear todo el formulario.
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  if (creado) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Cuenta creada para <strong>{creado.userName}</strong> ({creado.email}).
        </div>

        {!creado.correoDeVerificacionEnviado && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-2.5">
            {/* Nada de "revise su correo": ningún correo va a llegar. La
                cuenta existe en la base, deshabilitada y sin enlace de
                confirmación posible —Gmail satura seguido, no es un caso de
                laboratorio—, así que se ofrece la salida de inmediato en vez
                de solo informar el fallo. */}
            <p>
              El correo de confirmación no se pudo enviar. La cuenta existe, pero está
              deshabilitada y sin ningún enlace de confirmación posible.
            </p>
            <button
              type="button"
              onClick={() => onAsignarContrasenaAhora(creado)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors cursor-pointer"
            >
              Asignar contraseña ahora (también habilita la cuenta)
            </button>
          </div>
        )}

        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-2.5">
          <p>La cuenta todavía no tiene ningún rol asignado.</p>
          <button
            type="button"
            onClick={() => onAsignarRolAhora(creado)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-doc-blue hover:opacity-90 transition-colors cursor-pointer"
          >
            Asignar rol ahora
          </button>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCerrar}
            className="py-2.5 px-5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor={id('nombre')} className={labelClass}>
          Nombre completo<Obligatorio />
        </label>
        <input
          id={id('nombre')}
          required
          disabled={guardando}
          value={nombreCompleto}
          onChange={(e) => setNombreCompleto(e.target.value)}
          placeholder="Roberto Carlos Mejía"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('email')} className={labelClass}>
          Correo electrónico<Obligatorio />
        </label>
        <input
          id={id('email')}
          type="email"
          required
          disabled={guardando}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@docrecord.sv"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('password')} className={labelClass}>
          Contraseña<Obligatorio />
        </label>
        <input
          id={id('password')}
          type="password"
          required
          disabled={guardando}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onCerrar} disabled={guardando} className={botonCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className={botonConfirmar}>
          {guardando ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </form>
  )
}

interface FormularioAsignarRolProps {
  usuario: UsuarioDto
  onAsignado: (usuario: UsuarioDto) => void
  onCancel: () => void
}

const FormularioAsignarRol: React.FC<FormularioAsignarRolProps> = ({
  usuario,
  onAsignado,
  onCancel,
}) => {
  const [roles, setRoles] = useState<RolDto[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [rolSeleccionadoId, setRolSeleccionadoId] = useState<number | null>(null)
  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargarRoles = useCallback(async () => {
    try {
      const catalogo = await listarRoles()
      setRoles(catalogo)
    } catch (err) {
      setErrorCarga(
        err instanceof ApiError ? err.message : 'No se pudo cargar el catálogo de roles.',
      )
    }
  }, [])

  useEffect(() => {
    // Se pide al abrir el modal, no al montar la pantalla: `GET /roles/all`
    // no cambia entre una fila y otra, pero pedirlo solo cuando hace falta
    // evita una llamada de más en cada visita a Usuarios y Roles.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver usuarios/page.tsx cargarUsuarios
    void cargarRoles()
  }, [cargarRoles])

  // Los roles que la cuenta ya tiene se descartan del selector: mostrarlos
  // solo invitaría a reaccionar a un 409 «ya cuenta con este rol» en vez de
  // evitarlo de entrada.
  const yaTiene = new Set(
    usuario.roles
      .map((rol) => normalizarNombreDeRol(rol.name))
      .filter((clave): clave is string => clave !== null),
  )

  const disponibles = (roles ?? []).filter((rol) => {
    const clave = normalizarNombreDeRol(rol.name)
    return rol.id !== null && clave !== null && NOMBRES_DE_ROL_ASIGNABLES.includes(clave) && !yaTiene.has(clave)
  })

  const rolSeleccionado = disponibles.find((rol) => rol.id === rolSeleccionadoId) ?? null

  const handleConfirmar = async () => {
    if (rolSeleccionadoId === null) return
    setAsignando(true)
    setError(null)
    try {
      const actualizado = await asignarRol(usuario.userId, rolSeleccionadoId)
      onAsignado(actualizado)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar el rol.')
    } finally {
      setAsignando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Cuenta: <strong className="text-slate-700">{usuario.userName}</strong> ({usuario.email})
      </p>

      {/* Advertencia SIEMPRE visible, antes de elegir nada y no como letra
          pequeña después de confirmar: el backend no tiene inverso para esta
          operación, así que una interfaz que sugiera que se puede deshacer
          —una casilla que se marca y desmarca, por ejemplo— induciría a un
          error que solo se corrige entrando a la base de datos. */}
      <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Esta acción SOLO añade el rol elegido; no reemplaza ni quita ninguno. No
        existe la operación inversa en esta pantalla: si es un error, hay que
        corregirlo por otra vía.
      </div>

      {errorCarga && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorCarga}
        </p>
      )}

      {!errorCarga && roles === null && (
        <p className="text-sm text-slate-400 text-center py-4">Cargando roles disponibles…</p>
      )}

      {!errorCarga && roles !== null && disponibles.length === 0 && (
        <p className="text-sm text-slate-500">
          Esta cuenta ya tiene los tres roles que se pueden asignar desde aquí (Enfermera,
          Médico, Administrador).
        </p>
      )}

      {!errorCarga && disponibles.length > 0 && (
        <div className="space-y-2">
          {disponibles.map((rol) => (
            <label
              key={rol.id}
              className="flex items-center gap-3 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="rol-a-asignar"
                checked={rolSeleccionadoId === rol.id}
                onChange={() => setRolSeleccionadoId(rol.id)}
              />
              {etiquetaDeRol(rol.name)}
            </label>
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onCancel} disabled={asignando} className={botonCancelar}>
          {disponibles.length === 0 ? 'Cerrar' : 'Cancelar'}
        </button>
        {disponibles.length > 0 && (
          <button
            type="button"
            onClick={() => void handleConfirmar()}
            disabled={asignando || rolSeleccionadoId === null}
            className={botonConfirmar}
          >
            {asignando
              ? 'Añadiendo…'
              : `Añadir rol${rolSeleccionado ? ` ${etiquetaDeRol(rolSeleccionado.name)}` : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}

interface FormularioAsignarContrasenaProps {
  usuario: UsuarioDto
  onAsignada: (usuario: UsuarioDto) => void
  onCancel: () => void
}

const FormularioAsignarContrasena: React.FC<FormularioAsignarContrasenaProps> = ({
  usuario,
  onAsignada,
  onCancel,
}) => {
  const uid = useId()
  const id = (nombre: string) => `${uid}-${nombre}`

  // La contraseña vive solo en este estado local mientras se escribe, y sale
  // de aquí en un único cuerpo de petición. No se guarda en ningún
  // almacenamiento del navegador ni se registra por consola.
  const [password, setPassword] = useState('')
  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!password) {
      setError('La contraseña no puede estar vacía.')
      return
    }
    setAsignando(true)
    setError(null)
    try {
      const actualizado = await asignarContrasena(usuario.userId, password)
      onAsignada(actualizado)
    } catch (err) {
      // Incluye el caso admin-contra-admin: si el rol de la fila cambió
      // después de cargar la tabla, el 403 llega igual y el modal se queda
      // abierto mostrando el motivo en vez de cerrarse fingiendo que
      // funcionó.
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar la contraseña.')
    } finally {
      setAsignando(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <p className="text-sm text-slate-500">
        Cuenta: <strong className="text-slate-700">{usuario.userName}</strong> ({usuario.email})
      </p>

      {/* Visible ANTES de confirmar, no como descubrimiento posterior: es un
          efecto secundario real del endpoint, no solo un cambio de clave. */}
      <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Esto también HABILITA la cuenta si estaba deshabilitada —por ejemplo, porque
        no se pudo enviar el correo de confirmación al crearla— y borra cualquier
        enlace de confirmación pendiente.
      </div>

      <div>
        <label htmlFor={id('password')} className={labelClass}>
          Contraseña nueva<Obligatorio />
        </label>
        <input
          id={id('password')}
          type="password"
          required
          disabled={asignando}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={onCancel} disabled={asignando} className={botonCancelar}>
          Cancelar
        </button>
        <button type="submit" disabled={asignando} className={botonConfirmar}>
          {asignando ? 'Asignando…' : 'Asignar contraseña'}
        </button>
      </div>
    </form>
  )
}
