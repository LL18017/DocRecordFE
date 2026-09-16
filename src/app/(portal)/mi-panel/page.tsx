'use client'

// ─── Mi información · la pantalla del rol PACIENTE ─────────────────────────
//
// Lo que esta pantalla ES: la confirmación de que la cuenta entró, con lo que
// el sistema sabe de ella. Lo que NO es: el portal del paciente.
//
// ── Por qué existe ────────────────────────────────────────────────────────
// PACIENTE es uno de los cuatro roles del backend (RolesEnum), pero el
// frontend no lo conocía: `mapearRoles` no lo reconocía y caía al rol por
// defecto, 'medico'. El resultado era que una cuenta de paciente entraba con
// el menú completo de un médico —Consultas, Prescripciones, Agenda— y el
// servidor le respondía 403 a cada una, porque no tiene fila en `medicos`. El
// portal le ofrecía seis pantallas que existían solo para negárselas.
//
// ── Por qué NO llama a ningún endpoint ────────────────────────────────────
// Porque no hay ninguno que pueda llamar. Ni un solo `@PreAuthorize` del
// backend incluye PACIENTE: no es que falte la pantalla, es que del lado del
// servidor este rol todavía no tiene permiso sobre nada. Inventar aquí una
// lista de consultas «del paciente» exigiría pedirla con las credenciales de
// otro rol, que es exactamente lo que el control de acceso está para impedir.
//
// Así que todo lo que se pinta sale de la sesión —el mismo `LoginResponseDto`
// que ya llegó— y no hay estados de carga ni de error que fingir.
//
// ── Por qué se dice en voz alta que el portal no está ─────────────────────
// Una pantalla escueta sin explicación se lee como una pantalla rota, y quien
// la vea va a buscar el fallo donde no está. El portal de consulta del
// paciente es HU-34, un elemento del Product Backlog sin comprometer a ningún
// sprint: no es una regresión ni un pendiente olvidado, es alcance que todavía
// no se ha planificado. Decirlo cuesta un párrafo y evita que se reporte como
// defecto.
//
// Cuando HU-34 entre a un sprint, esta pantalla es el lugar donde crece.

import React from 'react'
import { Icon } from '@/components/ui/Icon'
import { useUsuarioAutenticado } from '@/context/AppContext'
import { etiquetaDeRoles } from '@/lib/roles'

export default function MiPanelPage() {
  const user = useUsuarioAutenticado()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 font-outfit">Mi información</h1>
        <p className="text-sm text-slate-500 mt-1">
          Los datos con los que figura tu cuenta en DocRecord Sv.
        </p>
      </header>

      <section className="rounded-2xl border-2 border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-doc-navy flex items-center justify-center flex-shrink-0">
            <Icon name="person" size={26} color="white" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900 font-outfit truncate">{user.name}</p>
            <p className="text-sm text-slate-500 truncate">{user.email ?? 'Sin correo registrado'}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-6">
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</dt>
            {/* `etiquetaDeRoles` y no el texto «Paciente» escrito a mano: una
                cuenta puede tener varios roles a la vez, y si a esta se le
                añade otro, aquí debe verse. */}
            <dd className="text-sm text-slate-900 mt-1">{etiquetaDeRoles(user.roles)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Estado de la cuenta
            </dt>
            {/* No es un dato inventado aunque esté escrito fijo: el backend
                rechaza el login de una cuenta deshabilitada, así que estar
                viendo esta pantalla ya demuestra que está activa. Si algún día
                `LoginResponseDto` trae el estado, se lee de ahí. */}
            <dd className="text-sm text-slate-900 mt-1">Activa</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border-2 border-doc-amber/30 bg-doc-amber/5 p-6">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-doc-amber flex items-center justify-center flex-shrink-0">
            <Icon name="history" size={18} color="white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 font-outfit">
              Tu historial clínico todavía no se consulta desde aquí
            </h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              El portal donde podrás ver tus consultas, tus recetas y tus signos vitales está
              definido en el Product Backlog como HU-34 y aún no se ha comprometido a un sprint.
              Mientras tanto, tu expediente sí existe y lo consulta el personal de la clínica
              cuando te atiende.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
