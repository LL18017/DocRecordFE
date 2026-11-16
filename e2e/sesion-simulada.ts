// Sesión y API simuladas para las pruebas e2e que solo miran la interfaz.
//
// ── Para qué sirve ──────────────────────────────────────────────────────────
// Las pruebas de HU-35 (responsive y accesible) comprueban cómo PINTA el
// frontend desplegado: si la página se desplaza a lo ancho, si el texto tiene
// contraste, si cada campo tiene etiqueta, si se llega a todo con el teclado.
// Nada de eso depende de qué responda el backend, solo de que responda algo
// con la forma correcta. Por eso aquí se hace lo que haría un login real
// —dejar la sesión en `sessionStorage`— y se contesta cada petición a la API
// desde el propio navegador con datos de ejemplo.
//
// Así esas pruebas corren sin credenciales (el repositorio es público y no hay
// dónde guardarlas sin filtrarlas) y sin escribir nada en la base de producción.
//
// ── Qué NO prueba ──────────────────────────────────────────────────────────
// La lógica del backend: permisos, validaciones, qué devuelve cada consulta.
// Eso lo cubren las pruebas de integración de DocRecordBE y, con sesión real,
// `acceso-por-rol.spec.ts`. Si los DTOs del backend cambian, estos datos
// quedarían viejos sin que ninguna prueba de aquí lo note: se escribieron
// copiando las interfaces de `src/services/*.ts`, que son el contrato.
//
// ── Ninguna petición sale a la API real ────────────────────────────────────
// Toda URL que parezca de la API se responde aquí; la que no esté contemplada
// recibe un vacío y queda anotada en `noContempladas` para verla en el reporte.
// Cada respuesta lleva la cabecera `x-docrecord-simulado`; `alBackendReal`
// cuenta las que llegaron sin ella, y la prueba exige que sean cero.
import type { Page, Request, Route } from '@playwright/test'

export type RolSimulado = 'medico' | 'Administrador' | 'enfermera'

const CABECERA_SIMULADO = 'x-docrecord-simulado'

/** Correo de la cuenta simulada por rol. Dominio `.test`: no puede existir. */
const CORREO: Record<RolSimulado, string> = {
  medico: 'medico.simulado@docrecord.test',
  Administrador: 'admin.simulado@docrecord.test',
  enfermera: 'enfermera.simulada@docrecord.test',
}

/** La sede activa que elegiría el usuario en /select-clinica. */
const CLINICA_ACTIVA = { id: 1, name: 'Clínica Comunal San Miguelito de la Zona Metropolitana', lat: 13.6989, lng: -89.1914 }

function base64url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Un JWT bien formado pero de mentira: el frontend no lo decodifica hoy, pero
 * si algún día lee el payload (por ejemplo, para saber cuándo vence) seguirá
 * encontrando `sub`, `roles` y un `exp` futuro en vez de reventar. La firma no
 * vale nada: ningún servidor lo aceptaría, y no tiene por qué, nunca sale.
 */
function jwtDePrueba(rol: RolSimulado): string {
  const cabecera = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const ahora = Math.floor(Date.now() / 1000)
  const cuerpo = base64url(JSON.stringify({ sub: CORREO[rol], roles: [rol], iat: ahora, exp: ahora + 8 * 3600 }))
  return `${cabecera}.${cuerpo}.${base64url('firma-de-prueba-sin-valor')}`
}

/**
 * Deja la sesión tal como la deja el login real seguido de /select-clinica:
 * `docrecord.token` y `docrecord.refreshToken` (lib/api.ts), `docrecord.user`
 * con `roles` en arreglo (AppContext rechaza la forma vieja con `role`) y
 * `docrecord.clinica` con el correo del dueño, que AppContext compara antes de
 * dar la sede por activa.
 *
 * Con `addInitScript` corre antes que cualquier script de la página, en cada
 * navegación: el portal ya encuentra la sesión al hidratarse y no redirige a
 * /login.
 */
