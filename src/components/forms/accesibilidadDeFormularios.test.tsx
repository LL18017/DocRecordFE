// Red de seguridad del emparejamiento etiqueta ↔ campo de los formularios que
// se montan en modales (expediente, enfermería y agenda).
//
// Todos arrastraban el mismo defecto: `<label>` sin `htmlFor` y campos sin
// `id`. Un lector de pantalla anunciaba «cuadro de edición» sin decir cuál, y
// el clic en la etiqueta no enfocaba nada. En una toma de signos vitales eso
// no es un detalle estético: escribir el peso en la casilla del pulso deja un
// dato falso en el expediente.
//
// La prueba busca cada campo por su etiqueta accesible (`getByLabelText`), que
// es como lo encuentra una persona —viendo la pantalla o escuchándola—. Si
// alguien quita un `htmlFor` o un `id`, el campo deja de tener nombre y estas
// pruebas no lo encuentran: caen solas, sin comprobar atributos a mano.

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Patient } from '@/types'
import { AllergyForm } from './AllergyForm'
import { AppointmentForm } from './AppointmentForm'
import { ChronicForm } from './ChronicForm'
import { ClinicForm } from './ClinicForm'
import { HabitForm } from './HabitForm'
import { HereditaryForm } from './HereditaryForm'
import { UserForm } from './UserForm'
import { VitalsForm, type PacienteParaToma } from './VitalsForm'

/**
 * VitalsForm ya no recibe el `Patient` de la interfaz sino lo mínimo para
 * identificar al paciente en el desplegable, que es lo que devuelve
 * `GET /pacientes`: no necesita edad, sexo ni tipo de sangre para una toma.
 */
const PACIENTES_PARA_TOMA: PacienteParaToma[] = [
  { personaId: 42, nombre: 'Ana María Ramírez', expediente: 'EXP-0042' },
]

const PACIENTES: Patient[] = [
  {
    id: '42',
    name: 'Ana María Ramírez',
    phone: '7000-0000',
    age: 30,
    sex: 'F',
    consultations: 2,
    status: 'Activo',
    blood: 'O+',
    email: 'ana@ues.edu.sv',
    address: 'San Salvador',
    born: '1996-06-15',
    id_num: '01234567-8',
  },
]

interface Campo {
  /**
   * Etiqueta visible. Va como expresión regular sin anclar al final a
   * propósito: los rótulos obligatorios llevan un « *» que sigue formando
   * parte del texto de la etiqueta.
   */
  etiqueta: RegExp
  control: 'INPUT' | 'SELECT' | 'TEXTAREA'
  obligatorio: boolean
}

interface Formulario {
  nombre: string
  montar: () => React.ReactElement
  campos: Campo[]
}

const nada = () => {}

