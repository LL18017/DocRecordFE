// Guardas de la pantalla de registro: lo que se le promete a alguien que acaba
// de crear su cuenta.
//
// El backend responde 201 aunque el correo de confirmación no haya salido —el
// alta ya no depende de que Gmail conteste—, así que el 201 por sí solo no
// autoriza a decir «revisa tu correo». Quien decide es
// `correoDeVerificacionEnviado`, y estas pruebas existen para que ese campo no
// se pueda volver a ignorar en silencio.
//
// Los campos se buscan por su etiqueta accesible (`getByLabelText`), que es
// como los encuentra una persona —viendo la pantalla o escuchándola— y lo que
// mantiene en pie la asociación `<label htmlFor>` ↔ `<input id>`: si alguien
// la rompe, estas pruebas no encuentran los campos y caen solas.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type { RegistroMedicoResponseDto, RegistroPayload } from '@/services/auth'
import type { EspecialidadDto } from '@/services/personas'
import RegisterPage from './page'

const registrar = vi.fn<(payload: RegistroPayload) => Promise<RegistroMedicoResponseDto>>()
const listarEspecialidades = vi.fn<() => Promise<EspecialidadDto[]>>()

vi.mock('@/services/auth', () => ({
  registrar: (payload: RegistroPayload) => registrar(payload),
}))

vi.mock('@/services/personas', () => ({
  listarEspecialidades: () => listarEspecialidades(),
}))

/** Respuesta de `POST /auth/register` tal como la manda el backend. */
function cuenta(cambios: Partial<RegistroMedicoResponseDto> = {}): RegistroMedicoResponseDto {
  return {
    userId: 7,
    email: 'ana@ues.edu.sv',
    nombres: 'Ana María',
    apellidos: 'Ramírez López',
    roles: ['MEDICO'],
    especialidad: { especialidadId: 1, nombre: 'Medicina General', activa: true },
    correoDeVerificacionEnviado: true,
    ...cambios,
  }
}

beforeEach(() => {
  registrar.mockReset()
  listarEspecialidades.mockReset()
  listarEspecialidades.mockResolvedValue([
    { especialidadId: 1, nombre: 'Medicina General', activa: true },
  ])
})

const campoNombres = () => screen.getByLabelText(/^nombres/i)
const campoApellidos = () => screen.getByLabelText(/^apellidos/i)
const campoEmail = () => screen.getByLabelText(/^correo electrónico/i)
const campoPassword = () => screen.getByLabelText(/^contraseña/i)
const campoEspecialidad = () => screen.getByLabelText(/^especialidad/i)

/** Llena el formulario con datos válidos y lo envía. */
async function registrarse(user: ReturnType<typeof userEvent.setup>) {
  // Sin el catálogo cargado no hay `especialidadId` y el envío se bloquea
  // antes de llamar al servicio.
  await screen.findByRole('option', { name: 'Medicina General' })

  await user.type(campoNombres(), 'Ana María')
  await user.type(campoApellidos(), 'Ramírez López')
  await user.type(campoEmail(), 'ana@ues.edu.sv')
  await user.type(campoPassword(), 'Docrecord2026!')
  await user.click(screen.getByRole('button', { name: /crear cuenta/i }))
  await waitFor(() => expect(registrar).toHaveBeenCalled())
}

function montar() {
  render(<RegisterPage />)
  return userEvent.setup()
}

/** El texto que solo puede aparecer si de verdad se envió un correo. */
const promesaDeCorreo = () => screen.queryByText(/revisa tu correo/i)

