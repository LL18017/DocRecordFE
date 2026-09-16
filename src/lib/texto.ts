/**
 * Normaliza texto para comparar: sin tildes y en minúsculas.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * HU-08, criterio 2: «cuando busco, entonces encuentra coincidencias sin
 * distinguir mayúsculas ni tildes». Los buscadores de las tablas comparaban
 * con `toLowerCase().includes(...)`, que resuelve las mayúsculas y no las
 * tildes: escribir «Martinez» no encontraba a «Martínez», que es justo el caso
 * que el criterio nombra —y el habitual, porque casi nadie teclea la tilde al
 * buscar—.
 *
 * ── Por qué no basta con el backend ───────────────────────────────────────
 * El backend ya sabe hacerlo: `sin_tildes()` (migración V13, sobre la
 * extensión unaccent) se aplica en `idsQueCoinciden`. Pero la caja de búsqueda
 * de estas pantallas NO consulta al servidor: filtra en el cliente la lista ya
 * cargada, así que esa capacidad no llegaba a usarse nunca.
 *
 * ── Qué hace exactamente ──────────────────────────────────────────────────
 * NFD separa cada letra de su acento en dos caracteres, y el rango
 * U+0300–U+036F son esas marcas ya sueltas, que se descartan. La `ñ` entra en
 * el trato: se descompone en `n` + tilde, de modo que «Munoz» encuentra a
 * «Muñoz». Es el mismo criterio que aplica `unaccent` en PostgreSQL, así que
 * el filtro del cliente y el del servidor coinciden en vez de contradecirse.
 */
export function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
