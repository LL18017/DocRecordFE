import React from 'react'

export type BadgeColor = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'purple' | 'emerald' | 'amber'

interface BadgeProps {
  children: React.ReactNode
  color?: BadgeColor | string
  className?: string
}

const colorMap: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200/50',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200/50',
  red: 'bg-red-100 text-red-700 border-red-200/50',
  yellow: 'bg-amber-100 text-amber-700 border-amber-200/50',
  amber: 'bg-amber-100 text-amber-700 border-amber-200/50',
  blue: 'bg-blue-100 text-blue-700 border-blue-200/50',
  purple: 'bg-purple-100 text-purple-700 border-purple-200/50',
  gray: 'bg-slate-100 text-slate-600 border-slate-200/50',
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  color = 'green',
  className = '',
}) => {
  const colorClass = colorMap[color] || colorMap.gray

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass} ${className}`}
    >
      {children}
    </span>
  )
}
