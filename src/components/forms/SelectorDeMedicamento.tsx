'use client'

import React, { useId, useMemo, useState } from 'react'
import { sinTildes } from '@/lib/texto'
import { coincideConBusqueda, type MedicamentoCatalogoDto } from '@/services/medicamentos'

/**
 * Campo de medicamento de la receta: autocompletado sobre el catálogo (HU-23
 * criterio 3).
 *
 * Es un combobox y no un `<select>` porque el catálogo real pasa de cientos de
 * productos y nadie recorre un desplegable así con el paciente enfrente: se
 * teclea «amoxi» y se elige. Y no es un `<input list>` con `<datalist>` porque
 * ese acepta cualquier texto —el navegador solo sugiere—, que es justo lo que
 * la historia quiere dejar atrás.
 *
 * Lo que se escribe aquí NO es el medicamento: es la búsqueda. El medicamento
 * es la opción elegida (`seleccionado`), y en cuanto se vuelve a teclear la
 * elección se pierde. Así el formulario puede saber, al enviar, si lo que hay
 * en la casilla salió de la lista o es texto suelto, y negarse en el segundo
 * caso.
 *
 * Accesible según el patrón «combobox con lista» de WAI-ARIA: flechas para
 * moverse, Enter para elegir, Escape para cerrar, y la opción activa anunciada
 * con `aria-activedescendant` sin mover el foco fuera de la casilla.
 */
interface SelectorDeMedicamentoProps {
  /** Id del `<input>`, para que la `<label>` del formulario apunte a él. */
  id: string
  /** Medicamentos que se pueden recetar: los ACTIVOS del catálogo. */
  catalogo: readonly MedicamentoCatalogoDto[]
  /** Lo que hay escrito en la casilla. */
  texto: string
  /** El medicamento elegido de la lista, o `null` si lo escrito no es una elección. */
  seleccionado: MedicamentoCatalogoDto | null
  onCambiarTexto: (texto: string) => void
  onElegir: (medicamento: MedicamentoCatalogoDto) => void
  /** Señala la casilla cuando el formulario rechazó lo que tiene. */
  invalido?: boolean
  /** Id del aviso que explica por qué se rechazó. */
  descritoPor?: string
  deshabilitado?: boolean
  placeholder?: string
  className?: string
}

/** Cuántas opciones se muestran a la vez. Más que esto ya no se lee: se afina la búsqueda. */
const MAXIMO_DE_OPCIONES = 8

export const SelectorDeMedicamento: React.FC<SelectorDeMedicamentoProps> = ({
  id,
  catalogo,
  texto,
  seleccionado,
  onCambiarTexto,
  onElegir,
  invalido,
  descritoPor,
  deshabilitado,
  placeholder,
  className,
}) => {
  const listaId = `${useId()}-opciones`
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)

  // Con un medicamento ya elegido, el texto de la casilla es su descripción y
  // filtrar por él dejaría una sola opción; se ofrece el catálogo entero para
  // poder cambiarlo.
  const opciones = useMemo(
    () =>
      catalogo
        .filter((m) => (seleccionado ? true : coincideConBusqueda(m, texto)))
        .slice(0, MAXIMO_DE_OPCIONES),
    [catalogo, seleccionado, texto],
  )

  const elegir = (medicamento: MedicamentoCatalogoDto) => {
    onElegir(medicamento)
    setAbierto(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!abierto) {
        setAbierto(true)
        setActivo(0)
        return
      }
      if (opciones.length === 0) return
      const paso = e.key === 'ArrowDown' ? 1 : -1
      setActivo((prev) => (prev + paso + opciones.length) % opciones.length)
    } else if (e.key === 'Enter') {
      // Enter con la lista abierta ELIGE; no envía el formulario. Si no, el
      // médico que pulsa Enter para quedarse con la opción resaltada emitiría
      // la receta a medio llenar.
      if (abierto && opciones[activo]) {
        e.preventDefault()
        elegir(opciones[activo])
      }
    } else if (e.key === 'Escape') {
      if (abierto) {
        // Que el Escape cierre la lista y no el modal entero en el que vive
        // el formulario.
        e.stopPropagation()
        setAbierto(false)
      }
    }
  }

  /**
   * Al salir de la casilla, si lo escrito es EXACTAMENTE la descripción de un
   * medicamento (sin importar mayúsculas ni tildes), se toma como elegido: es
   * lo que alguien quiso decir al escribirlo entero, y obligarlo a abrir la
   * lista para lo mismo sería un paso de más. Cualquier otra cosa se queda
   * como texto sin elegir, y el formulario la rechaza al enviar.
   */
  const handleBlur = () => {
    setAbierto(false)
    if (seleccionado) return
    const escrito = sinTildes(texto.trim())
    if (!escrito) return
    const exacto = catalogo.find((m) => sinTildes(m.descripcion) === escrito)
    if (exacto) onElegir(exacto)
  }

  const mostrarLista = abierto && !deshabilitado
  const idOpcion = (i: number) => `${listaId}-${i}`

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={mostrarLista}
        aria-controls={listaId}
        aria-activedescendant={mostrarLista && opciones[activo] ? idOpcion(activo) : undefined}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={descritoPor}
        autoComplete="off"
        disabled={deshabilitado}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          onCambiarTexto(e.target.value)
          setAbierto(true)
          setActivo(0)
        }}
        onFocus={() => setAbierto(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
      />

      {/* La lista existe siempre en el DOM —vacía cuando está cerrada— para que
          `aria-controls` apunte a algo real. */}
      <ul
        id={listaId}
        role="listbox"
        aria-label="Medicamentos del catálogo"
        className={
          mostrarLista && opciones.length > 0
            ? 'absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1'
            : 'hidden'
        }
      >
        {mostrarLista &&
          opciones.map((m, i) => (
            <li
              key={m.medicamentoId}
              id={idOpcion(i)}
              role="option"
              aria-selected={seleccionado?.medicamentoId === m.medicamentoId}
              // mousedown y no click: el click llega DESPUÉS del blur de la
              // casilla, que ya habría cerrado la lista.
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(m)
              }}
              onMouseEnter={() => setActivo(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === activo ? 'bg-purple-50 text-purple-800' : 'text-slate-700'
              }`}
            >
              <span className="block font-medium">{m.descripcion}</span>
              <span className="block text-xs text-slate-400">Principio activo: {m.principioActivo}</span>
            </li>
          ))}
      </ul>

      {mostrarLista && opciones.length === 0 && texto.trim() !== '' && (
        <p className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-2 text-xs text-slate-500">
          Ningún medicamento del catálogo coincide con «{texto.trim()}».
        </p>
      )}
    </div>
  )
}
