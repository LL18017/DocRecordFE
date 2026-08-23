// Guardas del servicio de consultas.
//
// Tres cosas se protegen aquí, y cada una corresponde a un error que este
// proyecto ya cometió o que el contrato advierte de forma explícita:
//
//  1. Que lo que se manda al backend sea EXACTAMENTE el contrato: ni un campo
//     inventado, ni `clinicaId: null` donde el contrato dice «opcional».
//  2. Que los nulos declarados (clinica, diagnostico, especialidad) se puedan
//     manejar sin reventar la pantalla.
//  3. Que la traducción de errores solo sustituya al backend cuando gana
//     precisión; taparlo con una frase fija ya dejó mensajes que mentían.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import {
  actualizarConsulta,
  crearConsulta,
  eliminarConsulta,
  formatearFechaHora,
  listarConsultas,
  nombreDeClinica,
  nombreDeMedico,
  nombreDePaciente,
  obtenerConsulta,
  puedeRegistrarDiagnostico,
  textoOpcional,
  type ConsultaDto,
} from './consultas'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/lib/api')>()
  return { ...real, apiFetch }
})

/** Consulta como la devuelve el backend, con los nulos del contrato puestos. */
function consulta(cambios: Partial<ConsultaDto> = {}): ConsultaDto {
  return {
    consultaId: 7,
    fecha: '2026-08-23T14:30:00',
    motivo: 'Dolor de garganta',
    diagnostico: 'Faringitis aguda',
    estado: 'FINALIZADA',
    paciente: { personaId: 42, expediente: 'EXP-0042', nombres: 'Ana María', apellidos: 'Ramírez' },
    medico: { personaId: 3, nombres: 'Juan', apellidos: 'Guerra', especialidad: 'Medicina General' },
    clinica: { clinicaId: 5, name: 'Clínica Escalón' },
    ...cambios,
  }
}

/** Espera el rechazo y devuelve el error. Falla si la promesa se resuelve. */
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
  apiFetch.mockResolvedValue(consulta())
})

describe('consultas · lo que viaja al backend', () => {
  it('crea con el cuerpo del contrato, sin agregar campos', async () => {
    await crearConsulta({ pacienteId: 42, clinicaId: 5, motivo: 'Dolor de garganta' })

    expect(apiFetch).toHaveBeenCalledWith('/consultas', {
      method: 'POST',
      body: { pacienteId: 42, clinicaId: 5, motivo: 'Dolor de garganta' },
    })
  })

  it('filtra por paciente en la lista y no manda el parámetro si no hay filtro', async () => {
    apiFetch.mockResolvedValue([])

    await listarConsultas(42)
    expect(apiFetch).toHaveBeenCalledWith('/consultas?pacienteId=42')

    await listarConsultas()
    expect(apiFetch).toHaveBeenLastCalledWith('/consultas')
  })

  it('actualiza solo con lo recibido: el campo ausente es «no lo toco»', async () => {
    await actualizarConsulta(7, { diagnostico: 'Faringitis aguda' })

    expect(apiFetch).toHaveBeenCalledWith('/consultas/7', {
      method: 'PUT',
      body: { diagnostico: 'Faringitis aguda' },
    })
  })

  it('elimina con DELETE sobre el id', async () => {
    apiFetch.mockResolvedValue(undefined)

    await eliminarConsulta(7)

    expect(apiFetch).toHaveBeenCalledWith('/consultas/7', { method: 'DELETE' })
  })
})

describe('consultas · el diagnóstico es exclusivo del médico', () => {
  it('no deja diagnosticar a una enfermera', () => {
    expect(puedeRegistrarDiagnostico('enfermera')).toBe(false)
  })

  it('deja diagnosticar al médico', () => {
    expect(puedeRegistrarDiagnostico('medico')).toBe(true)
  })

  it('no se lo quita a un médico cuya cuenta además es administradora', () => {
    // `mapearRol` devuelve 'Administrador' en cuanto la cuenta tiene
    // ROLE_ADMIN, aunque también tenga ROLE_MEDICO: es el caso de la cuenta de
    // prueba del proyecto. Comprobar `=== 'medico'` le habría escondido el
    // campo a un médico real por un detalle del mapeo de roles.
    expect(puedeRegistrarDiagnostico('Administrador')).toBe(true)
  })
})

