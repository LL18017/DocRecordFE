// ─── Mapa público de la red de clínicas (HU-28, DRS-96) ──────────────────────
// Lógica pura de la página /mapa, separada del componente por la misma razón
// que `mapaClinicas.ts`: Leaflet solo vive en el navegador, pero decidir qué
// clínicas se dibujan, cuáles se listan aparte y qué dice cada globo es
// aritmética sobre una lista y se puede probar sin DOM ni teselas.

import { sinTildes } from '@/lib/texto'
import type { ClinicaPublicaDto } from '@/services/mapaDeClinicas'

/**
 * Una clínica tal como la pinta el mapa público.
 *
 * Tiene la misma forma de `id`/`name`/`lat`/`lng` que `Clinica` a propósito:
 * así `calcularVistaInicial` y `tieneUbicacion` de `mapaClinicas.ts` sirven
 * igual aquí, sin una segunda copia de la regla de las coordenadas nulas.
 *
 * No lleva `estado`: el backend solo publica las ACTIVAS.
 */
export interface ClinicaPublica {
  id: number
  name: string
  lat: number | null
  lng: number | null
  departamento: string | null
  municipio: string | null
  direccion: string | null
  telefono: string | null
  horario: string | null
}

/** Clínica que sí se puede dibujar: tiene las DOS coordenadas. */
export type ClinicaPublicaUbicada = ClinicaPublica & { lat: number; lng: number }

/** Valor del selector que significa «sin filtro». */
export const TODOS_LOS_DEPARTAMENTOS = ''

/** Lo que se escribe donde falta un dato, en el globo y en la lista. */
export const DATO_NO_REGISTRADO = 'No registrado'

/**
 * Adapta la respuesta de `GET /clinics/publicas`. Las coordenadas viajan tal
 * cual, nulos incluidos: cambiar un null por 0 pondría la clínica en el golfo
 * de Guinea sin que nadie se enterara.
 */
export function clinicaPublicaDesdeDto(dto: ClinicaPublicaDto): ClinicaPublica {
  return {
    id: dto.clinicaId,
    name: dto.name,
    lat: dto.latitud,
    lng: dto.longitud,
    departamento: dto.departamento,
    municipio: dto.municipio,
    direccion: dto.direccion,
    telefono: dto.telefono,
    horario: dto.horario,
  }
}

/**
 * Clave con la que se comparan departamentos: sin tildes, sin mayúsculas y sin
 * espacios de sobra. El departamento es texto libre en el backend (V16), así
 * que «Usulután», «usulutan» y «Usulután » son el mismo departamento escrito por
 * tres personas. Es la misma regla que aplica el filtro `?departamento=` del
 * servidor con `sin_tildes()`, para que los dos no se contradigan.
 */
export function claveDeDepartamento(departamento: string | null | undefined): string {
  return sinTildes((departamento ?? '').trim().replace(/\s+/g, ' '))
}

export interface OpcionDeDepartamento {
  /** Lo que se compara (ver `claveDeDepartamento`). */
  valor: string
  /** Lo que se lee: la primera forma en que alguien lo escribió. */
  etiqueta: string
  /** Cuántas clínicas tiene, para que el selector diga si vale la pena. */
  clinicas: number
}

/**
 * Los departamentos que aparecen en la red, para el selector.
 *
 * Salen de las propias clínicas y no de la lista fija de los 14 departamentos:
 * ofrecer «Cabañas» cuando no hay ninguna sede allí sería un filtro que siempre
 * deja el mapa vacío. Las clínicas sin departamento no generan opción —no hay
 * nada que elegir—, pero siguen saliendo con «Todos».
 */
