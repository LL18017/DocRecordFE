// ─── Servicio del catálogo de medicamentos ─────────────────────────────────
// HU-23 (DRS-92). `/medicamentos` es la lista controlada desde la que se
// receta: la receta ya no lleva el nombre del medicamento escrito a mano,
// sino el `medicamentoId` de una fila de este catálogo.
//
// Permisos del backend: LEER, Administrador, médico y enfermera; ESCRIBIR
// (alta, edición, activar/desactivar), solo Administrador. Pedir los
// desactivados (`incluirInactivos`) también es solo del Administrador: a los
// demás el backend les responde 403.

import { ApiError, apiFetch } from '@/lib/api'
import { sinTildes } from '@/lib/texto'

/** Espejo de `MedicamentoCatalogoResponseDto`. */
export interface MedicamentoCatalogoDto {
  medicamentoId: number
  nombreGenerico: string
  nombreComercial: string
  /**
   * Dato propio y no parte del nombre: es lo que HU-24 cruzará contra las
   * alergias del paciente. Si son varios, van separados por « + ».
   */
  principioActivo: string
  presentacion: string
  concentracion: string
  /** Solo los activos se pueden recetar. */
  activo: boolean
  /**
   * El producto en una línea, armado por el backend: «Amoxicilina 500 mg
   * (Amoxil), Cápsula». Es exactamente lo que queda escrito en la receta, así
   * que el formulario lo muestra tal cual en vez de componer el suyo.
   */
  descripcion: string
}

/** Espejo de `MedicamentoCatalogoRequestDto`. Los cinco son obligatorios. */
export interface GuardarMedicamentoPayload {
  nombreGenerico: string
  nombreComercial: string
  principioActivo: string
  presentacion: string
  concentracion: string
}

/** Topes de `@Size` del backend, para el `maxLength` de cada campo. */
export const MAX_LARGO_MEDICAMENTO: Record<keyof GuardarMedicamentoPayload, number> = {
  nombreGenerico: 80,
  nombreComercial: 80,
  principioActivo: 150,
  presentacion: 50,
  concentracion: 40,
}

export interface FiltroDeMedicamentos {
  /** Texto que se busca en el nombre genérico, el comercial y el principio activo. */
  buscar?: string
  /** Solo el Administrador; a los demás el backend responde 403. */
  incluirInactivos?: boolean
}

/**
 * El catálogo. Sin filtro, solo los ACTIVOS: es lo que se puede recetar, y el
 * orden (por nombre genérico) lo pone el backend.
 */
export async function listarMedicamentos(
  filtro: FiltroDeMedicamentos = {},
): Promise<MedicamentoCatalogoDto[]> {
  const params = new URLSearchParams()
  const buscar = filtro.buscar?.trim()
  if (buscar) params.set('buscar', buscar)
  if (filtro.incluirInactivos) params.set('incluirInactivos', 'true')
  const query = params.toString()
  try {
    return await apiFetch<MedicamentoCatalogoDto[]>(`/medicamentos${query ? `?${query}` : ''}`)
  } catch (error) {
    throw traducirError(error, 'consultar')
  }
}

/** Registra un medicamento. 409 si ya existe; el mensaje dice cuál. */
export async function crearMedicamento(
  payload: GuardarMedicamentoPayload,
): Promise<MedicamentoCatalogoDto> {
  try {
    return await apiFetch<MedicamentoCatalogoDto>('/medicamentos', {
      method: 'POST',
      body: limpiar(payload),
    })
  } catch (error) {
    throw traducirError(error, 'registrar')
  }
}

/**
 * Edita un medicamento. Reemplaza los cinco campos, como el alta.
 *
 * Las recetas ya emitidas no cambian: guardan el nombre que tenía el
 * medicamento cuando se recetó.
 */
export async function actualizarMedicamento(
  medicamentoId: number,
  payload: GuardarMedicamentoPayload,
): Promise<MedicamentoCatalogoDto> {
  try {
    return await apiFetch<MedicamentoCatalogoDto>(`/medicamentos/${medicamentoId}`, {
      method: 'PUT',
      body: limpiar(payload),
    })
  } catch (error) {
    throw traducirError(error, 'editar')
  }
}

/**
 * Activa o desactiva un medicamento. No borra nada: desactivado deja de
 * ofrecerse en las recetas nuevas y sigue apareciendo en las emitidas.
 */
export async function cambiarEstadoMedicamento(
  medicamentoId: number,
  activo: boolean,
): Promise<MedicamentoCatalogoDto> {
  try {
    return await apiFetch<MedicamentoCatalogoDto>(`/medicamentos/${medicamentoId}/estado`, {
      method: 'PATCH',
      body: { activo },
    })
  } catch (error) {
    throw traducirError(error, activo ? 'reactivar' : 'desactivar')
  }
}

/**
 * Si el medicamento coincide con lo tecleado, sin distinguir mayúsculas ni
 * tildes, en cualquiera de sus tres nombres.
 *
 * Es el mismo criterio que aplica el backend (`sin_tildes` en
 * MedicamentoRepository.buscar), para que la lista que se filtra en el cliente
 * y la que devolvería el servidor no se contradigan.
 */
export function coincideConBusqueda(medicamento: MedicamentoCatalogoDto, texto: string): boolean {
  const buscado = sinTildes(texto.trim())
  if (!buscado) return true
  return [medicamento.nombreGenerico, medicamento.nombreComercial, medicamento.principioActivo, medicamento.descripcion]
    .some((campo) => sinTildes(campo).includes(buscado))
}

function limpiar(payload: GuardarMedicamentoPayload): GuardarMedicamentoPayload {
  return {
    nombreGenerico: payload.nombreGenerico.trim(),
    nombreComercial: payload.nombreComercial.trim(),
    principioActivo: payload.principioActivo.trim(),
    presentacion: payload.presentacion.trim(),
    concentracion: payload.concentracion.trim(),
  }
}

/**
 * Traduce solo lo que el backend no explica bien por sí solo, mismo criterio
 * que services/clinicas.ts.
 *
 * El 409 pasa ENTERO a propósito: es el aviso de duplicado (criterio 2) y el
 * backend ya dice cuál es el medicamento que existe y si está desactivado.
 * Cambiarlo por un «ya existe» genérico le quitaría al administrador
 * justamente el dato que necesita para encontrarlo. El 400 también pasa: trae
 * el campo que falta.
 */
function traducirError(
  error: unknown,
  accion: 'consultar' | 'registrar' | 'editar' | 'desactivar' | 'reactivar',
): Error {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error('No se pudo completar la operación.')
  }
  switch (error.status) {
    case 403:
      return new ApiError(
        403,
        accion === 'consultar'
          ? 'No tienes permiso para ver los medicamentos desactivados del catálogo.'
          : `No tienes permiso para ${accion} medicamentos: el catálogo solo lo mantiene un administrador.`,
      )
    case 404:
      return new ApiError(404, 'Este medicamento ya no existe en el catálogo.')
    default:
      return error
  }
}
