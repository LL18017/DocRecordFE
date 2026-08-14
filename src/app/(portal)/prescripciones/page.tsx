'use client'

import React, { useState } from 'react'
import { Prescription } from '@/types'
import { prescriptions as initialPrescriptions, patients } from '@/data/mockData'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PrescriptionForm } from '@/components/forms/PrescriptionForm'

export default function PrescripcionesPage() {
  const [prescriptionsList, setPrescriptionsList] = useState<Prescription[]>(initialPrescriptions)
  const [showNew, setShowNew] = useState(false)

  const handleCreate = (prescription: Prescription) => {
    setPrescriptionsList((prev) => [prescription, ...prev])
    setShowNew(false)
  }

  return (
    <div>
      {/* Header and trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Prescripción de Medicamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Control y emisión de recetas médicas</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-purple-600 hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Nueva Prescripción
        </button>
      </div>

      {/* Prescriptions List */}
      <div className="space-y-4">
        {prescriptionsList.map((rx, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/80 hover:border-slate-200 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 font-outfit text-base">{rx.patient}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {rx.date} · {rx.doctor}
                </p>
              </div>
              <button className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 hover:bg-purple-100 transition-colors cursor-pointer">
                <Icon name="eye" size={14} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Medicamento', 'Dosis', 'Frecuencia', 'Duración'].map((h) => (
                      <th
                        key={h}
                        className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider pr-6"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rx.meds.map((m, j) => (
                    <tr key={j}>
                      <td className="py-2.5 text-sm font-medium text-slate-800 pr-6">{m.name}</td>
                      <td className="py-2.5 text-sm text-slate-600 pr-6 font-mono text-xs">{m.dose}</td>
                      <td className="py-2.5 text-sm text-slate-600 pr-6">{m.freq}</td>
                      <td className="py-2.5 text-sm text-slate-600">{m.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Modal with PrescriptionForm */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nueva Prescripción"
        subtitle="Emisión de receta con dosificación e indicaciones"
        icon="prescripciones"
        headerGradient="bg-gradient-to-r from-purple-600 to-purple-700"
        maxWidth="xl"
      >
        <PrescriptionForm
          patients={patients}
          onSubmit={handleCreate}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
