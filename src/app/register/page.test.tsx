// Guardas de la pantalla de registro: lo que se le promete a alguien que acaba
// de crear su cuenta.
//
// El backend responde 201 aunque el correo de confirmación no haya salido —el
// alta ya no depende de que Gmail conteste—, así que el 201 por sí solo no
// autoriza a decir «revisa tu correo». Quien decide es
// `correoDeVerificacionEnviado`, y estas pruebas existen para que ese campo no
// se pueda volver a ignorar en silencio.
//
// Los campos se buscan por su placeholder porque este formulario, a diferencia
// de PatientForm, todavía no asocia sus `<label>` con sus `<input>`.

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

/** Llena el formulario con datos válidos y lo envía. */
async function registrarse(user: ReturnType<typeof userEvent.setup>) {
  // Sin el catálogo cargado no hay `especialidadId` y el envío se bloquea
  // antes de llamar al servicio.
  await screen.findByRole('option', { name: 'Medicina General' })

  await user.type(screen.getByPlaceholderText('Juan Armando'), 'Ana María')
  await user.type(screen.getByPlaceholderText('Guerra Guevara'), 'Ramírez López')
  await user.type(screen.getByPlaceholderText('ejemplo@correo.com'), 'ana@ues.edu.sv')
  await user.type(screen.getByPlaceholderText('••••••••'), 'Docrecord2026!')
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
