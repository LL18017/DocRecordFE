'use client'

// ─── Agenda de citas ───────────────────────────────────────────────────────
// Esta pantalla era ENTERAMENTE falsa: cinco citas inventadas, todas asignadas
// a un «Dr. Juan Guerra» que no existe, sacadas de `@/data/mockData` y sin una
// sola llamada al backend. No es que estuvieran desactualizadas: no había nada
// que actualizar, porque EL BACKEND NO TIENE ENDPOINT DE CITAS. No hay tabla,
// no hay `/citas`, no hay nada que cargar.
//
// POR QUÉ UN AVISO Y NO UN ESTADO VACÍO. Un «no tienes citas para hoy» es una
// afirmación, y es una que este sistema no puede hacer: no existe ningún
// registro de citas del que esa frase pueda ser verdad o mentira. Un médico
// que lee una agenda vacía concluye que tiene la mañana libre, exactamente el
// mismo error al que le llevaban las cinco citas inventadas, solo que en la
// dirección contraria. Cuando ni siquiera hay fuente de datos, lo honesto no
// es enseñar el hueco: es decir que la sección todavía no existe.
//
// POR QUÉ SE FUE EL BOTÓN «NUEVA CITA». Abría un formulario que guardaba la
// cita en el estado de React y la perdía al recargar. Prometer que se agendó
// algo que no llegó a ninguna parte es peor que no ofrecer el botón.
// `components/forms/AppointmentForm.tsx` se conserva —con sus pruebas— para
// cuando el backend ofrezca el endpoint; simplemente ya no se muestra.
//
// PARA REACTIVARLA: hace falta que DocRecordBE exponga el CRUD de citas. En
// cuanto exista, el camino es el mismo que siguieron consultas y recetas:
// primero un `services/citas.ts` tipado contra el contrato, y esta pantalla
// encima.

import React from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

export default function AgendaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Agenda de Citas</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Programación y gestión de citas ambulatorias
        </p>
      </div>

      <div
        role="status"
        className="bg-white rounded-2xl shadow-sm border border-slate-100/80 px-6 py-14 text-center"
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
          <Icon name="agenda" size={26} />
        </div>

        <h2 className="mt-5 text-lg font-bold text-slate-800 font-outfit">
          La agenda todavía no está disponible
        </h2>

        <p className="mt-2 mx-auto max-w-xl text-sm text-slate-500">
          El sistema aún no registra citas: no hay dónde guardarlas ni de dónde leerlas. Esta
          pantalla no muestra ninguna, y tampoco una lista vacía: ambas cosas afirmarían algo
          sobre una agenda que DocRecord todavía no lleva.
        </p>

        <p className="mt-3 mx-auto max-w-xl text-sm text-slate-500">
          Mientras tanto, lo que sí queda registrado son las consultas ya atendidas.
        </p>

        <Link
          href="/consultas"
          className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-blue hover:opacity-90 shadow-sm transition-all"
        >
          <Icon name="consultas" size={16} color="white" /> Ver consultas médicas
        </Link>
      </div>
    </div>
  )
}
