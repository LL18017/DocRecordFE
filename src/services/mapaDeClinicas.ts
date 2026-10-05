// ─── Mapa público de la red (HU-28, DRS-96) ──────────────────────────────────
// `GET /clinics/publicas` es el único endpoint de clínicas que no pide sesión:
// lo abre un paciente o un visitante sin cuenta desde /mapa. Devuelve solo las
// clínicas ACTIVAS y solo sus datos públicos —nada del dueño ni del personal—.

import { apiFetch } from '@/lib/api'

/**
 * Espejo de `ClinicaPublicaDto`. Sin `estado` (todas son ACTIVAS) y sin nada
 * de quién la registró.
 *
 * `latitud`/`longitud` anulables por lo mismo que en `ClinicaDto`: hay sedes
 * registradas antes de que alguien les tomara el GPS, y el backend las publica
 * igual porque existen y atienden.
 */
export interface ClinicaPublicaDto {
  clinicaId: number
  name: string
  latitud: number | null
  longitud: number | null
  departamento: string | null
  municipio: string | null
  direccion: string | null
  telefono: string | null
  horario: string | null
}

/**
 * Todas las clínicas activas de la red.
 *
 * `auth: false` no es solo cortesía: si quien abre el mapa tiene en la pestaña
 * un token vencido de otra visita, mandarlo dispararía la renovación de sesión
 * —y, si falla, la limpieza de sesión— en una página que nunca la necesitó.
 *
 * Se pide el catálogo entero y no `?departamento=`: el selector filtra en el
 * cliente, sin volver al servidor, y con un par de cientos de sedes la lista
 * completa sigue siendo unos pocos KB.
 */
export async function listarClinicasDeLaRed(): Promise<ClinicaPublicaDto[]> {
  return apiFetch<ClinicaPublicaDto[]>('/clinics/publicas', { auth: false })
}
