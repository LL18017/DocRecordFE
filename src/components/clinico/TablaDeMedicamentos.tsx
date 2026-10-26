import React from 'react'
import type { MedicamentoPrescritoDto } from '@/services/prescripciones'

const CABECERAS = ['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración']

/**
 * Los renglones de una receta. Es la misma tabla en el histórico de recetas,
 * en el expediente y en el detalle de la consulta: tenerla en un solo sitio
 * evita que una columna nueva (la vía de administración, HU-22) aparezca en una
 * pantalla y falte en las otras.
 *
 * Dosis, vía, frecuencia y duración son obligatorias desde HU-22, así que se
 * pintan tal cual; las recetas anteriores traen «No especificada».
 */
export const TablaDeMedicamentos: React.FC<{ medicamentos: MedicamentoPrescritoDto[] }> = ({
  medicamentos,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-slate-100">
          {CABECERAS.map((h) => (
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
        {medicamentos.map((m) => (
          <tr key={m.id}>
            <td className="py-2.5 text-sm font-medium text-slate-800 pr-6">{m.medicamento}</td>
            <td className="py-2.5 text-xs font-mono text-slate-600 pr-6">{m.dosis}</td>
            <td className="py-2.5 text-sm text-slate-600 pr-6">{m.viaAdministracion}</td>
            <td className="py-2.5 text-sm text-slate-600 pr-6">{m.frecuencia}</td>
            <td className="py-2.5 text-sm text-slate-600">{m.duracion}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
