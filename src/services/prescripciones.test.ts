// Guardas del servicio de prescripciones.
//
// La regla que más se protege aquí: UNA RECETA SIN MEDICAMENTOS NO ES UNA
// RECETA. La comprobación vive en el servicio y no solo en el formulario
// porque es del dominio; estas pruebas se ponen en rojo si alguien la mueve o
// la relaja, incluido el caso tramposo de «tres líneas en blanco», que a
// simple vista parecen tres medicamentos.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  buscarAlertasDeAlergia,
  crearPrescripcion,
  anularPrescripcion,
  datoQueFalta,
  imprimirPrescripcion,
  formatearFechaEmision,
  htmlDeRecetaParaImprimir,
  listarHistoricoDePrescripciones,
  listarPrescripcionesDeConsulta,
  listarPrescripcionesDePaciente,
  MENSAJE_RECETA_VACIA,
  nombreDeMedicoQueReceta,
  nombreDePacienteDeReceta,
  normalizarMedicamentos,
  obtenerPrescripcion,
  textoDeEnvioDeReceta,
  textoOpcional,
  type PaginaDto,
  type PrescripcionDto,
} from './prescripciones'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

function receta(cambios: Partial<PrescripcionDto> = {}): PrescripcionDto {
  return {
    prescripcionId: 11,
    fecha: '2026-08-23T15:00:00',
    consultaId: 7,
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', registroJunta: null },
    clinica: null,
    fechaConsulta: '2026-08-23T14:30:00',
    estado: 'EMITIDA',
    motivoAnulacion: null,
    anuladaEn: null,
    anuladaPor: null,
    medicamentos: [
      { id: 1, medicamento: 'Amoxicilina', dosis: '500 mg', viaAdministracion: 'Oral', frecuencia: 'cada 8 h', duracion: '7 días' },
    ],
    ...cambios,
  }
}

/**
 * Envuelve una lista en el sobre paginado que el backend usa SIEMPRE para
 * `/prescripciones`, tal como lo espera el servicio desde que dejó de
 * tratarlo como un arreglo plano.
 */
function pagina(contenido: PrescripcionDto[]): PaginaDto<PrescripcionDto> {
  return {
    contenido,
    paginaActual: 0,
    tamanoPagina: 20,
    totalElementos: contenido.length,
    totalPaginas: 1,
  }
}

async function errorDe(promesa: Promise<unknown>): Promise<Error> {
  try {
    await promesa
  } catch (e) {
    return e as Error
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió.')
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(receta())
})

