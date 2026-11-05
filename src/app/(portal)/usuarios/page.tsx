'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useId, useState } from 'react'
import { Role } from '@/types'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { sinTildes } from '@/lib/texto'
import { Modal } from '@/components/ui/Modal'
import { ApiError } from '@/lib/api'
import { AYUDA_CONTRASENA, motivoContrasenaInvalida } from '@/lib/contrasena'
import { hoyEnElSalvador, motivoNacimientoInvalido } from '@/lib/validaciones'
import { useAppContext, useUsuarioAutenticado } from '@/context/AppContext'
import { etiquetaDeRoles } from '@/lib/roles'
import {
  asignarClinica,
  asignarContrasena,
  asignarRol,
  cambiarEstadoUsuario,
  clinicasAsignadas,
  crearUsuario,
  listarRoles,
  listarUsuarios,
  quitarClinica,
  quitarRol,
  reenviarConfirmacion,
  type AltaUsuarioDto,
  type RolDto,
  type UsuarioDto,
} from '@/services/usuarios'
import { HistorialDeUsuario } from '@/components/usuarios/HistorialDeUsuario'
import { listarTodasLasClinicas, type ClinicaDto } from '@/services/clinicas'

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
 * Los roles que esta pantalla deja asignar.
 *
 * PACIENTE estuvo fuera mientras no concedía nada: no había portal del
 * paciente y el rol quedaba decorativo. Desde DRS-101 existe «Mi expediente»
 * (/mi-panel), así que darlo aquí sí abre algo, y el caso es real: el personal
 * también se atiende en la red —el modelo de `persona` con especializaciones
 * de clave compartida existe justo para eso: una enfermera puede a la vez ser
 * paciente—. Al paciente que no es del personal se le sigue dando acceso desde
 * su expediente (AccesoAlPortal), que le crea la cuenta y le manda la
 * invitación.
 *
 * Darlo no se parece a los otros tres: si la persona aún no tiene expediente,
 * el backend se lo abre en el mismo paso y pide fecha de nacimiento y sexo; y
 * no lleva sede de trabajo, porque un paciente no trabaja en ninguna.
 *
 * Se listan a mano en vez de ofrecer todo lo que traiga `GET /roles/all`: la
 * tabla `role` es texto libre, y un rol nuevo no debe aparecer aquí antes de
 * que la pantalla sepa qué hay que pedir para darlo.
 */