export async function simularSesion(page: Page, rol: RolSimulado) {
  const sesion = {
    token: jwtDePrueba(rol),
    refreshToken: jwtDePrueba(rol),
    usuario: { name: CORREO[rol], email: CORREO[rol], roles: [rol] },
    clinica: { medico: CORREO[rol], clinica: CLINICA_ACTIVA },
  }
  await page.addInitScript((s) => {
    try {
      window.sessionStorage.setItem('docrecord.token', s.token)
      window.sessionStorage.setItem('docrecord.refreshToken', s.refreshToken)
      window.sessionStorage.setItem('docrecord.user', JSON.stringify(s.usuario))
      window.sessionStorage.setItem('docrecord.clinica', JSON.stringify(s.clinica))
    } catch {
      // about:blank y similares no tienen almacenamiento; la siguiente
      // navegación vuelve a ejecutar este guion.
    }
  }, sesion)
}

// ─── Datos de ejemplo ────────────────────────────────────────────────────────
// Con nombres largos a propósito: lo que rompe un diseño en un teléfono es el
// apellido compuesto de 40 caracteres, no «Ana Paz».

function dia(desplazamiento: number, hora = 9, minuto = 0): string {
  const d = new Date()
  d.setHours(hora, minuto, 0, 0)
  d.setDate(d.getDate() + desplazamiento)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
}

/** Lunes de esta semana, como desplazamiento en días desde hoy. */
function lunes(): number {
  const hoy = new Date().getDay() // 0 domingo
  return hoy === 0 ? -6 : 1 - hoy
}

const PERSONAS = [
  { nombres: 'María Fernanda de los Ángeles', apellidos: 'Hernández Castellanos de Villalobos', sexo: 'F', dui: '01234567-8' },
  { nombres: 'José Roberto', apellidos: 'Hernández Martínez', sexo: 'M', dui: '02345678-9' },
  { nombres: 'Ana Gabriela', apellidos: 'López Quintanilla', sexo: 'F', dui: '03456789-0' },
  { nombres: 'Carlos Ernesto', apellidos: 'Ramírez Portillo', sexo: 'M', dui: '04567890-1' },
  { nombres: 'Sofía Alejandra', apellidos: 'Martínez Rivas', sexo: 'F', dui: null },
  { nombres: 'Juan Francisco Antonio', apellidos: 'Guevara Menjívar Orellana', sexo: 'M', dui: '05678901-2' },
  { nombres: 'Rosa Elena', apellidos: 'Flores Argueta', sexo: 'F', dui: '06789012-3' },
  { nombres: 'Luis Alberto', apellidos: 'Sánchez Hernández', sexo: 'M', dui: '07890123-4' },
] as const

export const PACIENTES = PERSONAS.map((p, i) => {
  const personaId = 101 + i
  return {
    personaId,
    expediente: `EXP-2026-${String(personaId).padStart(5, '0')}`,
    tipoSangre: ['O+', 'A+', 'B-', 'AB+', 'O-', 'A-', 'B+', 'O+'][i],
    creadoEn: dia(-60 + i, 10),
    estado: 'ACTIVO' as const,
    persona: {
      personaId,
      dui: p.dui,
      nombres: p.nombres,
      apellidos: p.apellidos,
      fechaNacimiento: `${1950 + i * 7}-0${(i % 9) + 1}-1${i % 9}`,
      sexo: p.sexo,
      telefono: `7${i}12-34${i}${i}`,
      direccion: 'Colonia Escalón, Pasaje Los Almendros, casa 23-B, San Salvador Centro, San Salvador',
      email: i % 2 === 0 ? `paciente${personaId}@correo.test` : null,
    },
    registradoPor: CORREO.medico,
    clinicaRegistroId: CLINICA_ACTIVA.id,
    clinicaRegistro: CLINICA_ACTIVA.name,
    modificadoPor: null,
    modificadoEn: null,
  }
})

const MEDICO = { personaId: 900, nombres: 'Ricardo Antonio', apellidos: 'Villalta Sorto', especialidad: 'Medicina General' }