describe('consultas · campos que pueden venir nulos', () => {
  it('devuelve null como nombre de clínica cuando la consulta no tiene sede', () => {
    // El contrato lo dice en mayúsculas: `clinica` PUEDE SER NULL. Leer
    // `consulta.clinica.name` aquí es el fallo que ya tumbó una pantalla.
    expect(nombreDeClinica(consulta({ clinica: null }))).toBeNull()
  })

  it('devuelve el nombre cuando sí hay sede', () => {
    expect(nombreDeClinica(consulta())).toBe('Clínica Escalón')
  })

  it('arma los nombres completos de paciente y médico', () => {
    expect(nombreDePaciente(consulta())).toBe('Ana María Ramírez')
    expect(nombreDeMedico(consulta())).toBe('Juan Guerra')
  })

  it('pinta un guion —y nunca «null»— en el texto de un campo opcional', () => {
    // `textoOpcional` es la única respuesta de este proyecto a «este campo
    // puede faltar»: motivo, diagnóstico, dosis, frecuencia y duración pasan
    // todos por aquí. Los espacios cuentan como ausencia: el backend no
    // distingue `''` de `'   '` y una tabla alineada sí.
    expect(textoOpcional(null)).toBe('—')
    expect(textoOpcional('')).toBe('—')
    expect(textoOpcional('   ')).toBe('—')
    expect(textoOpcional('Dolor de garganta')).toBe('Dolor de garganta')
  })

  it('prescripciones reexporta ESTA función, no una copia suya', async () => {
    // La ayuda vivía en services/prescripciones.ts y se mudó aquí al aparecer
    // `motivo`. Si alguien vuelve a escribir una segunda implementación allá,
    // las dos empiezan iguales y acaban decidiendo distinto —una con `trim`,
    // otra sin él— y el guion deja de ser el mismo guion en toda la app.
    const prescripciones = await import('./prescripciones')
    expect(prescripciones.textoOpcional).toBe(textoOpcional)
  })
})

describe('consultas · fechas', () => {
  it('muestra el instante de la consulta con su hora local', () => {
    const texto = formatearFechaHora('2026-08-23T14:30:00')

    // El día es lo que no puede fallar; el formato de la hora depende de la
    // implementación de Intl y no es lo que esta prueba defiende.
    expect(texto).toContain('23')
    expect(texto).toMatch(/ago/i)
    expect(texto).toMatch(/2026/)
    expect(texto).toMatch(/2:30|14:30/)
  })

  it('no retrocede un día con una fecha civil (el fallo de UTC-6)', () => {
    // `new Date('2026-08-23')` es medianoche UTC, que en El Salvador es el 22
    // por la noche: al pintarla salía «22 ago». Esta prueba se pone en rojo si
    // alguien vuelve a formatear con `new Date` a secas, y con
    // TZ=America/El_Salvador es donde de verdad muerde.
    const texto = formatearFechaHora('2026-08-23')

    expect(texto).toContain('23')
    expect(texto).not.toContain('22')
  })

  it('devuelve la cadena tal cual si no es una fecha usable', () => {
    expect(formatearFechaHora('sin fecha')).toBe('sin fecha')
  })
})

describe('consultas · traducción de errores', () => {
  it('explica el 404 con lo que probablemente pasó', async () => {
    apiFetch.mockRejectedValue(new ApiError(404, 'Recurso no encontrado'))

    const error = await errorDe(obtenerConsulta(7))

    expect(error.message).toBe(
      'Esta consulta ya no existe; puede que alguien la haya eliminado.',
    )
  })

  it('traduce el 409 al eliminar, donde el backend manda la restricción en crudo', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(409, 'could not execute statement; constraint [fk_prescripciones_consulta]'),
    )

    const error = await errorDe(eliminarConsulta(7))

    expect(error.message).toBe(
      'No se puede eliminar la consulta porque tiene prescripciones u otra información asociada.',
    )
  })

  it('no habla de eliminar mientras se registra o se edita', async () => {
    apiFetch.mockRejectedValue(new ApiError(409, 'Ya existe una consulta abierta para hoy.'))

    const error = await errorDe(crearConsulta({ pacienteId: 42, motivo: 'Control' }))

    expect(error.message).toBe('Ya existe una consulta abierta para hoy.')
  })

  it('deja pasar el 400 con el campo que el backend señala', async () => {
    // `lib/api.ts` ya redacta las validaciones de Spring («El motivo es
    // obligatorio.»). Sustituirlo por una frase fija le quita al usuario el
    // único dato que le servía.
    apiFetch.mockRejectedValue(new ApiError(400, 'El motivo es obligatorio.'))

    const error = await errorDe(crearConsulta({ pacienteId: 42, motivo: '' }))

    expect(error.message).toBe('El motivo es obligatorio.')
  })

  it('deja pasar entero el 403 del diagnóstico reservado al médico', async () => {
    apiFetch.mockRejectedValue(
      new ApiError(403, 'El diagnóstico solo puede registrarlo el médico responsable'),
    )

    const error = await errorDe(actualizarConsulta(7, { diagnostico: 'Faringitis' }))

    expect(error.message).toBe('El diagnóstico solo puede registrarlo el médico responsable')
    expect((error as ApiError).status).toBe(403)
  })
})