describe('prescripciones · una receta sin medicamentos no es una receta', () => {
  it('rechaza la lista vacía sin llegar a llamar al backend', async () => {
    const error = await errorDe(crearPrescripcion({ consultaId: 7, medicamentos: [] }))

    expect(error.message).toBe(MENSAJE_RECETA_VACIA)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('tampoco cuela una lista de líneas en blanco', async () => {
    const error = await errorDe(
      crearPrescripcion({
        consultaId: 7,
        // Líneas sin medicamento elegido del catálogo, aunque una traiga dosis.
        medicamentos: [
          { medicamentoId: null },
          { medicamentoId: null, dosis: '500 mg' },
        ],
      }),
    )

    expect(error.message).toBe(MENSAJE_RECETA_VACIA)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('prescripciones · lo que viaja al backend', () => {
  it('manda exactamente el cuerpo del contrato', async () => {
    await crearPrescripcion({
      consultaId: 7,
      medicamentos: [
        {
          medicamentoId: 6,
          dosis: '500 mg',
          viaAdministracion: 'Oral',
          frecuencia: 'cada 8 h',
          duracion: '7 días',
        },
      ],
    })

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones', {
      method: 'POST',
      body: {
        consultaId: 7,
        medicamentos: [
          {
            // El id del catálogo, no un nombre: el nombre lo pone el backend.
            medicamentoId: 6,
            dosis: '500 mg',
            viaAdministracion: 'Oral',
            frecuencia: 'cada 8 h',
            duracion: '7 días',
          },
        ],
      },
    })
  })

  it('recorta los espacios de los cuatro datos del tratamiento', async () => {
    // HU-22 c2: los cuatro son obligatorios. Lo que quede en blanco viaja como
    // cadena vacía y el servidor responde 400 diciendo cuál falta; la pantalla
    // se adelanta con `datoQueFalta`.
    await crearPrescripcion({
      consultaId: 7,
      medicamentos: [
        {
          medicamentoId: 3,
          dosis: ' 1 tableta ',
          viaAdministracion: ' Oral',
          frecuencia: 'cada 12 h ',
          duracion: '  ',
        },
      ],
    })

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones', {
      method: 'POST',
      body: {
        consultaId: 7,
        medicamentos: [
          {
            medicamentoId: 3,
            dosis: '1 tableta',
            viaAdministracion: 'Oral',
            frecuencia: 'cada 12 h',
            duracion: '',
          },
        ],
      },
    })
  })

  it('dice qué dato del tratamiento falta, en el orden en que se piden', () => {
    const completa = {
      medicamentoId: 3,
      dosis: '1 tableta',
      viaAdministracion: 'Oral',
      frecuencia: 'cada 8 h',
      duracion: '7 días',
    }
    expect(datoQueFalta(completa)).toBeNull()
    expect(datoQueFalta({ ...completa, dosis: '' })).toBe('la dosis')
    expect(datoQueFalta({ ...completa, viaAdministracion: '' })).toBe('la vía de administración')
    expect(datoQueFalta({ ...completa, frecuencia: '' })).toBe('la frecuencia')
    expect(datoQueFalta({ ...completa, duracion: '' })).toBe('la duración del tratamiento')
  })

  it('descarta las líneas sin medicamento y conserva las útiles', () => {
    expect(
      normalizarMedicamentos([
        { medicamentoId: 6, dosis: '500 mg', viaAdministracion: 'Oral', frecuencia: 'c/8h', duracion: '5 d' },
        { medicamentoId: null },
        { medicamentoId: 3 },
      ]),
    ).toEqual([
      { medicamentoId: 6, dosis: '500 mg', viaAdministracion: 'Oral', frecuencia: 'c/8h', duracion: '5 d' },
      { medicamentoId: 3, dosis: '', viaAdministracion: '', frecuencia: '', duracion: '' },
    ])
  })

  it('consulta las recetas por consulta y por paciente con su parámetro', async () => {
    apiFetch.mockResolvedValue(pagina([]))

    await listarPrescripcionesDeConsulta(7)
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones?consultaId=7')

    await listarPrescripcionesDePaciente(42)
    expect(apiFetch).toHaveBeenLastCalledWith('/prescripciones?pacienteId=42')
  })

  // El fallo real que motiva este bloque: el backend SIEMPRE envuelve
  // /prescripciones en un sobre paginado, y estas dos funciones prometen
  // devolver un arreglo plano a quien las llama (el expediente del paciente,
  // entre otros). Una prueba que solo mira la URL pedida —como la de
  // arriba— no detecta que alguien vuelva a tratar el sobre como si fuera el
  // arreglo: hay que comprobar el VALOR que devuelven contra un sobre real,
  // con contenido de verdad, no un `pagina([])` vacío que pasaría igual
  // devolviendo el objeto entero por error.
  it('desenvuelve el sobre paginado y devuelve el arreglo de adentro, no el sobre', async () => {
    const recetaDeLaConsulta = receta({ prescripcionId: 20 })
    apiFetch.mockResolvedValue({
      contenido: [recetaDeLaConsulta],
      paginaActual: 0,
      tamanoPagina: 20,
      totalElementos: 1,
      totalPaginas: 1,
    })

    const deLaConsulta = await listarPrescripcionesDeConsulta(7)
    expect(deLaConsulta).toEqual([recetaDeLaConsulta])
    // Si algún día volviera a tratarse la respuesta como el arreglo directo,
    // esto devolvería el sobre entero (con `contenido`/`totalElementos`...),
    // no un arreglo de recetas: `Array.isArray` lo distingue sin ambigüedad.
    expect(Array.isArray(deLaConsulta)).toBe(true)

    const recetaDelPaciente = receta({ prescripcionId: 21 })
    apiFetch.mockResolvedValue({
      contenido: [recetaDelPaciente],
      paginaActual: 0,
      tamanoPagina: 20,
      totalElementos: 1,
      totalPaginas: 1,
    })

    const delPaciente = await listarPrescripcionesDePaciente(42)
    expect(delPaciente).toEqual([recetaDelPaciente])
    expect(Array.isArray(delPaciente)).toBe(true)
  })

  it('anula con POST sobre /anular, mandando el motivo recortado (HU-22 c3)', async () => {
    const anulada = receta({ estado: 'ANULADA', motivoAnulacion: 'Dosis mal capturada' })
    apiFetch.mockResolvedValue(anulada)

    const resultado = await anularPrescripcion(11, '  Dosis mal capturada ')

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones/11/anular', {
      method: 'POST',
      body: { motivo: 'Dosis mal capturada' },
    })
    // Devuelve la receta anulada: sigue existiendo, ya no se borra.
    expect(resultado.estado).toBe('ANULADA')
  })

  it('imprime pidiendo el PDF con el token y ofreciéndolo como descarga (HU-22 c4)', async () => {
    apiFetch.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    const crearUrl = vi.fn(() => 'blob:receta-11')
    const revocarUrl = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: revocarUrl }))
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await imprimirPrescripcion(11)

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones/11/pdf', { formato: 'blob' })
    expect(crearUrl).toHaveBeenCalledTimes(1)
    expect(clic).toHaveBeenCalledTimes(1)
    clic.mockRestore()
    vi.unstubAllGlobals()
  })
})

