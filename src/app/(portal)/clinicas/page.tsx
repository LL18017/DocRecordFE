'use client'

import React, { useState } from 'react'
import { Clinica } from '@/types'
import { clinicas as initialClinicas } from '@/data/mockData'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ClinicForm } from '@/components/forms/ClinicForm'
import { useAppContext } from '@/context/AppContext'

export default function ClinicasPage() {
  const { activeClinic, setActiveClinic } = useAppContext()
  const [list, setList] = useState<Clinica[]>(initialClinicas)
  const [selected, setSelected] = useState<Clinica>(initialClinicas[0])
  const [showNew, setShowNew] = useState(false)
  const [workModal, setWorkModal] = useState<Clinica | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Clinica | null>(null)

  const handleCreateClinic = (clinic: Clinica) => {
    setList((prev) => [...prev, clinic])
    setSelected(clinic)
    setShowNew(false)
  }

  return (
    <div>
      {/* Header and top state */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Gestión de Clínicas</h1>
          {activeClinic && (
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Operando en: <span className="font-semibold text-emerald-700">{activeClinic.name}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-emerald-600 hover:opacity-90 shadow-sm transition-all cursor-pointer"
        >
          <Icon name="add" size={16} color="white" /> Agregar Clínica
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left clinic list */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-500 text-xs uppercase tracking-wider">
            Clínicas registradas ({list.length})
          </h3>
          {list.map((c) => {
            const isActive = activeClinic?.id === c.id
            const isSelected = selected.id === c.id
            return (
              <div
                key={c.id}
                className={`rounded-2xl border-2 transition-all overflow-hidden ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/70 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left p-4 cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center relative shadow-2xs ${
                        isSelected ? 'bg-doc-blue text-white' : 'bg-doc-surface text-slate-500'
                      }`}
                    >
                      <Icon name="clinicas" size={18} />
                      {isActive && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white ring-1 ring-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 text-sm truncate font-outfit">{c.name}</p>
                        {isActive && <Badge color="green">Activa</Badge>}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{c.address}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span>{c.phone}</span>
                    <span className="ml-auto">
                      <Badge color="blue">{c.patients} pacientes</Badge>
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-2 px-4 pb-3">
                  <button
                    onClick={() => setWorkModal(c)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-xs cursor-pointer ${
                      isActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-doc-blue hover:bg-doc-blue-light'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Icon name="vitals" size={13} color="white" /> Clínica activa
                      </>
                    ) : (
                      <>
                        <Icon name="clinicas" size={13} color="white" /> Trabajar aquí
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(c)}
                    className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                    title="Eliminar clínica"
                  >
                    <Icon name="delete" size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right Map View */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 font-outfit">{selected.name}</h3>
                {activeClinic?.id === selected.id && <Badge color="green">Clínica activa</Badge>}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{selected.address}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-400">
                {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
              </span>
              <button
                onClick={() => setWorkModal(selected)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                  activeClinic?.id === selected.id ? 'bg-emerald-600' : 'bg-doc-blue hover:opacity-90'
                }`}
              >
                <Icon name="clinicas" size={13} color="white" />
                {activeClinic?.id === selected.id ? 'Activa' : 'Trabajar aquí'}
              </button>
            </div>
          </div>

          <div className="relative overflow-hidden h-96 w-full flex-1">
            <div className="absolute inset-0 bg-gradient-to-b from-[#d4e8c8] via-[#e0eed8] to-[#d8e8d0]" />

            {/* Street/blocks decorations */}
            {[
              { x: '30%', y: '40%', w: 120, h: 60, color: '#c8b870', label: 'Barrio Centro' },
              { x: '55%', y: '25%', w: 80, h: 40, color: '#c8b870', label: '' },
              { x: '20%', y: '60%', w: 100, h: 50, color: '#c8b870', label: '' },
              { x: '65%', y: '55%', w: 90, h: 45, color: '#c8b870', label: 'Zona Comercial' },
            ].map((block, i) => (
              <div
                key={i}
                className="absolute rounded-md"
                style={{
                  left: block.x,
                  top: block.y,
                  width: block.w,
                  height: block.h,
                  background: block.color,
                  opacity: 0.6,
                }}
              >
                {block.label && (
                  <span className="text-[11px] text-amber-900 font-medium absolute inset-0 flex items-center justify-center">
                    {block.label}
                  </span>
                )}
              </div>
            ))}

            {/* Roads */}
            {[
              { x: '10%', y: '50%', length: '80%', orient: 'h' },
              { x: '40%', y: '10%', length: '80%', orient: 'v' },
            ].map((road, i) => (
              <div
                key={i}
                className="absolute bg-amber-200/80 shadow-inner"
                style={
                  road.orient === 'h'
                    ? { left: road.x, top: road.y, width: road.length, height: 8 }
                    : { left: road.x, top: road.y, width: 8, height: road.length }
                }
              />
            ))}

            {/* Clinic pins */}
            {list.map((c, i) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c)
                  setWorkModal(c)
                }}
                className="absolute transition-transform hover:scale-110 cursor-pointer z-10"
                style={{
                  left: `${30 + i * 20}%`,
                  top: `${35 + i * 15}%`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <div
                  className={`w-9 h-9 rounded-full border-2 border-white shadow-lg flex items-center justify-center ${
                    activeClinic?.id === c.id
                      ? 'bg-emerald-600'
                      : selected.id === c.id
                      ? 'bg-doc-blue'
                      : 'bg-doc-amber'
                  }`}
                >
                  <Icon name="clinicas" size={15} color="white" />
                </div>
                <div
                  className={`w-2 h-2 rounded-full mx-auto -mt-0.5 ${
                    activeClinic?.id === c.id
                      ? 'bg-emerald-600'
                      : selected.id === c.id
                      ? 'bg-doc-blue'
                      : 'bg-doc-amber'
                  }`}
                />
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg px-3 py-1.5 whitespace-nowrap text-xs font-medium text-slate-700 border border-slate-100">
                  {c.name.split(' ').slice(0, 2).join(' ')}
                  {activeClinic?.id === c.id && <span className="text-emerald-600 font-bold ml-1">✓</span>}
                </div>
              </button>
            ))}

            <div className="absolute top-3 right-3 flex flex-col gap-1">
              {['+', '−'].map((s) => (
                <button
                  key={s}
                  className="w-8 h-8 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-50 text-lg cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 bg-white/90 px-2 py-0.5 rounded shadow-2xs font-mono">
              OpenStreetMap · El Salvador
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Trabajar en esta clínica */}
      <Modal
        isOpen={workModal !== null}
        onClose={() => setWorkModal(null)}
        title="Trabajar en esta clínica"
        subtitle="Cambio de sede de operaciones"
        icon="clinicas"
        headerGradient="bg-gradient-to-r from-doc-blue to-doc-blue-light"
      >
        {workModal && (
          <div className="text-center py-2">
            <h4 className="text-lg font-bold mb-1 text-doc-blue font-outfit">{workModal.name}</h4>
            <p className="text-slate-400 text-sm mb-2">{workModal.address}</p>
            <div className="flex items-center justify-center gap-4 text-xs text-slate-400 mb-6 font-mono">
              <span>{workModal.phone}</span>
              <span>
                {workModal.lat.toFixed(4)}, {workModal.lng.toFixed(4)}
              </span>
            </div>

            {activeClinic && activeClinic.id !== workModal.id && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800 text-left">
                Actualmente operando en <strong>{activeClinic.name}</strong>. Se cambiará la sesión a la nueva sede.
              </div>
            )}
            {activeClinic?.id === workModal.id && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6 text-sm text-emerald-800 flex items-center gap-2 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Esta es tu clínica activa actualmente.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setWorkModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setActiveClinic(workModal)
                  setWorkModal(null)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-doc-blue hover:opacity-90 shadow-sm transition-all cursor-pointer"
              >
                {activeClinic?.id === workModal.id ? 'Continuar aquí' : 'Establecer como activa'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Confirmar eliminación */}
      <Modal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="Eliminar clínica"
        icon="delete"
        headerGradient="bg-gradient-to-r from-red-500 to-red-600"
        maxWidth="sm"
      >
        {deleteConfirm && (
          <div className="text-center py-2">
            <p className="text-slate-500 text-sm mb-1">¿Estás seguro de eliminar</p>
            <p className="font-semibold text-slate-800 mb-4 font-outfit">&ldquo;{deleteConfirm.name}&rdquo;?</p>
            <p className="text-xs text-red-500 mb-6">Esta acción no se puede deshacer.</p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setList((prev) => prev.filter((c) => c.id !== deleteConfirm.id))
                  if (selected.id === deleteConfirm.id) {
                    setSelected(list.find((c) => c.id !== deleteConfirm.id) || list[0])
                  }
                  setDeleteConfirm(null)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Nueva Clínica */}
      <Modal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        title="Nueva Clínica"
        subtitle="Registro de nueva sede de atención"
        icon="clinicas"
        headerGradient="bg-gradient-to-r from-emerald-600 to-teal-700"
      >
        <ClinicForm
          onSubmit={handleCreateClinic}
          onCancel={() => setShowNew(false)}
        />
      </Modal>
    </div>
  )
}