describe('RegisterPage · el correo de confirmación sí salió', () => {
  it('manda a revisar la bandeja de entrada', async () => {
    registrar.mockResolvedValue(cuenta({ correoDeVerificacionEnviado: true }))
    const user = montar()

    await registrarse(user)

    expect(await screen.findByText(/revisa tu correo/i)).toBeVisible()
    expect(screen.getByText('ana@ues.edu.sv')).toBeVisible()
    expect(screen.getByRole('link', { name: /ir a iniciar sesión/i })).toBeVisible()
    // El caso normal no es una alerta: si lo fuera, el aviso del caso roto
    // dejaría de distinguirse de un éxito para quien usa lector de pantalla.
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('RegisterPage · el correo de confirmación NO salió', () => {
  it('avisa que la cuenta existe pero el correo no se envió, y NO promete ninguno', async () => {
    registrar.mockResolvedValue(cuenta({ correoDeVerificacionEnviado: false }))
    const user = montar()

    await registrarse(user)

    expect(await screen.findByText(/tu cuenta se creó, pero el correo no salió/i)).toBeVisible()

    // La mitad que de verdad protege: si alguien dejara el mensaje viejo
    // debajo del aviso —o volviera a mostrarlo pase lo que pase—, la persona
    // seguiría esperando un correo que nunca se envió.
    expect(promesaDeCorreo()).toBeNull()
    expect(screen.queryByText(/confirmes el enlace que te enviamos/i)).toBeNull()
  })

  it('el aviso se anuncia como alerta accesible', async () => {
    registrar.mockResolvedValue(cuenta({ correoDeVerificacionEnviado: false }))
    const user = montar()

    await registrarse(user)

    // Sin `role="alert"` el cambio de pantalla es mudo: quien usa lector de
    // pantalla se queda con la última promesa que escuchó.
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/el correo no salió/i)
    expect(alerta).toHaveTextContent(/ana@ues\.edu\.sv/)
  })

  it('ofrece reintentar el envío repitiendo el registro con los mismos datos', async () => {
    registrar
      .mockResolvedValueOnce(cuenta({ correoDeVerificacionEnviado: false }))
      .mockResolvedValueOnce(cuenta({ correoDeVerificacionEnviado: true }))
    const user = montar()

    await registrarse(user)
    await user.click(screen.getByRole('button', { name: /reintentar el envío/i }))

    // El botón no es un consejo: reenvía el mismo registro, que es lo que hace
    // que el backend genere un enlace nuevo. Con otro correo o sin la clave, el
    // reintento crearía una cuenta distinta o fallaría.
    await waitFor(() => expect(registrar).toHaveBeenCalledTimes(2))
    expect(registrar.mock.calls[1][0]).toEqual(registrar.mock.calls[0][0])
    expect(registrar.mock.calls[1][0]).toEqual({
      nombres: 'Ana María',
      apellidos: 'Ramírez López',
      email: 'ana@ues.edu.sv',
      password: 'Docrecord2026!',
      especialidadId: 1,
    })

    // Y cuando el reintento sí manda el correo, la pantalla pasa al mensaje
    // normal en lugar de quedarse acusando un fallo ya resuelto.
    expect(await screen.findByText(/revisa tu correo/i)).toBeVisible()
  })

  it('si el reintento falla, muestra el error sin borrar el aviso', async () => {
    registrar
      .mockResolvedValueOnce(cuenta({ correoDeVerificacionEnviado: false }))
      .mockRejectedValueOnce(new ApiError(503, 'El servicio no está disponible.'))
    const user = montar()

    await registrarse(user)
    await user.click(screen.getByRole('button', { name: /reintentar el envío/i }))

    expect(await screen.findByText('El servicio no está disponible.')).toBeVisible()
    // El aviso sigue en pie: la cuenta continúa creada y sin confirmar, y el
    // botón de reintentar tiene que seguir a mano.
    expect(screen.getByRole('button', { name: /reintentar el envío/i })).toBeEnabled()
    expect(promesaDeCorreo()).toBeNull()
  })

  it('trata la ausencia del campo como correo no enviado', async () => {
    // El tipo promete que el campo siempre viene, pero eso es el contrato, no
    // una garantía en tiempo de ejecución: un backend sin desplegar todavía
    // responde 201 sin él. Ante la duda no se promete un correo.
    const sinCampo: Partial<RegistroMedicoResponseDto> = { ...cuenta() }
    delete sinCampo.correoDeVerificacionEnviado
    registrar.mockResolvedValue(sinCampo as RegistroMedicoResponseDto)
    const user = montar()

    await registrarse(user)

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(promesaDeCorreo()).toBeNull()
  })
})

describe('RegisterPage · nombre accesible de los campos', () => {
  it('localiza todos los campos por su etiqueta visible', async () => {
    montar()
    await screen.findByRole('option', { name: 'Medicina General' })

    // Sin `htmlFor`/`id` un lector de pantalla anuncia cinco «cuadros de
    // edición» sin decir cuál es el correo y cuál la contraseña. Quien no ve
    // la pantalla no puede darse de alta.
    expect(campoNombres().tagName).toBe('INPUT')
    expect(campoApellidos().tagName).toBe('INPUT')
    expect(campoEmail()).toHaveAttribute('type', 'email')
    expect(campoPassword()).toHaveAttribute('type', 'password')
    expect(campoEspecialidad().tagName).toBe('SELECT')
  })

  it('enfoca el campo al hacer clic en su etiqueta', async () => {
    const user = montar()
    await screen.findByRole('option', { name: 'Medicina General' })

    await user.click(screen.getByText(/^apellidos/i))

    expect(campoApellidos()).toHaveFocus()
  })

  it('anuncia lo obligatorio de forma programática, no solo con el asterisco', async () => {
    montar()
    await screen.findByRole('option', { name: 'Medicina General' })

    // El `*` es pintura que el lector de pantalla no transmite; quien lo dice
    // es `required`.
    for (const campo of [
      campoNombres(),
      campoApellidos(),
      campoEmail(),
      campoPassword(),
      campoEspecialidad(),
    ]) {
      expect(campo).toBeRequired()
    }
  })

  it('el campo que se escribe es el que viaja al backend', async () => {
    registrar.mockResolvedValue(cuenta())
    const user = montar()

    await registrarse(user)

    // La etiqueta puede existir y apuntar al control equivocado: esto ata cada
    // nombre visible al dato que de verdad se envía.
    expect(registrar.mock.calls[0][0]).toEqual({
      nombres: 'Ana María',
      apellidos: 'Ramírez López',
      email: 'ana@ues.edu.sv',
      password: 'Docrecord2026!',
      especialidadId: 1,
    })
  })
})