export function departamentosDeLaRed(clinicas: readonly ClinicaPublica[]): OpcionDeDepartamento[] {
  const porClave = new Map<string, OpcionDeDepartamento>()
  for (const clinica of clinicas) {
    const valor = claveDeDepartamento(clinica.departamento)
    if (!valor) continue
    const existente = porClave.get(valor)
    if (existente) {
      existente.clinicas += 1
    } else {
      porClave.set(valor, {
        valor,
        etiqueta: clinica.departamento!.trim().replace(/\s+/g, ' '),
        clinicas: 1,
      })
    }
  }
  return [...porClave.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

/**
 * Las clínicas de un departamento (criterio 3), o todas si `valor` es
 * `TODOS_LOS_DEPARTAMENTOS`. Filtra la lista ya cargada, en el cliente: cambiar
 * el selector no vuelve a pedir nada al servidor ni recarga la página.
 */
export function filtrarPorDepartamento<T extends ClinicaPublica>(
  clinicas: readonly T[],
  valor: string,
): T[] {
  const clave = claveDeDepartamento(valor)
  if (!clave) return [...clinicas]
  return clinicas.filter((c) => claveDeDepartamento(c.departamento) === clave)
}

/**
 * Una sola coordenada no ubica nada, y un número que no es finito tampoco: se
 * exigen las dos y se exige que sean números de verdad.
 */
export function estaUbicada(clinica: ClinicaPublica): clinica is ClinicaPublicaUbicada {
  return (
    typeof clinica.lat === 'number' &&
    typeof clinica.lng === 'number' &&
    Number.isFinite(clinica.lat) &&
    Number.isFinite(clinica.lng)
  )
}

/**
 * Separa lo que se dibuja de lo que se lista aparte.
 *
 * Las clínicas sin coordenadas NO se descartan ni se les inventa un punto
 * —el centro del país, la cabecera del departamento—: un paciente que fuera a
 * ese punto no encontraría nada. Se listan debajo del mapa con su dirección,
 * que es lo que de verdad le sirve para llegar.
 */
export function separarPorUbicacion(clinicas: readonly ClinicaPublica[]): {
  ubicadas: ClinicaPublicaUbicada[]
  sinUbicacion: ClinicaPublica[]
} {
  const ubicadas: ClinicaPublicaUbicada[] = []
  const sinUbicacion: ClinicaPublica[] = []
  for (const clinica of clinicas) {
    if (estaUbicada(clinica)) ubicadas.push(clinica)
    else sinUbicacion.push(clinica)
  }
  return { ubicadas, sinUbicacion }
}

export interface FichaDeClinica {
  titulo: string
  /** «Municipio, Departamento», o `null` si no hay ninguno de los dos. */
  lugar: string | null
  direccion: string
  telefono: string
  /** `tel:` listo para el enlace, o `null` si no hay teléfono que marcar. */
  enlaceTelefono: string | null
  horario: string
}

function texto(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim()
  return limpio ? limpio : null
}

/**
 * Lo que dice el globo de un marcador (criterio 2): nombre, dirección,
 * teléfono y horario.
 *
 * Los cuatro salen SIEMPRE, también cuando faltan: las clínicas registradas
 * antes de V16 no tienen dirección, y un globo que simplemente omite la línea
 * deja al paciente sin saber si el dato no existe o si la pantalla lo perdió.
 * «No registrado» dice lo primero.
 *
 * El teléfono se convierte en enlace `tel:` porque en un celular es lo que se
 * hace con él: tocarlo y llamar. Se quitan los guiones y espacios del número
 * para el enlace, no para lo que se lee.
 */
export function fichaDeClinica(clinica: ClinicaPublica): FichaDeClinica {
  const municipio = texto(clinica.municipio)
  const departamento = texto(clinica.departamento)
  const lugar =
    municipio && departamento && claveDeDepartamento(municipio) !== claveDeDepartamento(departamento)
      ? `${municipio}, ${departamento}`
      : (municipio ?? departamento)

  const telefono = texto(clinica.telefono)
  const marcable = telefono?.replace(/[^\d+]/g, '') ?? ''

  return {
    titulo: clinica.name,
    lugar,
    direccion: texto(clinica.direccion) ?? DATO_NO_REGISTRADO,
    telefono: telefono ?? DATO_NO_REGISTRADO,
    enlaceTelefono: marcable ? `tel:${marcable}` : null,
    horario: texto(clinica.horario) ?? DATO_NO_REGISTRADO,
  }
}
