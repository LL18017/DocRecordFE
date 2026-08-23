'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Role } from '@/types'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { ApiError } from '@/lib/api'
import { useUsuarioAutenticado } from '@/context/AppContext'
import { listarUsuarios, type UsuarioDto } from '@/services/usuarios'

// Esta pantalla es de solo lectura mientras el backend no dé más de sí, y las
// dos cosas que sabía hacer antes se retiraron porque ninguna era verdad:
//
//   · «Nuevo Usuario» añadía una fila al estado de React y nada más. El
//     usuario no llegaba a la base, así que desaparecía al recargar. Conectarlo
//     a `POST /user` tampoco lo arregla hoy: el cifrado de la contraseña ya se
//     corrigió en el backend, pero ese endpoint sigue creando la cuenta
//     deshabilitada y sin token de confirmación, de modo que nadie puede
//     entrar con ella nunca (ver `services/usuarios.ts`). Dar de alta personal
//     —enfermería incluida— necesita una decisión de producto sobre cómo se
//     habilita esa cuenta, no un formulario más.
//   · Editar y eliminar no tienen endpoint: `/user` solo expone listar, crear
//     y añadir un rol. Los botones no llamaban a nada, y el de eliminar
//     borraba la fila de la pantalla dejando la cuenta viva en la base.
//
// La columna «Estado» se fue por lo mismo: `UserResponseDto` no trae `enabled`,
// así que aquella etiqueta «Activo» fija era una invención de la maqueta.

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
 * `GET /user/all` devuelve los roles sin prefijo ('MEDICO') mientras que el
 * login los manda con él ('ROLE_MEDICO'). Se normaliza igual que en
 * `mapearRol`: primero a mayúsculas y después quitar el prefijo, para no
 * depender del case. Un rol que no esté en la tabla se muestra tal cual en vez
 * de desaparecer.
 */
function etiquetaDeRol(nombre: string): string {
  const clave = nombre.toUpperCase().replace(/^ROLE_/, '')
  return ETIQUETAS_DE_ROL[clave] ?? nombre
}

function colorDeRol(nombre: string): string {
  const clave = nombre.toUpperCase().replace(/^ROLE_/, '')
  if (clave === 'ADMIN') return 'purple'
  if (clave === 'ENFERMERA') return 'green'
  return 'blue'
}

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
  const tieneAcceso = usuario.role === ROL_CON_ACCESO

  // La lista sale de GET /user/all. Antes se sembraba con `users` de
  // `@/data/mockData` y la búsqueda recorría personal inventado, así que un
  // usuario real de la base nunca aparecía por más que se le buscara.
  const [usuarios, setUsuarios] = useState<UsuarioDto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Un 403 no es un error que se pueda reintentar, así que no comparte estado
  // con el resto: se muestra como falta de permiso, no como fallo del sistema.
  const [sinPermiso, setSinPermiso] = useState(false)

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
          <span className="text-xs text-slate-400 italic">Sin rol asignado</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {u.roles.map((rol) => (
              <Badge key={rol.id ?? rol.name} color={colorDeRol(rol.name)}>
                {etiquetaDeRol(rol.name)}
              </Badge>
            ))}
          </div>
        ),
    },
  ]

  if (!tieneAcceso) {
    return (
      <div>
        <Encabezado />
        <SinAcceso
          detalle={`Usuarios y Roles solo está disponible para el rol Administrador, porque el listado expone el correo de todo el personal. Su sesión tiene el rol ${etiquetaDeRol(usuario.role)}. Solicite el permiso al administrador del sistema si necesita entrar.`}
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
    </div>
  )
}