const FORMULARIOS: Formulario[] = [
  {
    nombre: 'AllergyForm',
    montar: () => <AllergyForm onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^nombre del alérgeno/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^tipo$/i, control: 'SELECT', obligatorio: false },
      { etiqueta: /^severidad$/i, control: 'SELECT', obligatorio: false },
      { etiqueta: /^reacción reportada$/i, control: 'TEXTAREA', obligatorio: false },
    ],
  },
  {
    nombre: 'ChronicForm',
    montar: () => <ChronicForm onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^nombre de la enfermedad/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^año \/ fecha de diagnóstico$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^tratamiento actual$/i, control: 'TEXTAREA', obligatorio: false },
    ],
  },
  {
    nombre: 'HereditaryForm',
    montar: () => <HereditaryForm onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^condición hereditaria/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^parentesco$/i, control: 'SELECT', obligatorio: false },
      { etiqueta: /^observaciones$/i, control: 'TEXTAREA', obligatorio: false },
    ],
  },
  {
    nombre: 'HabitForm',
    montar: () => <HabitForm onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^tipo de hábito/i, control: 'SELECT', obligatorio: true },
      { etiqueta: /^descripción del hábito$/i, control: 'TEXTAREA', obligatorio: false },
      { etiqueta: /^nivel \/ frecuencia$/i, control: 'SELECT', obligatorio: false },
    ],
  },
  {
    nombre: 'VitalsForm',
    montar: () => (
      <VitalsForm pacientes={PACIENTES_PARA_TOMA} onSubmit={nada} onCancel={nada} />
    ),
    // La presión dejó de ser UN campo de texto («120/80») y pasó a ser dos
    // numéricos: el backend guarda sistólica y diastólica en columnas
    // distintas para poder consultarlas.
    //
    // Y desapareció «Enfermera responsable». Quien firma la toma sale del
    // token, no de una casilla que cualquiera puede escribir: un campo libre
    // ahí permitía atribuirle una presión arterial a otra compañera.
    campos: [
      { etiqueta: /^paciente$/i, control: 'SELECT', obligatorio: true },
      { etiqueta: /^peso \(kg\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^talla \(cm\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^temperatura \(°C\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^presión sistólica \(mmHg\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^presión diastólica \(mmHg\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^pulso \(lpm\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^frecuencia resp\. \(rpm\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^saturación O₂ \(%\)$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^observaciones$/i, control: 'TEXTAREA', obligatorio: false },
    ],
  },
  {
    nombre: 'AppointmentForm',
    montar: () => <AppointmentForm patients={PACIENTES} onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^paciente/i, control: 'SELECT', obligatorio: true },
      { etiqueta: /^fecha/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^hora/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^tipo de cita$/i, control: 'SELECT', obligatorio: false },
      { etiqueta: /^notas u observaciones$/i, control: 'TEXTAREA', obligatorio: false },
    ],
  },
  {
    nombre: 'UserForm',
    montar: () => <UserForm onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^nombre completo/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^correo electrónico/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^contraseña temporal$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^rol$/i, control: 'SELECT', obligatorio: false },
      { etiqueta: /^especialidad$/i, control: 'INPUT', obligatorio: false },
    ],
  },
  {
    nombre: 'ClinicForm',
    montar: () => <ClinicForm onSubmit={nada} onCancel={nada} />,
    campos: [
      { etiqueta: /^nombre de la clínica/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^dirección/i, control: 'INPUT', obligatorio: true },
      { etiqueta: /^teléfono$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^latitud$/i, control: 'INPUT', obligatorio: false },
      { etiqueta: /^longitud$/i, control: 'INPUT', obligatorio: false },
    ],
  },
]

describe.each(FORMULARIOS)('$nombre · nombre accesible de los campos', ({ montar, campos }) => {
  it('localiza todos los campos por su etiqueta visible', () => {
    render(montar())

    for (const { etiqueta, control } of campos) {
      // `getByLabelText` resuelve el nombre accesible: sin `htmlFor`/`id` no
      // encuentra nada y la prueba cae con el rótulo que falló.
      expect(screen.getByLabelText(etiqueta).tagName).toBe(control)
    }
  })

  it('enfoca el campo al hacer clic en su etiqueta', async () => {
    const user = userEvent.setup()
    render(montar())

    // Comportamiento estándar que la gente espera sin pensarlo, y que solo
    // existe si la etiqueta apunta de verdad a su control.
    for (const { etiqueta } of campos) {
      await user.click(screen.getByText(etiqueta))
      expect(screen.getByLabelText(etiqueta)).toHaveFocus()
    }
  })

  it('anuncia lo obligatorio de forma programática, no solo con el asterisco', () => {
    render(montar())

    // El `*` es pintura: un lector de pantalla no lo transmite como «este
    // campo es obligatorio». Quien lo dice es `required`.
    for (const { etiqueta, obligatorio } of campos) {
      const campo = screen.getByLabelText(etiqueta)
      if (obligatorio) expect(campo).toBeRequired()
      else expect(campo).not.toBeRequired()
    }
  })

  it('no repite ids si el formulario se monta dos veces en la misma página', () => {
    render(
      <>
        {montar()}
        {montar()}
      </>,
    )

    // Con ids fijos ambas etiquetas resolverían al mismo control y aquí
    // aparecería un solo elemento: `useId()` es lo que evita la colisión.
    for (const { etiqueta } of campos) {
      const encontrados = screen.getAllByLabelText(etiqueta)
      expect(encontrados).toHaveLength(2)
      expect(encontrados[0]).not.toBe(encontrados[1])
      expect(encontrados[0].id).not.toBe(encontrados[1].id)
      expect(encontrados[0].id).not.toBe('')
    }
  })
})

describe('Formularios de modal · el asterisco no es el que informa', () => {
  it('el « *» va oculto al lector de pantalla en todos los rótulos obligatorios', () => {
    // Si el asterisco se anunciara, el nombre del campo sería «Nombre del
    // alérgeno estrella». Va `aria-hidden` justamente porque lo obligatorio ya
    // viaja por `required`, que es lo que la prueba de arriba exige.
    render(<AllergyForm onSubmit={nada} onCancel={nada} />)

    const rotulo = screen.getByText(/^nombre del alérgeno/i)
    const asterisco = rotulo.querySelector('[aria-hidden="true"]')
    expect(asterisco?.textContent?.trim()).toBe('*')
  })
})

describe('VitalsForm · el selector de paciente solo existe si hay lista', () => {
  it('no ofrece un campo «Paciente» cuando el expediente ya fija al paciente', () => {
    // Montado sin lista: no hay a quién elegir porque el paciente ya está
    // fijado. Si apareciera un rótulo sin control detrás, sería una etiqueta
    // rota.
    render(<VitalsForm defaultPacienteId={42} onSubmit={nada} onCancel={nada} />)

    expect(screen.queryByLabelText(/^paciente$/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^peso \(kg\)$/i)).toBeInTheDocument()
  })
})

describe('AppointmentForm · lo que se agenda', () => {
  it('manda lo capturado en los campos localizados por su etiqueta', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AppointmentForm patients={PACIENTES} onSubmit={onSubmit} onCancel={nada} />)

    // El paciente ya no viene preseleccionado: elegirlo es parte del flujo.
    await user.selectOptions(screen.getByLabelText(/^paciente/i), 'Ana María Ramírez')
    await user.clear(screen.getByLabelText(/^hora/i))
    await user.type(screen.getByLabelText(/^hora/i), '14:30')
    await user.type(screen.getByLabelText(/^notas u observaciones$/i), 'Control de presión')
    await user.click(screen.getByRole('button', { name: /agendar cita/i }))

    // La guarda no es solo que la etiqueta exista: es que el campo que la
    // etiqueta señala sea el que de verdad alimenta el envío.
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      patient: 'Ana María Ramírez',
      time: '14:30',
    })
  })
})