export const CONSULTAS = PACIENTES.slice(0, 6).map((p, i) => ({
  consultaId: 501 + i,
  fecha: dia(-i, 8 + i),
  motivo: 'Dolor abdominal persistente de tres días de evolución acompañado de náuseas y fiebre',
  diagnostico: i % 2 === 0 ? 'Gastroenteritis aguda de probable origen viral' : 'Hipertensión arterial esencial',
  exploracionFisica: 'Abdomen blando, depresible, doloroso a la palpación en epigastrio',
  indicaciones: 'Hidratación oral abundante, dieta blanda, control en una semana',
  estado: (['FINALIZADA', 'PENDIENTE', 'FINALIZADA', 'ANULADA', 'FINALIZADA', 'PENDIENTE'] as const)[i],
  paciente: { personaId: p.personaId, expediente: p.expediente, nombres: p.persona.nombres, apellidos: p.persona.apellidos },
  medico: MEDICO,
  clinica: { clinicaId: CLINICA_ACTIVA.id, name: CLINICA_ACTIVA.name },
  registradaEn: dia(-i, 8 + i),
  motivoAnulacion: i === 3 ? 'Registrada en el expediente equivocado' : null,
  anuladaEn: i === 3 ? dia(-i, 12) : null,
  anuladaPor: i === 3 ? CORREO.medico : null,
  citaId: null,
}))

function citasDeLaSemana() {
  const l = lunes()
  const estados = ['ATENDIDA', 'AGENDADA', 'NO_ASISTIO', 'AGENDADA', 'CANCELADA', 'AGENDADA', 'AGENDADA', 'AGENDADA'] as const
  return PACIENTES.map((p, i) => ({
    citaId: 701 + i,
    fechaHora: dia(l + (i % 5), 8 + (i % 4), i % 2 ? 30 : 0),
    tipoCitaId: (i % 2) + 1,
    tipoCita: i % 2 ? 'Control de enfermedad crónica' : 'Consulta general',
    pacienteId: p.personaId,
    paciente: `${p.persona.nombres} ${p.persona.apellidos}`,
    expediente: p.expediente,
    medicoId: MEDICO.personaId,
    medico: `${MEDICO.nombres} ${MEDICO.apellidos}`,
    clinicaId: CLINICA_ACTIVA.id,
    clinica: CLINICA_ACTIVA.name,
    estado: estados[i],
    motivoCancelacion: estados[i] === 'CANCELADA' ? 'El paciente pidió reprogramar' : null,
    motivo: 'Seguimiento de tratamiento',
  }))
}

export const CLINICAS = [
  CLINICA_ACTIVA,
  { id: 2, name: 'Unidad de Salud Dr. Juan Ramón Alvarenga, Soyapango', lat: 13.71, lng: -89.14 },
].map((c) => ({
  clinicaId: c.id,
  name: c.name,
  latitud: c.lat,
  longitud: c.lng,
  departamento: 'San Salvador',
  municipio: 'San Salvador Centro',
  direccion: 'Avenida Masferrer Norte, número 1245, Colonia Escalón',
  telefono: '2222-3333',
  horario: 'Lunes a viernes de 7:00 a 16:00',
  estado: 'ACTIVA' as const,
}))

