'use client'

// Registro de enfermería: la lista de trabajo del turno.
//
// ESTA PANTALLA ERA UNA MAQUETA COMPLETA. Se sembraba con `vitals` de
// `@/data/mockData` —siete constantes tomadas por «Enf. María López», que no
// existe— y «Guardar» solo hacía `setState`: lo que la enfermera escribía
// desaparecía al recargar, sin decírselo. Es el mismo defecto que el
// expediente del paciente ya corrigió, y aquí era peor, porque el formulario
// aparentaba ser el sitio donde se registran las constantes de verdad.
//
// Ahora todo sale de `/signos-vitales`:
//   · La tabla     → GET /signos-vitales (sin pacienteId: todas, lo último
//                    primero, que es lo que un turno necesita ver).
//   · El formulario → POST /signos-vitales, que solo acepta ENFERMERA y firma
//                    con quien va en el token.
//
// Un MÉDICO que llegue aquí por la URL puede LEER la tabla y recibirá 403 al
// guardar. Eso es deliberado y viene del dominio: quien toma las constantes no
// es quien diagnostica.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { sinTildes } from '@/lib/texto'
import { Modal } from '@/components/ui/Modal'
import { VitalsForm, type PacienteParaToma } from '@/components/forms/VitalsForm'
import { listarPacientes } from '@/services/pacientes'
import {
  listarTomas,
  nombreDeEnfermera,
  registrarToma,
  tensionArterial,
  type RegistrarSignosVitalesPayload,
  type SignosVitalesDto,
} from '@/services/signosVitales'
import { formatearFechaHora } from '@/services/consultas'
import { useAppContext } from '@/context/AppContext'

/**
 * Una medida ausente se pinta «—», nunca 0 ni una casilla en blanco.
 *
 * El cero mentiría —una saturación de 0 es una urgencia, no un hueco— y el
 * blanco se confunde con un fallo de la tabla. El guion dice «aquí no se
 * midió», que es la verdad.
 */
function medida(valor: number | string | null, unidad: string): React.ReactNode {
  if (valor === null) return <span className="text-slate-300">—</span>
  return (
    <span>
      {valor} <span className="text-slate-400">{unidad}</span>
    </span>
  )
}

