// ─── Etiquetas de los roles de sesión ──────────────────────────────────────────
// Traduce el tipo `Role` que ya usa la sesión del cliente ('medico' |
// 'enfermera' | 'Administrador') a texto legible.
//
// No confundir con `ETIQUETAS_DE_ROL` de `usuarios/page.tsx`: esa traduce los
// nombres crudos de la tabla `role` del backend (ADMIN, MEDICO, PACIENTE…,
// con o sin prefijo ROLE_); esta traduce el `Role` ya normalizado que vive en
// `User.roles`.

import type { Role } from '@/types'

const ETIQUETAS: Record<Role, string> = {
  medico: 'Médico',
  enfermera: 'Enfermera',
  Administrador: 'Administrador',
}

/**
 * Texto para mostrar TODOS los roles de una cuenta en un solo lugar (p. ej.
 * el pie de la barra lateral o el menú de usuario).
 *
 * No existe una jerarquía real entre ADMIN y MEDICO —son capacidades
 * distintas, no niveles de lo mismo—, así que no se elige uno «principal» y
 * el resto se calla: se listan todos, unidos con « · », igual que la tabla de
 * Usuarios y Roles ya pinta cada rol de una cuenta como una insignia
 * separada.
 */
export function etiquetaDeRoles(roles: Role[]): string {
  return roles.map((rol) => ETIQUETAS[rol]).join(' · ')
}