export const USUARIOS = [
  { email: CORREO.Administrador, roles: [{ id: 1, name: 'ADMIN' }], nombres: 'Administración', apellidos: 'General del Sistema' },
  { email: 'ricardo.villalta.sorto.medicina@docrecord.test', roles: [{ id: 2, name: 'MEDICO' }, { id: 1, name: 'ADMIN' }], nombres: MEDICO.nombres, apellidos: MEDICO.apellidos, especialidad: 'Medicina General' },
  { email: 'enfermeria.turno.matutino@docrecord.test', roles: [{ id: 3, name: 'ENFERMERA' }], nombres: 'Claudia Marisol', apellidos: 'Ayala de Pineda' },
  { email: 'paciente101@correo.test', roles: [{ id: 4, name: 'PACIENTE' }], nombres: PACIENTES[0].persona.nombres, apellidos: PACIENTES[0].persona.apellidos, expediente: PACIENTES[0].expediente },
  { email: 'medico.inactivo@docrecord.test', roles: [{ id: 2, name: 'MEDICO' }], nombres: 'Mario', apellidos: 'Pérez', activo: false },
].map((u, i) => ({
  userId: 11 + i,
  email: u.email,
  userName: u.email,
  roles: u.roles,
  especialidad: u.especialidad ?? null,
  activo: u.activo ?? true,
  sedes: i % 3,
  expediente: u.expediente ?? null,
  nombres: u.nombres,
  apellidos: u.apellidos,
}))

// ─── Interceptor ────────────────────────────────────────────────────────────

export interface ApiSimulada {
  /** Peticiones a la API que no tenían respuesta preparada (`MÉTODO ruta`). */
  noContempladas: string[]
  /** Respuestas de la API que llegaron SIN pasar por aquí: deben ser cero. */
  alBackendReal: string[]
  /** Todas las peticiones a la API que se atendieron. */
  atendidas: string[]
}

/**
 * Si una URL es de la API. En producción el frontend la sirve bajo `/api` del
 * mismo dominio (observado en las peticiones de /mapa); en local, en :8080.
 * `E2E_API_URL` permite apuntar a otra.
 */
