'use client'

import React, { useState } from 'react'
import { Patient } from '@/types'

interface PatientFormProps {
  onSubmit: (patient: Partial<Patient>) => void
  onCancel: () => void
}

export const PatientForm: React.FC<PatientFormProps> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    id_num: '',
    blood: 'O+',
    email: '',
    address: '',
    sex: 'Masculino',
    age: 28,
    born: '14 de Mayo de 1998',
    allergies: '',
    chronic: '',
    hereditary: '',
    weight: '70',
    height: '170',
    temp: '36.5',
    bp: '120/80',
    pulse: '75',
    sat: '98',
  })

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (step < 3) {
      setStep((s) => s + 1)
    } else {
      onSubmit({
        name: formData.name || 'Nuevo Paciente',
        phone: formData.phone || '7000-0000',
        id_num: formData.id_num || '00000000-0',
        blood: formData.blood,
        email: formData.email,
        address: formData.address || 'San Salvador, El Salvador',
        sex: formData.sex,
        age: Number(formData.age) || 28,
        born: formData.born,
        consultations: 0,
        status: 'Activo',
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-doc-blue">
              Paso 1: Datos Personales
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-doc-blue">1 de 3</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre Completo *</label>
              <input
                required
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Carlos Miguel Chávez Aguilar"
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Teléfono *</label>
              <input
                required
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="7000-0000"
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Identificación (DUI) *</label>
              <input
                value={formData.id_num}
                onChange={(e) => handleChange('id_num', e.target.value)}
                placeholder="01234567-8"
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo Sanguíneo</label>
              <select
                value={formData.blood}
                onChange={(e) => handleChange('blood', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
              >
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="paciente@correo.com"
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Dirección de Residencia</label>
              <input
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="San Salvador, El Salvador"
                className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block uppercase tracking-wider">
              Sexo
            </label>
            <div className="flex gap-4">
              {['Masculino', 'Femenino'].map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input
                    type="radio"
                    name="sex"
                    checked={formData.sex === s}
                    onChange={() => handleChange('sex', s)}
                    className="text-doc-blue"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-doc-blue">
              Paso 2: Historial Clínico Inicial
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-doc-blue">2 de 3</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Alergias Conocidas</label>
            <textarea
              value={formData.allergies}
              onChange={(e) => handleChange('allergies', e.target.value)}
              placeholder="Ej: Penicilina, sulfas, mariscos..."
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue resize-none h-20 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Enfermedades Crónicas</label>
            <textarea
              value={formData.chronic}
              onChange={(e) => handleChange('chronic', e.target.value)}
              placeholder="Ej: Hipertensión arterial, Asma..."
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue resize-none h-20 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Condiciones Heredofamiliares</label>
            <textarea
              value={formData.hereditary}
              onChange={(e) => handleChange('hereditary', e.target.value)}
              placeholder="Ej: Diabetes Mellitus tipo 2 (Padre)..."
              className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue resize-none h-20 bg-white"
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-doc-blue">
              Paso 3: Signos Vitales de Ingreso
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-doc-blue">3 de 3</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Peso (kg)', 'weight'],
              ['Talla (cm)', 'height'],
              ['Temperatura (°C)', 'temp'],
              ['Presión arterial (mmHg)', 'bp'],
              ['Pulso (bpm)', 'pulse'],
              ['Saturación O₂ (%)', 'sat'],
            ].map(([label, key]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                <input
                  value={(formData as Record<string, string | number>)[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-doc-blue bg-white"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={() => (step > 1 ? setStep((s) => s - 1) : onCancel())}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
        >
          {step > 1 ? 'Anterior' : 'Cancelar'}
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          {step < 3 ? 'Siguiente' : 'Guardar Paciente'}
        </button>
      </div>
    </form>
  )
}
