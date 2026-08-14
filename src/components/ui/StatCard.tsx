import React from 'react'
import { Icon } from './Icon'
import { IconName } from '@/types'

interface StatCardProps {
  icon: IconName
  label: string
  value: string | number
  iconColor: string
  onClick?: () => void
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  iconColor,
  onClick,
}) => (
  <div
    className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-slate-100/80 cursor-pointer hover:shadow-md hover:border-slate-200 transition-all group"
    onClick={onClick}
  >
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform ${iconColor}`}>
      <Icon name={icon} size={22} color="white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-800 font-outfit tracking-tight">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
    <div className="ml-auto text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all">
      <Icon name="chevron_right" size={18} />
    </div>
  </div>
)
