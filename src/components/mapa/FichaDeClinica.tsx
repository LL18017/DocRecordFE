// ─── Ficha de una clínica de la red (HU-28, criterio 2) ──────────────────────
// Lo que se lee al tocar un marcador: nombre, dirección, teléfono y horario.
//
// Es un componente aparte, sin nada de Leaflet, por dos razones. La misma ficha
// se usa dentro del globo del mapa y en la lista de clínicas sin ubicación —un
// paciente necesita lo mismo de las dos—, y así no hay dos redacciones que
// diverjan. Y se puede probar en jsdom sin montar el mapa.

import { fichaDeClinica, type ClinicaPublica } from '@/lib/mapaDeLaRed'

export function FichaDeClinica({
  clinica,
  nivelDeTitulo = 3,
}: {
  clinica: ClinicaPublica
  /** El globo vive suelto en el mapa; la lista ya está bajo un `h2`. */
  nivelDeTitulo?: 2 | 3
}) {
  const ficha = fichaDeClinica(clinica)
  const Titulo = nivelDeTitulo === 2 ? 'h2' : 'h3'

  return (
    // `break-words`: una dirección larga sin espacios (un correo, una URL) no
    // puede ensanchar el globo más allá de la pantalla del teléfono.
    <div className="min-w-0 break-words text-sm leading-snug text-slate-700">
      <Titulo className="font-outfit text-base font-semibold text-slate-800">{ficha.titulo}</Titulo>
      {ficha.lugar && <p className="text-xs text-slate-500">{ficha.lugar}</p>}

      <dl className="mt-2 space-y-1.5">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dirección</dt>
          <dd>{ficha.direccion}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Teléfono</dt>
          <dd>
            {ficha.enlaceTelefono ? (
              <a href={ficha.enlaceTelefono} className="font-medium text-doc-blue hover:underline">
                {ficha.telefono}
              </a>
            ) : (
              ficha.telefono
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Horario</dt>
          <dd>{ficha.horario}</dd>
        </div>
      </dl>
    </div>
  )
}
