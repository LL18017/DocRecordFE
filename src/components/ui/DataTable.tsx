'use client'

import React, { useState, useMemo } from 'react'
import { Icon } from './Icon'

export interface Column<T> {
  header: string
  accessorKey?: keyof T
  cell?: (item: T, index: number) => React.ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T, index: number) => string | number
  searchable?: boolean
  searchPlaceholder?: string
  searchFilter?: (item: T, query: string) => boolean
  pagination?: boolean
  pageSize?: number
  emptyMessage?: string
  headerRight?: React.ReactNode
  className?: string
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  searchable = false,
  searchPlaceholder = 'Buscar...',
  searchFilter,
  pagination = true,
  pageSize = 5,
  emptyMessage = 'No se encontraron registros.',
  headerRight,
  className = '',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Filtered data based on search
  const filteredData = useMemo(() => {
    if (!search || !searchFilter) return data
    return data.filter((item) => searchFilter(item, search.toLowerCase()))
  }, [data, search, searchFilter])

  // Total pages
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1
  const validPage = Math.min(Math.max(1, currentPage), totalPages)

  // Paginated slice
  const paginatedData = useMemo(() => {
    if (!pagination) return filteredData
    const start = (validPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, pagination, validPage, pageSize])

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden ${className}`}>
      {/* Search and Header Actions */}
      {(searchable || headerRight) && (
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          {searchable && (
            <div className="relative max-w-sm w-full">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-doc-blue transition-colors bg-white"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <Icon name="search" size={16} />
              </div>
            </div>
          )}
          {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        </div>
      )}

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider ${
                    col.headerClassName || ''
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-8 text-center text-sm text-slate-400 italic"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIdx) => (
                <tr key={keyExtractor(item, rowIdx)} className="hover:bg-slate-50/70 transition-colors">
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className={`px-5 py-4 text-sm ${col.className || ''}`}>
                      {col.cell
                        ? col.cell(item, rowIdx)
                        : col.accessorKey
                        ? String(item[col.accessorKey] ?? '')
                        : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && (
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
          <p className="text-xs text-slate-400">
            Mostrando {filteredData.length === 0 ? 0 : (validPage - 1) * pageSize + 1} a{' '}
            {Math.min(validPage * pageSize, filteredData.length)} de {filteredData.length} registros
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage === 1}
                className="w-8 h-8 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Página anterior"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setCurrentPage(n)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    n === validPage
                      ? 'bg-doc-blue text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage === totalPages}
                className="w-8 h-8 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Página siguiente"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