const NOMBRES_DE_ROL_ASIGNABLES: readonly string[] = ['ADMIN', 'MEDICO', 'ENFERMERA', 'PACIENTE']

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
  const [usuarioParaClinicas, setUsuarioParaClinicas] = useState<UsuarioDto | null>(null)
  const [usuarioParaHistorial, setUsuarioParaHistorial] = useState<UsuarioDto | null>(null)
  // El id de la fila en vuelo, no un booleano compartido: con un booleano,
  // pulsar una fila deshabilitaria el boton de todas.
  const [cambiandoEstado, setCambiandoEstado] = useState<number | null>(null)

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
    // Algunos endpoints no calculan `sedes` (cambiar estado, contraseña): se
    // conserva el que ya se sabía en vez de perderlo y dejar de avisar. Con
    // `expediente` igual, y ahí conservarlo nunca miente: un expediente no se
    // borra, así que el número que ya se conocía sigue siendo cierto.
    setUsuarios((prev) =>
      prev.map((u) =>
        u.userId === actualizado.userId
          ? {
              ...actualizado,
              sedes: actualizado.sedes ?? u.sedes,
              expediente: actualizado.expediente ?? u.expediente,
            }
          : u,
      ),
    )
  }

  /** El modal de sedes avisa cada cambio para que el aviso «Sin sede» de la fila se actualice. */
  const actualizarSedesEnLista = (userId: number, sedes: number) => {
    setUsuarios((prev) => prev.map((u) => (u.userId === userId ? { ...u, sedes } : u)))
  }

  /** Inserta la cuenta recién creada. `POST /user` no la devuelve en el listado paginado hasta el próximo `GET /user/all`. */
  const agregarALista = (nuevo: AltaUsuarioDto) => {
    // Una cuenta recién creada no tiene ninguna sede.
    setUsuarios((prev) => [{ ...nuevo, sedes: nuevo.sedes ?? 0 }, ...prev])
  }

  /**
   * Activa o desactiva una cuenta (HU-05 criterio 3).
   *
   * Guarda el `userId` en vuelo y no un booleano de «cargando»: con un
   * booleano compartido, pulsar una fila deshabilitaría el botón de TODAS, que
   * es justo lo que hace pensar que la pantalla se colgó.
   *
   * La fila se reemplaza con lo que devuelve el backend en vez de invertir el
   * valor a mano: si el servidor decidió otra cosa —o rechazó el cambio— la
   * pantalla debe mostrar lo que quedó guardado, no lo que se pidió.
   */
  const cambiarEstado = async (u: UsuarioDto) => {
    setCambiandoEstado(u.userId)
    setError(null)
    try {
      const actualizado = await cambiarEstadoUsuario(u.userId, !u.activo)
      setUsuarios((prev) => prev.map((x) => (x.userId === u.userId ? { ...x, ...actualizado } : x)))
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'No se pudo cambiar el estado de la cuenta. Intente de nuevo.',
      )
    } finally {
      setCambiandoEstado(null)
    }
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
      header: 'Especialidad',
      // Null cuando la cuenta no ejerce la medicina, y eso no es un dato que
      // falte: es que la pregunta no le corresponde. Se pinta un guion, nunca
      // texto inventado ni una especialidad por defecto.
      cell: (u) =>
        u.especialidad ? (
          <span className="text-sm text-slate-700">{u.especialidad}</span>
        ) : (
          <span className="text-slate-400" aria-label="Sin especialidad">
            —
          </span>
        ),
    },
    {
      header: 'Estado',
      cell: (u) => (
        <Badge color={u.activo ? 'green' : 'red'}>{u.activo ? 'Activa' : 'Inactiva'}</Badge>
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
        // Un médico o una enfermera sin sede no puede entrar a trabajar: se
        // queda en la pantalla de selección de clínica. `sedes` nulo es «no se
        // sabe», y entonces no se avisa de algo que no se comprobó.
        const sinSede =
          u.sedes === 0 &&
          u.roles.some((rol) => ['MEDICO', 'ENFERMERA'].includes(normalizarNombreDeRol(rol.name) ?? ''))
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
            {/* Sedes va junto a Rol porque es la misma decisión: qué puede
                hacer esta cuenta y DÓNDE. Sin esto, enfermería no podía pasar
                de la pantalla de selección de clínica: `clinicas.user_id` es
                quien REGISTRÓ la sede, y una enfermera no registra ninguna. */}
            <button
              type="button"
              onClick={() => setUsuarioParaClinicas(u)}
              title={
                sinSede
                  ? 'Esta cuenta no tiene ninguna sede: no puede entrar a trabajar hasta que se le asigne una'
                  : 'Asignar las sedes donde trabaja esta cuenta'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                sinSede
                  ? 'text-amber-800 bg-amber-100 ring-1 ring-amber-300 hover:bg-amber-200'
                  : 'text-doc-teal bg-doc-teal/10 hover:bg-doc-teal/20'
              }`}
            >
              <Icon name="clinicas" size={13} /> {sinSede ? 'Sin sede' : 'Sedes'}
            </button>
            {/* Historial de administración de la cuenta (HU-05 criterio 5). */}
            <button
              type="button"
              onClick={() => setUsuarioParaHistorial(u)}
              title="Ver quién y cuándo dio de alta, activó o cambió los roles de esta cuenta"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Icon name="history" size={13} /> Historial
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
            {/* Activar o desactivar (HU-05 criterio 3). No se ofrece sobre la
                cuenta propia: el backend lo rechaza con 409 —quedarse uno
                mismo fuera no tiene arreglo desde la aplicación— y es mejor
                explicar por qué no está que mostrar un botón que va a fallar. */}
            {esLaPropiaCuenta ? (
              <span
                className="text-[11px] text-slate-400 italic"
                title="Nadie puede desactivar su propia cuenta: si el último administrador se deja fuera, no hay forma de volver a entrar."
              >
                Es su cuenta
              </span>
            ) : (
              <button
                type="button"
                disabled={cambiandoEstado === u.userId}
                onClick={() => cambiarEstado(u)}
                title={
                  u.activo
                    ? 'Desactivar: la cuenta deja de poder iniciar sesión, pero conserva todos sus registros'
                    : 'Reactivar: la cuenta vuelve a poder iniciar sesión'
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                  u.activo
                    ? 'text-red-600 bg-red-50 hover:bg-red-100'
                    : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                }`}
              >
                <Icon name={u.activo ? 'close' : 'shield'} size={13} />
                {cambiandoEstado === u.userId ? 'Guardando…' : u.activo ? 'Desactivar' : 'Reactivar'}
              </button>
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
                sinTildes(u.userName).includes(sinTildes(q)) ||
                sinTildes(u.email).includes(sinTildes(q)) ||
                u.roles.some((rol) => sinTildes(etiquetaDeRol(rol.name)).includes(sinTildes(q)))
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
            onActualizado={(actualizado) => {
              actualizarEnLista(actualizado)
              // El modal sigue abierto, pero apuntando a la versión nueva de la
              // cuenta: si no, la lista de roles de dentro seguiría mostrando
              // los de antes del cambio.
              setUsuarioParaRol(actualizado)
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

      {/* Modal: historial de administración de la cuenta */}
      <Modal
        isOpen={usuarioParaHistorial !== null}
        onClose={() => setUsuarioParaHistorial(null)}
        title="Historial de la cuenta"
        subtitle="Quién y cuándo hizo cada cambio"
        icon="history"
      >
        {usuarioParaHistorial && (
          <HistorialDeUsuario
            userId={usuarioParaHistorial.userId}
            userName={usuarioParaHistorial.userName}
            onCerrar={() => setUsuarioParaHistorial(null)}
          />
        )}
      </Modal>

      {/* Modal: sedes donde trabaja la cuenta */}
      <Modal
        isOpen={usuarioParaClinicas !== null}
        onClose={() => setUsuarioParaClinicas(null)}
        title="Sedes asignadas"
        subtitle="Dónde puede operar esta cuenta, sin volverla dueña de la clínica"
        icon="clinicas"
        headerGradient="bg-gradient-to-r from-doc-teal to-teal-700"
      >
        {usuarioParaClinicas && (
          <FormularioDeSedes
            usuario={usuarioParaClinicas}
            onCerrar={() => setUsuarioParaClinicas(null)}
            onCambioDeSedes={(cantidad) => actualizarSedesEnLista(usuarioParaClinicas.userId, cantidad)}
          />
        )}
      </Modal>
    </div>
  )
}

// ─── Sedes asignadas ────────────────────────────────────────────────────────

interface FormularioDeSedesProps {
  usuario: UsuarioDto
  onCerrar: () => void
  /** Cuántas sedes quedaron, tras cada cambio confirmado por el servidor. */
  onCambioDeSedes?: (cantidad: number) => void
}

/**
 * Asigna y retira sedes, una a una y confirmando contra el servidor.
 *
 * NO acumula cambios para guardarlos al final: cada casilla es una llamada que
 * se marca solo cuando el backend la confirma. En una lista de permisos, una
 * casilla marcada que todavía no se guardó dice que alguien tiene un acceso
 * que no tiene.
 *
 * `/clinics` trae TODAS las sedes -no `/clinics/mias`-, porque para asignar
 * hace falta ver también las que registró otro: es justo el caso de enfermería,
 * que va a trabajar en la clínica de un médico.
 */
const FormularioDeSedes: React.FC<FormularioDeSedesProps> = ({ usuario, onCerrar, onCambioDeSedes }) => {
  const [todas, setTodas] = useState<ClinicaDto[]>([])
  const [asignadas, setAsignadas] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    const [resTodas, resAsignadas] = await Promise.allSettled([
      listarTodasLasClinicas(),
      clinicasAsignadas(usuario.userId),
    ])

    if (resTodas.status === 'fulfilled') setTodas(resTodas.value)
    if (resAsignadas.status === 'fulfilled') {
      setAsignadas(resAsignadas.value.map((c) => c.clinicaId))
    }

    const fallo = [resTodas, resAsignadas].find((r) => r.status === 'rejected')
    setError(
      fallo && fallo.status === 'rejected'
        ? fallo.reason instanceof Error && fallo.reason.message
          ? fallo.reason.message
          : 'No se pudieron cargar las sedes.'
        : null,
    )
    setCargando(false)
  }, [usuario.userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver (portal)/consultas/page.tsx
    void cargar()
  }, [cargar])

  const alternar = async (clinicaId: number, estaAsignada: boolean) => {
    setEnCurso(clinicaId)
    setError(null)
    try {
      if (estaAsignada) {
        await quitarClinica(usuario.userId, clinicaId)
        setAsignadas((prev) => prev.filter((id) => id !== clinicaId))
        onCambioDeSedes?.(asignadas.length - 1)
      } else {
        await asignarClinica(usuario.userId, clinicaId)
        setAsignadas((prev) => [...prev, clinicaId])
        onCambioDeSedes?.(asignadas.length + 1)
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : 'No se pudo cambiar la asignación.',
      )
    } finally {
      setEnCurso(null)
    }
  }

  if (cargando) {
    return <p className="py-8 text-center text-sm text-slate-500">Cargando sedes…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Marca las sedes donde <span className="font-semibold text-slate-700">{usuario.userName}</span>{' '}
        puede trabajar. Esto no la convierte en dueña de la clínica: quien la registró sigue
        siéndolo.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800"
        >
          {error}
        </p>
      )}

      {todas.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          No hay ninguna clínica registrada todavía. Un médico o un administrador tiene que dar de
          alta al menos una sede antes de poder asignarla.
        </p>
      ) : (
        <ul className="space-y-2">
          {todas.map((c) => {
            const estaAsignada = asignadas.includes(c.clinicaId)
            return (
              <li key={c.clinicaId}>
                <label className="flex items-center gap-3 rounded-xl border-2 border-slate-100 px-4 py-3 hover:border-slate-200 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={estaAsignada}
                    disabled={enCurso === c.clinicaId}
                    onChange={() => void alternar(c.clinicaId, estaAsignada)}
                    className="w-4 h-4 accent-doc-teal cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="flex-1 text-sm font-medium text-slate-700">{c.name}</span>
                  {enCurso === c.clinicaId && (
                    <span className="text-xs text-slate-400">Guardando…</span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCerrar}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          Cerrar
        </button>
      </div>
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
  // El reenvío puede cambiar la respuesta a «¿salió el correo?», así que se
  // guarda aparte de `creado`, que es lo que contestó el alta.
  const [correoReenviado, setCorreoReenviado] = useState<boolean | null>(null)
  const [reenviando, setReenviando] = useState(false)
  const [errorReenvio, setErrorReenvio] = useState<string | null>(null)

  const reenviar = async (usuario: AltaUsuarioDto) => {
    setReenviando(true)
    setErrorReenvio(null)
    try {
      const respuesta = await reenviarConfirmacion(usuario.userId)
      setCorreoReenviado(respuesta.correoDeVerificacionEnviado === true)
    } catch (err) {
      setErrorReenvio(err instanceof ApiError ? err.message : 'No se pudo reenviar el correo.')
    } finally {
      setReenviando(false)
    }
  }

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const nombre = nombreCompleto.trim()
    const correo = email.trim()
    if (!nombre || !correo || !password) {
      setError('Complete nombre completo, correo y contraseña.')
      return
    }
    // HU-03 criterio 2: la misma regla que aplica el backend.
    const motivo = motivoContrasenaInvalida(password)
    if (motivo) {
      setError(motivo)
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
    const correoSalio = correoReenviado ?? creado.correoDeVerificacionEnviado
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Cuenta creada para <strong>{creado.userName}</strong> ({creado.email}).
        </div>

        {/* Crear la cuenta no basta para que entre: nace sin confirmar. Se
            dice qué pasó con el correo y qué hace falta, en lugar de dejar
            que «creada» se lea como «lista para usar». */}
        {correoSalio && (
          <div
            role="status"
            className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-2.5"
          >
            <p>
              Se envió un correo de confirmación a <strong>{creado.email}</strong>. El enlace vale
              24 horas; hasta que lo use, la cuenta no puede iniciar sesión.
            </p>
            <button
              type="button"
              disabled={reenviando}
              onClick={() => void reenviar(creado)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60"
            >
              {reenviando ? 'Reenviando…' : 'Reenviar correo de confirmación'}
            </button>
          </div>
        )}

        {errorReenvio && (
          <p
            role="alert"
            className="rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorReenvio}
          </p>
        )}

        {!correoSalio && (
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-2.5">
            {/* Nada de "revise su correo": ningún correo va a llegar. La
                cuenta existe en la base, deshabilitada y sin enlace de
                confirmación posible —Gmail satura seguido, no es un caso de
                laboratorio—, así que se ofrece la salida de inmediato en vez
                de solo informar el fallo. */}
            <p>
              El correo de confirmación no se pudo enviar. La cuenta existe, pero está
              deshabilitada hasta que se confirme: reintente el envío o asigne una contraseña.
            </p>
            <button
              type="button"
              disabled={reenviando}
              onClick={() => void reenviar(creado)}
              className="mr-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-amber-800 bg-white border border-amber-400 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-60"
            >
              {reenviando ? 'Reenviando…' : 'Reintentar el envío del correo'}
            </button>
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
        <p className="text-xs text-slate-500 mt-2">{AYUDA_CONTRASENA}</p>
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
  /**
   * Añadir un rol SÍ cierra el modal: es una acción y se acabó. Salvo
   * Paciente, que pasa por `onActualizado` (ver abajo).
   */
  onAsignado: (usuario: UsuarioDto) => void
  /**
   * Refresca la cuenta SIN cerrar el modal, con lo que devolvió el servidor:
   * lo que se ve es lo que quedó guardado. Lo usan dos acciones:
   *
   * · Quitar un rol: quien administra permisos suele tocar varios roles de la
   *   misma cuenta seguidos, y cerrarlo al primero le obligaría a reabrirlo.
   * · Dar el rol Paciente: el modal se queda con el aviso de que la persona
   *   tiene que volver a iniciar sesión para ver «Mi expediente». Si se
   *   cerrara solo, ese aviso no lo leería nadie.
   */
  onActualizado: (usuario: UsuarioDto) => void
  onCancel: () => void
}

const FormularioAsignarRol: React.FC<FormularioAsignarRolProps> = ({
  usuario,
  onAsignado,
  onActualizado,
  onCancel,
}) => {
  const [roles, setRoles] = useState<RolDto[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [rolSeleccionadoId, setRolSeleccionadoId] = useState<number | null>(null)
  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quitandoId, setQuitandoId] = useState<number | null>(null)
  const usuarioEnSesion = useUsuarioAutenticado()
  // La sede activa es donde se abre el expediente al dar el rol Paciente a
  // quien todavía no lo tiene, igual que al registrar un paciente en
  // Pacientes (HU-07 criterio 4).
  const { activeClinic } = useAppContext()

  // Los dos datos que el backend exige para abrir un expediente. Arrancan
  // vacíos, sexo incluido: un valor por defecto se confirmaría sin que nadie
  // lo hubiera elegido, y quedaría escrito en un expediente clínico.
  const [dui, setDui] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [sexo, setSexo] = useState<'M' | 'F' | ''>('')
  // La cuenta tal como quedó tras darle el rol Paciente; mientras tenga
  // valor, el modal muestra el aviso de volver a iniciar sesión.
  const [pacienteAsignado, setPacienteAsignado] = useState<UsuarioDto | null>(null)

  // La primera sede. Un médico o una enfermera sin ninguna no puede entrar a
  // trabajar, así que a quien aún no tiene sede el rol clínico se le da junto
  // con ella (el backend responde 400 si falta).
  const [sedesDisponibles, setSedesDisponibles] = useState<ClinicaDto[] | null>(null)
  const [sedeId, setSedeId] = useState<number | ''>('')

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
    let vigente = true
    listarTodasLasClinicas()
      .then((lista) => {
        if (vigente) setSedesDisponibles(lista)
      })
      .catch(() => {
        if (vigente) setSedesDisponibles([])
      })
    return () => {
      vigente = false
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
  const seleccionaMedico = rolSeleccionado !== null && normalizarNombreDeRol(rolSeleccionado.name) === 'MEDICO'
  // `especialidad` no nula = la persona ya tiene ficha de médico. HU-02: la
  // ficha —especialidad y número de junta— se registra en Médicos, y es ahí
  // donde se da de alta a un médico; aquí solo se le da el rol a quien ya la
  // tiene. Sin ficha el backend responde 409, así que ni se ofrece.
  const tieneFicha = usuario.especialidad !== null
  const faltaFicha = seleccionaMedico && !tieneFicha
  const seleccionaRolClinico =
    rolSeleccionado !== null && ['MEDICO', 'ENFERMERA'].includes(normalizarNombreDeRol(rolSeleccionado.name) ?? '')
  // Ausente o nulo se trata como «sin sede»: una cuenta recién creada no trae
  // el conteo, y no tiene ninguna. Si ya la tuviera, elegir una no hace daño.
  const necesitaSede = seleccionaRolClinico && (usuario.sedes ?? 0) === 0
  const faltaSede = necesitaSede && sedeId === ''

  // Paciente no pide sede de trabajo. Pide los datos del expediente solo si
  // la persona aún no tiene uno; ausente cuenta como «no tiene» (ver
  // `UsuarioDto.expediente`).
  const seleccionaPaciente =
    rolSeleccionado !== null && normalizarNombreDeRol(rolSeleccionado.name) === 'PACIENTE'
  const expedienteExistente = usuario.expediente ?? null
  const abreExpediente = seleccionaPaciente && expedienteExistente === null
  const hoy = hoyEnElSalvador()
  const errorNacimiento = abreExpediente ? motivoNacimientoInvalido(fechaNacimiento, hoy) : null
  // El DUI se pide para que el expediente se encuentre después al buscar por
  // DUI en Pacientes, también desde otra sede: sin él, quien lo atiende solo
  // lo halla por el nombre. Quien recibe este rol es personal, y el personal
  // es mayor de edad, así que siempre tiene DUI.
  const duiNormalizado = normalizarDui(dui)
  const errorDui =
    abreExpediente && dui.trim() !== '' && !DUI_VALIDO.test(duiNormalizado)
      ? 'El DUI tiene 9 dígitos, por ejemplo 01234567-8.'
      : null
  const faltanDatosDeExpediente =
    abreExpediente &&
    (dui.trim() === '' || errorDui !== null || fechaNacimiento === '' || sexo === '' || errorNacimiento !== null)

  // Cuentas que ya tienen el rol MÉDICO pero no la ficha: las de antes de que
  // la ficha fuera obligatoria. Pasan el control de permisos y reciben 403 al
  // guardar una consulta; se reparan registrando su ficha en Médicos.
  const medicoSinFicha = yaTiene.has('MEDICO') && !tieneFicha

  const handleConfirmar = async () => {
    if (rolSeleccionadoId === null || faltaFicha || faltaSede || faltanDatosDeExpediente) return
    setAsignando(true)
    setError(null)
    try {
      // `clinicaId` dice cosas distintas según el rol: con Médico o Enfermera
      // es la sede donde va a trabajar; con Paciente, la sede donde se abre su
      // expediente. Si ya tiene expediente no viaja nada de eso: el backend lo
      // ignoraría.
      const clinicaId =
        necesitaSede && sedeId !== '' ? sedeId : abreExpediente ? activeClinic?.id : undefined
      const actualizado = await asignarRol(
        usuario.userId,
        rolSeleccionadoId,
        clinicaId,
        abreExpediente && sexo !== '' ? { dui: duiNormalizado, fechaNacimiento, sexo } : undefined,
      )
      if (seleccionaPaciente) {
        onActualizado(actualizado)
        setPacienteAsignado(actualizado)
      } else {
        onAsignado(actualizado)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar el rol.')
    } finally {
      setAsignando(false)
    }
  }

  /**
   * Quita un rol.
   *
   * El modal NO se cierra: quien administra permisos suele tocar varios roles
   * de la misma cuenta seguidos, y cerrarlo al primero le obligaría a volver a
   * abrirlo. La lista de arriba se actualiza con lo que devuelve el servidor,
   * así que lo que se ve es lo que quedó guardado, no lo que se pidió.
   */
  const handleQuitar = async (roleId: number) => {
    setQuitandoId(roleId)
    setError(null)
    try {
      onActualizado(await quitarRol(usuario.userId, roleId))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar el rol.')
    } finally {
      setQuitandoId(null)
    }
  }

  if (pacienteAsignado) {
    // `null` si el backend no devolvió el número (uno anterior a este
    // campo): entonces se confirma el rol sin inventar un expediente.
    const numero = pacienteAsignado.expediente ?? null
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-xl border-2 border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 space-y-2"
        >
          <p>
            <strong>{pacienteAsignado.userName}</strong> ya tiene el rol Paciente
            {numero && (
              <>
                {' '}
                y el expediente <strong>{numero}</strong>
              </>
            )}
            .
          </p>
          {/* Sin esto el rol parece no haber funcionado: los roles viajan en
              el token, y el de la sesión que esa persona tenga abierta se
              emitió sin Paciente, así que «Mi expediente» no le aparece hasta
              que entre de nuevo. */}
          <p>
            Para ver «Mi expediente» tiene que cerrar sesión y volver a entrar: los roles viajan
            en su sesión, y la que tenga abierta todavía no incluye el nuevo.
          </p>
        </div>
        <div className="flex pt-4 border-t border-slate-100">
          <button type="button" onClick={onCancel} className={botonCancelar}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Cuenta: <strong className="text-slate-700">{usuario.userName}</strong> ({usuario.email})
      </p>

      {/* Aquí vivía un aviso diciendo que NO existía la operación inversa y que
          un error solo se corregía «por otra vía» —es decir, entrando a la base
          de datos—. Ya no es cierto: `DELETE /user/{id}/role/{id}` existe y esta
          pantalla lo usa, así que mantener el aviso mentiría en el sentido
          contrario y seguiría asustando de algo reversible. */}

      {/* Roles actuales, con su botón de quitar */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Roles actuales
        </p>
        {usuario.roles.length === 0 ? (
          <p className="text-sm text-slate-400">Sin rol asignado.</p>
        ) : (
          <ul className="space-y-2">
            {usuario.roles.map((rol) => {
              const clave = normalizarNombreDeRol(rol.name)
              // Quitarse el ADMIN a uno mismo deja el sistema sin quien lo
              // administre y no tiene vuelta atrás desde la aplicación. El
              // backend lo rechaza con 409; aquí ni se ofrece, y se dice por
              // qué en vez de esconder el botón sin motivo.
              const esPropioAdmin = clave === 'ADMIN' && usuario.email === usuarioEnSesion.email
              return (
                <li
                  key={`${rol.id}-${rol.name}`}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-100 px-4 py-2.5"
                >
                  <Badge color={colorDeRol(rol.name)}>{etiquetaDeRol(rol.name)}</Badge>
                  {rol.id === null ? (
                    <span className="text-xs text-slate-400">Sin id: no se puede quitar</span>
                  ) : esPropioAdmin ? (
                    <span className="text-xs text-slate-400">
                      No puede quitarse su propio acceso de administrador
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleQuitar(rol.id as number)}
                      disabled={quitandoId !== null}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {quitandoId === rol.id ? 'Quitando…' : 'Quitar'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {medicoSinFicha && <AvisoSinFicha />}

      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Añadir un rol
        </p>
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
          Esta cuenta ya tiene todos los roles que se pueden asignar desde aquí (Administrador,
          Médico, Enfermera y Paciente).
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
          {faltaFicha && <AvisoSinFicha />}
          {necesitaSede && (
            <div className="pt-1">
              <SelectorDeSede sedes={sedesDisponibles} valor={sedeId} onCambio={setSedeId} />
            </div>
          )}
          {seleccionaPaciente &&
            (expedienteExistente !== null ? (
              <p className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Esta persona ya tiene el expediente <strong>{expedienteExistente}</strong>: solo se
                le da acceso a su portal, «Mi expediente».
              </p>
            ) : (
              <CamposDeExpedienteNuevo
                sede={activeClinic?.name ?? null}
                hoy={hoy}
                dui={dui}
                onDui={setDui}
                errorDui={errorDui}
                fechaNacimiento={fechaNacimiento}
                onFechaNacimiento={setFechaNacimiento}
                errorNacimiento={errorNacimiento}
                sexo={sexo}
                onSexo={setSexo}
              />
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
            disabled={
              asignando ||
              rolSeleccionadoId === null ||
              faltaFicha ||
              faltaSede ||
              faltanDatosDeExpediente
            }
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

/**
 * Aviso para quien quiere dar el rol Médico a una cuenta sin ficha (HU-02).
 * La ficha —especialidad y número de junta— se registra en Médicos, colgada
 * de esta misma cuenta, y desde ahí se le da el acceso.
 */
const AvisoSinFicha: React.FC = () => (
  <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    Esta cuenta <strong>no tiene ficha de médico</strong>: sin ella puede ver las pantallas clínicas,
    pero no registrar consultas, recetas ni antecedentes. Regístrela en{' '}
    <Link href="/medicos" className="font-semibold underline underline-offset-2">
      Médicos
    </Link>
    , con su especialidad y su número de junta, y dele acceso desde ahí.
  </div>
)

/**
 * Selector de la primera sede de un médico o una enfermera. Sin sedes
 * registradas lo dice, porque sin ninguna no hay a dónde asignar a la cuenta.
 */
const SelectorDeSede: React.FC<{
  sedes: ClinicaDto[] | null
  valor: number | ''
  onCambio: (valor: number | '') => void
}> = ({ sedes, valor, onCambio }) => {
  const uid = useId()
  if (sedes !== null && sedes.length === 0) {
    return (
      <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        Un médico o una enfermera necesita al menos una sede, y todavía no hay ninguna clínica
        registrada. Dé de alta una en Clínicas y vuelva a asignar el rol.
      </p>
    )
  }
  return (
    <div>
      <label htmlFor={`${uid}-sede`} className={labelClass}>
        Sede donde va a trabajar *
      </label>
      <select
        id={`${uid}-sede`}
        value={valor}
        onChange={(e) => onCambio(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={sedes === null}
        className={inputClass}
      >
        <option value="">{sedes === null ? 'Cargando sedes…' : 'Seleccione…'}</option>
        {(sedes ?? []).map((c) => (
          <option key={c.clinicaId} value={c.clinicaId}>
            {c.name}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-slate-500">
        Un médico o una enfermera necesita al menos una sede: sin ella no puede entrar a trabajar.
      </p>
    </div>
  )
}

/** El formato con que se guarda el DUI: 8 dígitos, guion y el verificador. */
const DUI_VALIDO = /^\d{8}-\d$/

/** «012345678» y «01234567-8» son el mismo DUI: se guarda con el guion. */
function normalizarDui(valor: string): string {
  const limpio = valor.trim()
  return /^\d{9}$/.test(limpio) ? `${limpio.slice(0, 8)}-${limpio.slice(8)}` : limpio
}

/**
 * Lo mínimo para abrirle expediente a una cuenta que se va a atender como
 * paciente: DUI, fecha de nacimiento y sexo. Fecha y sexo los exige el
 * backend; el DUI se pide aquí porque es lo que usa Pacientes para encontrar
 * a alguien, y un expediente sin él solo se halla por el nombre. El nombre ya
 * lo tiene la cuenta; el resto de la ficha se completa después en Pacientes,
 * donde sí se edita, en vez de convertir este diálogo de permisos en un
 * segundo formulario de alta de pacientes.
 *
 * La fecha se compara con hoy en El Salvador (`hoyEnElSalvador`), la misma
 * regla que el backend y que el alta de pacientes.
 */
const CamposDeExpedienteNuevo: React.FC<{
  /** Nombre de la sede activa, donde se abre el expediente; `null` si no hay. */
  sede: string | null
  hoy: string
  dui: string
  onDui: (valor: string) => void
  errorDui: string | null
  fechaNacimiento: string
  onFechaNacimiento: (valor: string) => void
  errorNacimiento: string | null
  sexo: 'M' | 'F' | ''
  onSexo: (valor: 'M' | 'F') => void
}> = ({ sede, hoy, dui, onDui, errorDui, fechaNacimiento, onFechaNacimiento, errorNacimiento, sexo, onSexo }) => {
  const uid = useId()
  return (
    <div className="space-y-3 pt-1">
      <p className="rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Todavía no es paciente: se le abre un expediente
        {sede && (
          <>
            {' '}
            en <strong>{sede}</strong>
          </>
        )}{' '}
        con el nombre de la cuenta y su DUI. Los demás datos se completan después desde la ficha
        del paciente.
      </p>
      <div>
        <label htmlFor={`${uid}-dui`} className={labelClass}>
          DUI<Obligatorio />
        </label>
        <input
          id={`${uid}-dui`}
          type="text"
          inputMode="numeric"
          required
          maxLength={10}
          placeholder="01234567-8"
          value={dui}
          onChange={(e) => onDui(e.target.value)}
          aria-invalid={errorDui ? true : undefined}
          aria-describedby={errorDui ? `${uid}-dui-error` : undefined}
          className={inputClass}
        />
        {errorDui && (
          <p id={`${uid}-dui-error`} role="alert" className="text-xs text-red-600 mt-1">
            {errorDui}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${uid}-nacimiento`} className={labelClass}>
          Fecha de nacimiento<Obligatorio />
        </label>
        <input
          id={`${uid}-nacimiento`}
          type="date"
          required
          max={hoy}
          value={fechaNacimiento}
          onChange={(e) => onFechaNacimiento(e.target.value)}
          aria-invalid={errorNacimiento ? true : undefined}
          aria-describedby={errorNacimiento ? `${uid}-nacimiento-error` : undefined}
          className={inputClass}
        />
        {errorNacimiento && (
          <p id={`${uid}-nacimiento-error`} role="alert" className="text-xs text-red-600 mt-1">
            {errorNacimiento}
          </p>
        )}
      </div>
      <div>
        <span id={`${uid}-sexo`} className={labelClass}>
          Sexo<Obligatorio />
        </span>
        <div role="radiogroup" aria-labelledby={`${uid}-sexo`} className="flex gap-4">
          {(
            [
              ['M', 'Masculino'],
              ['F', 'Femenino'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <label key={valor} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input
                type="radio"
                name={`${uid}-sexo`}
                checked={sexo === valor}
                onChange={() => onSexo(valor)}
              />
              {etiqueta}
            </label>
          ))}
        </div>
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
    const motivo = motivoContrasenaInvalida(password)
    if (motivo) {
      setError(motivo)
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
        <p className="text-xs text-slate-500 mt-2">{AYUDA_CONTRASENA}</p>
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