describe('prescripciones · histórico con filtros combinables', () => {
  beforeEach(() => {
    apiFetch.mockResolvedValue(pagina([]))
  })

  it('sin ningún filtro, pide el histórico completo sin query string', async () => {
    await listarHistoricoDePrescripciones()
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones')

    apiFetch.mockClear()
    await listarHistoricoDePrescripciones({})
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones')
  })

  it('filtra por pacienteId solo', async () => {
    await listarHistoricoDePrescripciones({ pacienteId: 42 })
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones?pacienteId=42')
  })

  it('filtra por medicoId solo', async () => {
    await listarHistoricoDePrescripciones({ medicoId: 3 })
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones?medicoId=3')
  })

  it('filtra por desde solo', async () => {
    await listarHistoricoDePrescripciones({ desde: '2026-01-01' })
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones?desde=2026-01-01')
  })

  it('filtra por hasta solo', async () => {
    await listarHistoricoDePrescripciones({ hasta: '2026-12-31' })
    expect(apiFetch).toHaveBeenCalledWith('/prescripciones?hasta=2026-12-31')
  })

  it('combina los cuatro filtros a la vez en una sola llamada', async () => {
    await listarHistoricoDePrescripciones({
      pacienteId: 42,
      medicoId: 3,
      desde: '2026-01-01',
      hasta: '2026-12-31',
    })
    expect(apiFetch).toHaveBeenCalledWith(
      '/prescripciones?pacienteId=42&medicoId=3&desde=2026-01-01&hasta=2026-12-31',
    )
  })

  it('arma el nombre completo del paciente de la receta', () => {
    expect(nombreDePacienteDeReceta(receta())).toBe('Ana María Ramírez')
  })

  // A diferencia de listarPrescripcionesDeConsulta/DePaciente, esta función
  // NO desenvuelve: la pantalla de histórico necesita totalElementos y
  // totalPaginas para saber si hay más que cargar. Si alguien la cambiara
  // para devolver solo `.contenido` "por consistencia" con las otras dos,
  // el botón «Cargar más» y el contador dejarían de tener con qué decidir
  // si hay más páginas — esta prueba lo detecta comprobando que el sobre
  // COMPLETO llega intacto hasta quien llamó, no solo el arreglo.
  it('devuelve el sobre paginado completo, sin desenvolverlo', async () => {
    const sobreReal = {
      contenido: [receta()],
      paginaActual: 2,
      tamanoPagina: 20,
      totalElementos: 57,
      totalPaginas: 3,
    }
    apiFetch.mockResolvedValue(sobreReal)

    const resultado = await listarHistoricoDePrescripciones({ pagina: 2 })

    expect(resultado).toEqual(sobreReal)
  })
})

describe('prescripciones · campos opcionales al mostrarlos', () => {
  it('pinta un guion donde el backend mandó null', () => {
    // Sin esto la receta que alguien lleva a la farmacia diría «null».
    expect(textoOpcional(null)).toBe('—')
    expect(textoOpcional('   ')).toBe('—')
    expect(textoOpcional('500 mg')).toBe('500 mg')
  })

  it('arma el nombre del médico que firma y la fecha de emisión', () => {
    expect(nombreDeMedicoQueReceta(receta())).toBe('Juan Guerra')
    expect(formatearFechaEmision(receta({ fecha: '2026-08-23' }))).toContain('23')
  })
})

describe('prescripciones · traducción de errores', () => {
  it('al emitir, el 404 habla de la consulta y no de la receta', async () => {
    // La receta todavía no existe: decir «esta receta ya no existe» sería
    // falso y mandaría a buscar algo que nunca se creó.
    apiFetch.mockRejectedValue(new ApiError(404, 'Recurso no encontrado'))

    const error = await errorDe(
      crearPrescripcion({ consultaId: 7, medicamentos: [{ medicamentoId: 6 }] }),
    )

    expect(error.message).toContain('consulta')
    expect(error.message).toContain('no se emitió')
    expect(error.message).not.toContain('Esta receta ya no existe')
  })

  it('al anular o abrir, el 404 sí habla de la receta', async () => {
    apiFetch.mockRejectedValue(new ApiError(404, 'Recurso no encontrado'))

    expect((await errorDe(obtenerPrescripcion(11))).message).toBe(
      'Esta receta ya no existe; puede que alguien la haya anulado.',
    )
    expect((await errorDe(anularPrescripcion(11, 'Motivo de prueba'))).message).toBe(
      'Esta receta ya no existe; puede que alguien la haya anulado.',
    )
  })

  it('deja pasar el motivo concreto del backend en los demás códigos', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(403, 'Solo el médico que atendió la consulta puede recetar'),
    )

    const error = await errorDe(
      crearPrescripcion({ consultaId: 7, medicamentos: [{ medicamentoId: 6 }] }),
    )

    expect(error.message).toBe('Solo el médico que atendió la consulta puede recetar')
  })
})