// ─── El rótulo tiene que señalar al campo que lleva SU dato ──────────────────
// Las pruebas de arriba exigen que cada etiqueta nombre a un control, pero no
// a cuál. Una etiqueta puede estar bien formada y apuntar al campo de al lado:
// «Latitud» sobre la casilla de la longitud pone la clínica en otro punto del
// mapa, y «Peso» sobre la del pulso deja un signo vital falso en el
// expediente. Estas pruebas escriben por etiqueta y miran qué se envía.

describe('ClinicForm · cada rótulo sobre su casilla', () => {
  it('manda como latitud lo escrito bajo «Latitud»', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ClinicForm onSubmit={onSubmit} onCancel={nada} />)

    await user.type(screen.getByLabelText(/^nombre de la clínica/i), 'Clínica Nueva')
    await user.type(screen.getByLabelText(/^dirección/i), 'Colonia Escalón')
    await user.type(screen.getByLabelText(/^teléfono$/i), '2245-0000')
    await user.clear(screen.getByLabelText(/^latitud$/i))
    await user.type(screen.getByLabelText(/^latitud$/i), '13.5')
    await user.clear(screen.getByLabelText(/^longitud$/i))
    await user.type(screen.getByLabelText(/^longitud$/i), '-89.1')
    await user.click(screen.getByRole('button', { name: /guardar clínica/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Clínica Nueva',
      address: 'Colonia Escalón',
      phone: '2245-0000',
      lat: 13.5,
      lng: -89.1,
    })
  })
})