export default function EnfermeriaPage() {
  const router = useRouter()
  const { user } = useAppContext()

  // Espeja el hasRole('ENFERMERA') del backend. Sin sesión legible se asume que
  // NO puede: es la suposición que no ofrece un formulario que el servidor va a
  // rechazar.
  const puedeRegistrar = user ? user.roles.includes('enfermera') : false

  const [tomas, setTomas] = useState<SignosVitalesDto[]>([])
  const [pacientes, setPacientes] = useState<PacienteParaToma[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [registrando, setRegistrando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorAlGuardar, setErrorAlGuardar] = useState<string | null>(null)


  // `allSettled` y no `all`: si el catálogo de pacientes falla, las tomas ya
  // traídas se siguen mostrando —leerlas es lo principal de esta pantalla— y
  // el aviso dice qué se quedó sin cargar.
  const cargar = useCallback(async () => {
    const [resTomas, resPacientes] = await Promise.allSettled([listarTomas(), listarPacientes()])

    const problemas: string[] = []

    if (resTomas.status === 'fulfilled') {
      setTomas(resTomas.value)
    } else {
      problemas.push(describir('No se pudieron cargar las tomas', resTomas.reason))
    }

    if (resPacientes.status === 'fulfilled') {
      setPacientes(
        resPacientes.value.map((p) => ({
          personaId: p.personaId,
          nombre: `${p.persona.nombres} ${p.persona.apellidos}`.trim(),
          expediente: p.expediente,
        })),
      )
    } else {
      problemas.push(describir('No se pudo cargar el catálogo de pacientes', resPacientes.reason))
    }

    setError(problemas.length > 0 ? problemas.join(' ') : null)
    setCargando(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga remota al montar; ver (portal)/consultas/page.tsx
    void cargar()
  }, [cargar])

  const reintentar = () => {
    setCargando(true)
    setError(null)
    void cargar()
  }

  const handleGuardar = async (payload: RegistrarSignosVitalesPayload) => {
    setGuardando(true)
    setErrorAlGuardar(null)
    try {
      const nueva = await registrarToma(payload)
      // La fila aparece solo cuando el servidor confirmó el 201, nunca antes:
      // en un expediente clínico una fila optimista es una constante que puede
      // no existir.
      setTomas((prev) => [nueva, ...prev])
      setRegistrando(false)
    } catch (err) {
      // El error se queda DENTRO del modal, con lo escrito intacto: cerrarlo
      // obligaría a volver a tomarle las constantes al paciente.
      setErrorAlGuardar(
        mensajeDe(
          err,
          'No se pudo registrar la toma. Solo el personal de enfermería puede registrarlas.',
        ),
      )
    } finally {
      setGuardando(false)
    }
  }

  const columns: Column<SignosVitalesDto>[] = useMemo(
    () => [
      {
        header: 'Fecha',
        cell: (t) => formatearFechaHora(t.tomadoEn),
        className: 'whitespace-nowrap text-slate-600',
      },
      {
        header: 'Paciente',
        cell: (t) => (
          <span className="font-medium text-slate-800 font-outfit">
            {t.paciente.nombres} {t.paciente.apellidos}
          </span>
        ),
      },
      {
        header: 'Enfermera',
        cell: (t) => nombreDeEnfermera(t),
        className: 'text-slate-600',
      },
      {
        header: 'Peso',
        cell: (t) => medida(t.pesoKg, 'kg'),
        className: 'font-mono text-xs text-slate-700 whitespace-nowrap',
      },
      {
        header: 'Talla',
        cell: (t) => medida(t.estaturaCm, 'cm'),
        className: 'font-mono text-xs text-slate-700 whitespace-nowrap',
      },
      {
        header: 'Temp.',
        cell: (t) => medida(t.temperaturaC, '°C'),
        className: 'font-mono text-xs text-slate-700 whitespace-nowrap',
      },
      {
        header: 'Presión',
        cell: (t) => medida(tensionArterial(t), 'mmHg'),
        className: 'font-mono text-xs text-slate-700 whitespace-nowrap',
      },
      {
        header: 'Pulso',
        cell: (t) => medida(t.pulsoLpm, 'lpm'),
        className: 'font-mono text-xs text-slate-700 whitespace-nowrap',
      },
      {
        header: 'Saturación',
        // Sin saturación NO se pinta una insignia: una vacía en verde o en
        // ámbar afirmaría algo sobre una medida que nadie tomó.
        cell: (t) =>
          t.saturacionPct === null ? (
            <span className="text-slate-300">—</span>
          ) : (
            <Badge color={t.saturacionPct >= 95 ? 'green' : 'yellow'}>{t.saturacionPct}%</Badge>
          ),
      },
      {
        header: 'Acciones',
        // Solo «Ver», que lleva a la pantalla de detalle. No hay editar ni
        // eliminar, y no es que falten: el backend no los expone a propósito.
        // Una constante mal tomada no se corrige reescribiéndola, se toma otra
        // vez y las dos quedan en el histórico con su hora.
        cell: (t) => (
          <button
            type="button"
            onClick={() => router.push(`/enfermeria/${t.signosVitalesId}`)}
            title="Ver el detalle de la toma"
            className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Icon name="eye" size={14} />
          </button>
        ),
      },
    ],
    [router],
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-outfit">Signos vitales</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Triage, toma y monitoreo de constantes vitales
          </p>
        </div>
        {/* Solo enfermería registra. Al médico y al administrador se les
            explica por qué no está el botón en vez de esconderlo sin más: un
            hueco sin motivo parece un fallo, y ofrecérselo sería mandarlos a un
            403 después de haber llenado el formulario. */}
        {puedeRegistrar ? (
          <button
            onClick={() => {
              setErrorAlGuardar(null)
              setRegistrando(true)
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold bg-doc-teal hover:opacity-90 shadow-sm transition-all cursor-pointer"
          >
            <Icon name="add" size={16} color="white" /> Registrar Signos Vitales
          </button>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 max-w-xs">
            Las constantes las registra enfermería. Aquí puede consultarlas.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={reintentar}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      <DataTable
        data={tomas}
        columns={columns}
        keyExtractor={(t) => t.signosVitalesId}
        // La fila entera lleva al detalle. El botón del ojo se queda
        // igualmente: es lo que hace descubrible que hay algo que ver, y quien
        // navega con teclado llega antes a él que a la fila.
        onRowClick={(t) => router.push(`/enfermeria/${t.signosVitalesId}`)}
        searchable
        searchPlaceholder="Buscar por paciente o enfermera..."
        searchFilter={(t, q) =>
          sinTildes(`${t.paciente.nombres} ${t.paciente.apellidos}`).includes(q) ||
          sinTildes(nombreDeEnfermera(t)).includes(q)
        }
        pageSize={10}
        emptyMessage={
          cargando ? 'Cargando tomas…' : 'Todavía no se ha registrado ninguna toma de constantes.'
        }
      />

      <Modal
        isOpen={registrando}
        onClose={() => setRegistrando(false)}
        title="Registrar Signos Vitales"
        subtitle="Constantes vitales del paciente"
        icon="enfermeria"
        headerGradient="bg-gradient-to-r from-doc-teal to-teal-700"
        maxWidth="lg"
      >
        <VitalsForm
          pacientes={pacientes}
          onSubmit={handleGuardar}
          onCancel={() => setRegistrando(false)}
          guardando={guardando}
          error={errorAlGuardar}
        />
      </Modal>

    </div>
  )
}

/** Conserva SIEMPRE el motivo del backend; el respaldo es para lo que no llega como `Error`. */
function mensajeDe(causa: unknown, respaldo: string): string {
  return causa instanceof Error && causa.message ? causa.message : respaldo
}

/** Igual que `mensajeDe`, anteponiendo QUÉ se estaba haciendo. */
function describir(contexto: string, causa: unknown): string {
  const motivo = causa instanceof Error && causa.message ? causa.message : null
  return motivo ? `${contexto}: ${motivo}` : `${contexto}.`
}
