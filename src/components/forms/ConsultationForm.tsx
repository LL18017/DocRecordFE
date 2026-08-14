'use client'

import React, { useState } from 'react'
import { Patient } from '@/types'
import { Icon } from '@/components/ui/Icon'

interface ConsultationFormProps {
  patients: Patient[]
  defaultPatientId?: string
  onSubmit: (data: { reason: string; diagnosis: string; meds: string[]; patientId: string }) => void
  onCancel: () => void
}

export const ConsultationForm: React.FC<ConsultationFormProps> = ({
  patients,
  defaultPatientId,
  onSubmit,
  onCancel,
}) => {
  const [patientId, setPatientId] = useState(defaultPatientId || patients[0]?.id || '')
  const [reason, setReason] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [rxLines, setRxLines] = useState([{ name: '', dose: '', freq: '', duration: '' }])

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!reason.trim()) return

    const meds = rxLines
      .filter((r) => r.name.trim() !== '')
      .map((r) => `${r.name}${r.dose ? ' ' + r.dose : ''}${r.freq ? ' ' + r.freq : ''}`)

    onSubmit({
      patientId,
      reason,
      diagnosis: diagnosis || 'Evaluación médica general',
      meds,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Paciente *
        </label>
        <select
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber bg-white"
        >
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id_num})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Motivo de consulta *
        </label>
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describa el motivo principal de la visita médica..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber resize-none h-20 bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Diagnóstico (Exclusivo Médico)
        </label>
        <textarea
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Diagnóstico clínico, CIE-10 u observaciones diagnósticas..."
          className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-doc-amber resize-none h-20 bg-white"
        />
      </div>

      {/* Dynamic prescriptions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <span className="w-5 h-5 rounded flex items-center justify-center bg-purple-600">
              <Icon name="prescripciones" size={11} color="white" />
            </span>
            Prescripción de medicamentos
          </label>
          <button
            type="button"
            onClick={() => setRxLines((prev) => [...prev, { name: '', dose: '', freq: '', duration: '' }])}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer"
          >
            <Icon name="add" size={12} color="#7C3AED" /> Agregar medicamento
          </button>
        </div>

        <div className="space-y-2">
          {rxLines.map((rx, i) => (
            <div
              key={i}
              className="grid grid-cols-4 gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70 relative"
            >
              <input
                placeholder="Medicamento"
                value={rx.name}
                onChange={(e) =>
                  setRxLines((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, name: e.target.value } : r))
                  )
                }
                className="col-span-2 border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 bg-white"
              />
              <input
                placeholder="Dosis (500mg)"
                value={rx.dose}
                onChange={(e) =>
                  setRxLines((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, dose: e.target.value } : r))
                  )
                }
                className="border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 bg-white"
              />
              <input
                placeholder="Frecuencia (c/8h)"
                value={rx.freq}
                onChange={(e) =>
                  setRxLines((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, freq: e.target.value } : r))
                  )
                }
                className="border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 bg-white"
              />
              <input
                placeholder="Duración (ej: 7 días)"
                value={rx.duration}
                onChange={(e) =>
                  setRxLines((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, duration: e.target.value } : r))
                  )
                }
                className="col-span-3 border-2 border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400 bg-white"
              />
              {rxLines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRxLines((prev) => prev.filter((_, j) => j !== i))}
                  className="flex items-center justify-center border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors bg-white cursor-pointer"
                >
                  <Icon name="delete" size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-amber hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          Guardar Consulta
        </button>
      </div>
    </form>
  )
}