describe('VitalsForm · cada rótulo sobre su constante', () => {
  it('manda cada valor en el campo del rótulo bajo el que se escribió', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <VitalsForm pacientes={PACIENTES_PARA_TOMA} onSubmit={onSubmit} onCancel={nada} />,
    )

    // El paciente ya no viene preseleccionado: elegirlo es parte del flujo.
    await user.selectOptions(screen.getByLabelText(/^paciente$/i), '42')

    const escribir = async (etiqueta: RegExp, valor: string) => {
      await user.clear(screen.getByLabelText(etiqueta))
      await user.type(screen.getByLabelText(etiqueta), valor)
    }
    await escribir(/^peso \(kg\)$/i, '81')
    await escribir(/^talla \(cm\)$/i, '162')
    await escribir(/^pulso \(lpm\)$/i, '55')
    await escribir(/^saturación O₂ \(%\)$/i, '91')
    await user.click(screen.getByRole('button', { name: /guardar registro/i }))

    // NÚMEROS, no cadenas con la unidad pegada: el backend guarda columnas
    // numéricas para poder preguntar «quiénes tienen la sistólica sobre 140».
    // Valores distintos entre sí a propósito: con dos iguales, un cruce de
    // etiquetas pasaría desapercibido.
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      pacienteId: 42,
      pesoKg: 81,
      estaturaCm: 162,
      pulsoLpm: 55,
      saturacionPct: 91,
    })
  })

  it('omite del cuerpo las medidas que no se tomaron, en vez de mandarlas en cero', async () => {
    // Un 0 en una saturación es una urgencia; una casilla vacía es un hueco.
    // Mandar lo segundo como lo primero convierte una ausencia en una alarma.
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <VitalsForm pacientes={PACIENTES_PARA_TOMA} onSubmit={onSubmit} onCancel={nada} />,
    )

    await user.selectOptions(screen.getByLabelText(/^paciente$/i), '42')
    await user.type(screen.getByLabelText(/^pulso \(lpm\)$/i), '72')
    await user.click(screen.getByRole('button', { name: /guardar registro/i }))

    const cuerpo = onSubmit.mock.calls[0][0]
    expect(cuerpo).toEqual({ pacienteId: 42, pulsoLpm: 72 })
    expect(cuerpo).not.toHaveProperty('saturacionPct')
    expect(cuerpo).not.toHaveProperty('pesoKg')
  })

  it('no trae ningún paciente preseleccionado', async () => {
    // El desplegable arrancaba en `pacientes[0]` —quien el catálogo pusiera
    // primero—, y ese valor por defecto es el que acaba escribiendo la toma en
    // el expediente equivocado: se abre el modal con el tensiómetro en la mano,
    // se escriben las medidas y se guarda sin releer un campo que ya venía
    // relleno. Una toma en la ficha de otro paciente no se distingue después de
    // una real.
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <VitalsForm pacientes={PACIENTES_PARA_TOMA} onSubmit={onSubmit} onCancel={nada} />,
    )

    expect(screen.getByLabelText(/^paciente$/i)).toHaveValue('')

    // Y sin elegirlo no se envía, aunque haya medidas escritas.
    await user.type(screen.getByLabelText(/^pulso \(lpm\)$/i), '72')
    await user.click(screen.getByRole('button', { name: /guardar registro/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('no deja guardar una toma sin ninguna medida', async () => {
    // El formulario nacía con siete constantes escritas -72 kg, 120/80, 36.8…-
    // y «Guardar» sin tocar nada dejaba en el expediente medidas que nadie
    // tomó. Ahora nace vacío, y vacío no se puede guardar.
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <VitalsForm pacientes={PACIENTES_PARA_TOMA} onSubmit={onSubmit} onCancel={nada} />,
    )

    for (const etiqueta of [
      /^peso \(kg\)$/i,
      /^talla \(cm\)$/i,
      /^temperatura \(°C\)$/i,
      /^pulso \(lpm\)$/i,
      /^saturación O₂ \(%\)$/i,
    ]) {
      expect(screen.getByLabelText(etiqueta)).toHaveValue(null)
    }

    await user.click(screen.getByRole('button', { name: /guardar registro/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('AllergyForm · cada rótulo sobre su desplegable', () => {
  it('no confunde el tipo con la severidad', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AllergyForm onSubmit={onSubmit} onCancel={nada} />)

    await user.type(screen.getByLabelText(/^nombre del alérgeno/i), 'Penicilina')
    await user.selectOptions(screen.getByLabelText(/^tipo$/i), 'Alimento')
    await user.selectOptions(screen.getByLabelText(/^severidad$/i), 'Alta')
    await user.type(screen.getByLabelText(/^reacción reportada$/i), 'Urticaria')
    await user.click(screen.getByRole('button', { name: /guardar alergia/i }))

    expect(onSubmit.mock.calls[0][0]).toEqual({
      nombre: 'Penicilina',
      tipo: 'Alimento',
      severidad: 'Alta',
      reaccion: 'Urticaria',
    })
  })
})

describe('HabitForm · cada rótulo sobre su desplegable', () => {
  it('no confunde el tipo de hábito con el nivel', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<HabitForm onSubmit={onSubmit} onCancel={nada} />)

    await user.selectOptions(screen.getByLabelText(/^tipo de hábito/i), 'Tabaquismo')
    await user.selectOptions(screen.getByLabelText(/^nivel \/ frecuencia$/i), 'Alto')
    await user.type(screen.getByLabelText(/^descripción del hábito$/i), 'Media cajetilla al día')
    await user.click(screen.getByRole('button', { name: /guardar hábito/i }))

    expect(onSubmit.mock.calls[0][0]).toEqual({
      tipo: 'Tabaquismo',
      nivel: 'Alto',
      descripcion: 'Media cajetilla al día',
    })
  })
})

describe('ChronicForm y HereditaryForm · cada rótulo sobre su campo', () => {
  it('ChronicForm manda el año bajo «Año / Fecha de diagnóstico» y no el nombre', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ChronicForm onSubmit={onSubmit} onCancel={nada} />)

    await user.type(screen.getByLabelText(/^nombre de la enfermedad/i), 'Hipertensión')
    await user.clear(screen.getByLabelText(/^año \/ fecha de diagnóstico$/i))
    await user.type(screen.getByLabelText(/^año \/ fecha de diagnóstico$/i), '2019')
    await user.type(screen.getByLabelText(/^tratamiento actual$/i), 'Losartán 50mg')
    await user.click(screen.getByRole('button', { name: /guardar enfermedad/i }))

    expect(onSubmit.mock.calls[0][0]).toEqual({
      nombre: 'Hipertensión',
      desde: '2019',
      tratamiento: 'Losartán 50mg',
    })
  })

  it('HereditaryForm manda el parentesco elegido, no la condición', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<HereditaryForm onSubmit={onSubmit} onCancel={nada} />)

    await user.type(screen.getByLabelText(/^condición hereditaria/i), 'Diabetes tipo 2')
    await user.selectOptions(screen.getByLabelText(/^parentesco$/i), 'Abuela materna')
    await user.type(screen.getByLabelText(/^observaciones$/i), 'Diagnóstico a los 50')
    await user.click(screen.getByRole('button', { name: /guardar condición/i }))

    expect(onSubmit.mock.calls[0][0]).toEqual({
      condicion: 'Diabetes tipo 2',
      parentesco: 'Abuela materna',
      observaciones: 'Diagnóstico a los 50',
    })
  })
})

describe('UserForm · cada rótulo sobre su campo', () => {
  it('no confunde el nombre con el correo ni la especialidad', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<UserForm onSubmit={onSubmit} onCancel={nada} />)

    await user.type(screen.getByLabelText(/^nombre completo/i), 'Dra. Ana Ramírez')
    await user.type(screen.getByLabelText(/^correo electrónico/i), 'ana@docrecord.sv')
    await user.clear(screen.getByLabelText(/^especialidad$/i))
    await user.type(screen.getByLabelText(/^especialidad$/i), 'Pediatría')
    await user.click(screen.getByRole('button', { name: /crear usuario/i }))

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Dra. Ana Ramírez',
      email: 'ana@docrecord.sv',
      specialty: 'Pediatría',
    })
  })
})