describe('buscarAlertasDeAlergia · HU-24', () => {
  it('pide las alertas del paciente y el medicamento y devuelve la lista tal cual', async () => {
    const alertas = [
      {
        alergiaId: 4,
        sustancia: 'Penicilina',
        severidad: 'SEVERA',
        reaccion: 'Anafilaxia',
        medicamentoId: 6,
        medicamento: 'Penicilina V 500 mg',
      },
    ]
    apiFetch.mockResolvedValue(alertas)

    await expect(buscarAlertasDeAlergia(42, 6)).resolves.toEqual(alertas)
    expect(apiFetch).toHaveBeenCalledWith(
      '/prescripciones/alertas-de-alergia?pacienteId=42&medicamentoId=6',
    )
  })

  it('una lista vacía es «sin alergias coincidentes», no un error', async () => {
    apiFetch.mockResolvedValue([])
    await expect(buscarAlertasDeAlergia(42, 6)).resolves.toEqual([])
  })

  it('traduce el 404 y deja pasar el resto de los errores', async () => {
    apiFetch.mockRejectedValueOnce(new ApiError(404, 'Paciente no encontrado'))
    await expect(buscarAlertasDeAlergia(42, 6)).rejects.toThrow(/ya no existen/i)

    apiFetch.mockRejectedValueOnce(new ApiError(500, 'Error interno'))
    await expect(buscarAlertasDeAlergia(42, 6)).rejects.toThrow('Error interno')
  })
})

describe('crearPrescripcion · HU-24 justificación de alergia', () => {
  // Desde HU-22 c2 cada renglón lleva los cuatro datos del tratamiento.
  const linea = {
    medicamentoId: 6,
    dosis: '500 mg',
    viaAdministracion: 'Oral',
    frecuencia: 'Cada 8 horas',
    duracion: '7 días',
  }
  const lineas = [linea]

  it('manda la justificación recortada y la confirmación solo cuando hay algo que decir', async () => {
    await crearPrescripcion({
      consultaId: 7,
      medicamentos: lineas,
      justificacionAlergia: '  Beneficio mayor al riesgo  ',
      confirmaAlergiaSevera: true,
    })

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones', {
      method: 'POST',
      body: {
        consultaId: 7,
        medicamentos: [linea],
        justificacionAlergia: 'Beneficio mayor al riesgo',
        confirmaAlergiaSevera: true,
      },
    })
  })

  it('omite la justificación en blanco y la confirmación en falso', async () => {
    await crearPrescripcion({
      consultaId: 7,
      medicamentos: lineas,
      justificacionAlergia: '   ',
      confirmaAlergiaSevera: false,
    })

    expect(apiFetch).toHaveBeenCalledWith('/prescripciones', {
      method: 'POST',
      body: { consultaId: 7, medicamentos: [linea] },
    })
  })
})

describe('HU-25 · envío de la receta por correo', () => {
  it('dice en una frase cómo fue el último envío', () => {
    expect(textoDeEnvioDeReceta('PENDIENTE')).toMatch(/pendiente/i)
    expect(textoDeEnvioDeReceta('ENVIADO')).toMatch(/enviada/i)
    expect(textoDeEnvioDeReceta('FALLIDO')).toMatch(/falló/i)
    expect(textoDeEnvioDeReceta('SIN_CORREO')).toMatch(/no tiene correo/i)
    expect(textoDeEnvioDeReceta(null)).toBeNull()
    expect(textoDeEnvioDeReceta(undefined)).toBeNull()
  })

  it('la receta para imprimir lleva paciente, médico y medicamentos, y escapa el HTML', () => {
    const html = htmlDeRecetaParaImprimir(
      receta({
        medicamentos: [
          { id: 1, medicamento: 'Amoxicilina <b>', dosis: null, frecuencia: 'cada 8 h', duracion: null },
        ],
      }),
      '23 ago 2026, 15:00',
    )

    expect(html).toContain('Ana María Ramírez')
    expect(html).toContain('Juan Guerra')
    expect(html).toContain('23 ago 2026, 15:00')
    expect(html).toContain('Amoxicilina &lt;b&gt;')
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('null')
  })
})