function esDeLaApi(url: URL): boolean {
  const extra = process.env.E2E_API_URL
  if (extra && url.href.startsWith(extra)) return true
  if (url.port === '8080') return true
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

/** Ruta de la API sin el prefijo `/api`, para comparar con las de services/. */
function rutaDeApi(url: URL): string {
  return url.pathname.replace(/^\/api(?=\/)/, '')
}

type Respuesta = { status?: number; body: unknown } | undefined

function responderGet(ruta: string, q: URLSearchParams): Respuesta {
  const id = (re: RegExp) => Number(ruta.match(re)?.[1])

  if (ruta === '/pacientes') {
    const buscar = (q.get('buscar') ?? '').toLowerCase()
    const sinTilde = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return {
      body: buscar
        ? PACIENTES.filter((p) =>
            sinTilde(`${p.persona.nombres} ${p.persona.apellidos} ${p.persona.dui ?? ''}`).includes(sinTilde(buscar)),
          )
        : PACIENTES,
    }
  }
  if (/^\/pacientes\/\d+$/.test(ruta)) {
    const p = PACIENTES.find((x) => x.personaId === id(/^\/pacientes\/(\d+)$/))
    return p ? { body: p } : { status: 404, body: { error: 'Recurso no encontrado', message: 'Paciente no encontrado' } }
  }
  if (/^\/pacientes\/\d+\/linea-de-tiempo$/.test(ruta)) {
    const pid = id(/^\/pacientes\/(\d+)/)
    return {
      body: CONSULTAS.filter((c) => c.paciente.personaId === pid).map((c) => ({
        tipo: 'CONSULTA',
        id: c.consultaId,
        fecha: c.fecha,
        estado: c.estado,
        clinica: c.clinica,
        profesional: { personaId: MEDICO.personaId, nombres: MEDICO.nombres, apellidos: MEDICO.apellidos, rol: 'MEDICO', especialidad: MEDICO.especialidad },
        consulta: c,
        signosVitales: null,
        receta: null,
      })),
    }
  }
  if (/^\/pacientes\/\d+\/acceso-portal$/.test(ruta)) {
    const pid = id(/^\/pacientes\/(\d+)/)
    const p = PACIENTES.find((x) => x.personaId === pid)
    return { body: { pacienteId: pid, correoDeContacto: p?.persona.email ?? null, cuenta: null, invitacionEnviada: false, correoEnviado: false } }
  }
  if (ruta === '/consultas') {
    const pid = q.get('pacienteId')
    return { body: pid ? CONSULTAS.filter((c) => String(c.paciente.personaId) === pid) : CONSULTAS }
  }
  if (/^\/consultas\/\d+$/.test(ruta)) {
    const c = CONSULTAS.find((x) => x.consultaId === id(/(\d+)$/))
    return c ? { body: c } : { status: 404, body: { message: 'Consulta no encontrada' } }
  }
  if (ruta === '/citas') return { body: citasDeLaSemana() }
  if (/^\/citas\/\d+$/.test(ruta)) return { body: citasDeLaSemana().find((c) => c.citaId === id(/(\d+)$/)) ?? citasDeLaSemana()[0] }
  if (ruta === '/citas/medicos') return { body: [{ medicoId: MEDICO.personaId, nombre: `${MEDICO.nombres} ${MEDICO.apellidos}` }] }
  if (ruta === '/citas/franjas') return { body: ['08:00', '08:30', '09:00', '10:30', '14:00'] }
  if (ruta === '/tipos-cita') {
    return {
      body: [
        { tipoCitaId: 1, nombre: 'Consulta general', descripcion: null },
        { tipoCitaId: 2, nombre: 'Control de enfermedad crónica', descripcion: 'Seguimiento periódico' },
      ],
    }
  }
  if (ruta === '/clinics' || ruta === '/clinics/mias') return { body: CLINICAS }
  if (ruta === '/clinics/publicas') return { body: CLINICAS }
  if (ruta === '/user/all') return { body: Number(q.get('inicio') ?? 0) === 0 ? USUARIOS : [] }
  if (/^\/user\/\d+\/clinicas$/.test(ruta)) return { body: CLINICAS.slice(0, 1) }
  if (/^\/user\/\d+\/bitacora$/.test(ruta)) return { body: [] }
  if (ruta === '/roles/all') {
    return { body: [{ id: 1, name: 'ADMIN' }, { id: 2, name: 'MEDICO' }, { id: 3, name: 'ENFERMERA' }, { id: 4, name: 'PACIENTE' }] }
  }
  if (ruta === '/especialidades') {
    return { body: [{ especialidadId: 1, nombre: 'Medicina General' }, { especialidadId: 2, nombre: 'Pediatría' }] }
  }
  // Listas que la interfaz pinta vacías sin problema: alergias, antecedentes,
  // hábitos, signos vitales, anulaciones, medicamentos, médicos…
  return undefined
}

/**
 * Contesta desde el navegador toda petición a la API. Los recursos del
 * frontend (HTML, JS, CSS, fuentes) sí se descargan del despliegue: es
 * justamente lo que se quiere probar.
 *
 * Las escrituras (POST, PUT, PATCH, DELETE) se responden con un error 403: estas pruebas
 * no deben poder crear nada, y si alguna lo intentara se vería en el reporte.
 */
export async function simularApi(page: Page): Promise<ApiSimulada> {
  const registro: ApiSimulada = { noContempladas: [], alBackendReal: [], atendidas: [] }

  page.on('response', (r) => {
    const url = new URL(r.url())
    if (!esDeLaApi(url)) return
    if (r.headers()[CABECERA_SIMULADO] !== '1') registro.alBackendReal.push(`${r.request().method()} ${url.pathname}`)
  })

  await page.route(esDeLaApi, async (route: Route, request: Request) => {
    const url = new URL(request.url())
    const ruta = rutaDeApi(url)
    const metodo = request.method()
    const clave = `${metodo} ${ruta}${url.search}`
    registro.atendidas.push(clave)

    const responder = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { [CABECERA_SIMULADO]: '1', 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })

    if (metodo === 'OPTIONS') return responder(204, '')
    if (metodo !== 'GET') {
      registro.noContempladas.push(clave)
      return responder(403, { error: 'Acceso denegado', message: 'Prueba e2e: la API simulada no acepta escrituras.' })
    }
    const r = responderGet(ruta, url.searchParams)
    if (r) return responder(r.status ?? 200, r.body)
    registro.noContempladas.push(clave)
    return responder(200, [])
  })

  return registro
}
