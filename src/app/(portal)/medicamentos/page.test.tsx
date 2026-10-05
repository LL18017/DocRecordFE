// Pantalla del catálogo de medicamentos (HU-23), una prueba por criterio que
// le toca a la administración: el alta exige los cinco datos (1), el
// duplicado se avisa diciendo cuál existe (2), y desactivar no borra (4).
// El criterio 3 —recetar desde el catálogo— se prueba en PrescriptionForm.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api'
import type {
  FiltroDeMedicamentos,
  GuardarMedicamentoPayload,
  MedicamentoCatalogoDto,
} from '@/services/medicamentos'
import MedicamentosPage from './page'

const listarMedicamentos = vi.fn<(f?: FiltroDeMedicamentos) => Promise<MedicamentoCatalogoDto[]>>()
const crearMedicamento = vi.fn<(p: GuardarMedicamentoPayload) => Promise<MedicamentoCatalogoDto>>()
const actualizarMedicamento =
  vi.fn<(id: number, p: GuardarMedicamentoPayload) => Promise<MedicamentoCatalogoDto>>()
const cambiarEstadoMedicamento = vi.fn<(id: number, activo: boolean) => Promise<MedicamentoCatalogoDto>>()

vi.mock('@/services/medicamentos', async (importarOriginal) => {
  // `coincideConBusqueda` y los topes se dejan reales: la pantalla los usa.
  const real = await importarOriginal<typeof import('@/services/medicamentos')>()
  return {
    ...real,
    listarMedicamentos: (f?: FiltroDeMedicamentos) => listarMedicamentos(f),
    crearMedicamento: (p: GuardarMedicamentoPayload) => crearMedicamento(p),
    actualizarMedicamento: (id: number, p: GuardarMedicamentoPayload) => actualizarMedicamento(id, p),
    cambiarEstadoMedicamento: (id: number, activo: boolean) => cambiarEstadoMedicamento(id, activo),
  }
})

function medicamento(cambios: Partial<MedicamentoCatalogoDto> = {}): MedicamentoCatalogoDto {
  const base = {
    medicamentoId: 1,
    nombreGenerico: 'Acetaminofén',
    nombreComercial: 'Panadol',
    principioActivo: 'Paracetamol',
    presentacion: 'Tableta',
    concentracion: '500 mg',
    activo: true,
    ...cambios,
  }
  return {
    ...base,
    descripcion: `${base.nombreGenerico} ${base.concentracion} (${base.nombreComercial}), ${base.presentacion}`,
  }
}

const PANADOL = medicamento()
const ZANTAC = medicamento({
  medicamentoId: 2,
  nombreGenerico: 'Ranitidina',
  nombreComercial: 'Zantac',
  principioActivo: 'Ranitidina',
  concentracion: '150 mg',
  activo: false,
})

beforeEach(() => {
  listarMedicamentos.mockReset()
  crearMedicamento.mockReset()
  actualizarMedicamento.mockReset()
  cambiarEstadoMedicamento.mockReset()
  listarMedicamentos.mockResolvedValue([PANADOL, ZANTAC])
})

async function montar() {
  const user = userEvent.setup()
  render(<MedicamentosPage />)
  await screen.findByText('Panadol')
  return user
}

/** Llena el formulario del modal abierto. Los campos que no se pasan quedan vacíos. */
async function llenar(user: ReturnType<typeof userEvent.setup>, datos: Partial<GuardarMedicamentoPayload>) {
  const etiquetas: Record<keyof GuardarMedicamentoPayload, RegExp> = {
    nombreGenerico: /nombre genérico/i,
    nombreComercial: /nombre comercial/i,
    principioActivo: /principio activo/i,
    presentacion: /presentación/i,
    concentracion: /concentración/i,
  }
  const dialogo = screen.getByRole('dialog')
  for (const [campo, valor] of Object.entries(datos) as [keyof GuardarMedicamentoPayload, string][]) {
    const input = within(dialogo).getByLabelText(etiquetas[campo])
    await user.clear(input)
    await user.type(input, valor)
  }
}

const COMPLETO: GuardarMedicamentoPayload = {
  nombreGenerico: 'Amoxicilina',
  nombreComercial: 'Amoxil',
  principioActivo: 'Amoxicilina',
  presentacion: 'Cápsula',
  concentracion: '500 mg',
}

describe('Catálogo de medicamentos · la lista', () => {
  it('pide también los desactivados, pero por defecto muestra solo los activos', async () => {
    const user = await montar()
    expect(listarMedicamentos).toHaveBeenCalledWith({ incluirInactivos: true })
    expect(screen.queryByText('Zantac')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText(/mostrar desactivados/i))
    const fila = screen.getByText('Zantac').closest('tr') as HTMLElement
    expect(within(fila).getByText('Desactivado')).toBeInTheDocument()
  })

  it('busca sin tildes por nombre genérico, comercial o principio activo', async () => {
    const user = await montar()
    await user.type(screen.getByLabelText(/buscar en el catálogo/i), 'acetaminofen')
    expect(screen.getByText('Panadol')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/buscar en el catálogo/i))
    await user.type(screen.getByLabelText(/buscar en el catálogo/i), 'ibuprofeno')
    expect(screen.queryByText('Panadol')).not.toBeInTheDocument()
    expect(screen.getByText(/ningún medicamento coincide/i)).toBeInTheDocument()
  })
})

describe('Catálogo de medicamentos · criterio 1: el alta exige los cinco datos', () => {
  it('no envía nada si falta uno y señala cuál', async () => {
    const user = await montar()
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await llenar(user, { ...COMPLETO, principioActivo: '   ' })
    await user.click(screen.getByRole('button', { name: /guardar medicamento/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Principio activo es obligatorio.')
    expect(screen.getByLabelText(/principio activo/i)).toHaveAttribute('aria-invalid', 'true')
    expect(crearMedicamento).not.toHaveBeenCalled()
  })

  it('con los cinco datos lo registra y aparece en la lista', async () => {
    crearMedicamento.mockResolvedValue(medicamento({ ...COMPLETO, medicamentoId: 9 }))
    const user = await montar()
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await llenar(user, COMPLETO)
    await user.click(screen.getByRole('button', { name: /guardar medicamento/i }))

    await waitFor(() => expect(crearMedicamento).toHaveBeenCalledWith(COMPLETO))
    expect(await screen.findByText('Amoxil')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Catálogo de medicamentos · criterio 2: el duplicado se avisa', () => {
  it('muestra el aviso del backend con el medicamento que ya existe y deja el modal abierto', async () => {
    const motivo =
      'Ya existe un medicamento con el mismo nombre comercial, presentacion y concentracion: Acetaminofén 500 mg (Panadol), Tableta (codigo 1).'
    crearMedicamento.mockRejectedValue(new ApiError(409, motivo))
    const user = await montar()
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }))
    await llenar(user, {
      nombreGenerico: 'Paracetamol',
      nombreComercial: 'PANADOL',
      principioActivo: 'Paracetamol',
      presentacion: 'tableta',
      concentracion: '500mg',
    })
    await user.click(screen.getByRole('button', { name: /guardar medicamento/i }))

    const dialogo = screen.getByRole('dialog')
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(motivo)
    // Se señalan los tres campos de la clave: son los que hay que cambiar.
    for (const etiqueta of [/nombre comercial/i, /presentación/i, /concentración/i]) {
      expect(within(dialogo).getByLabelText(etiqueta)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(within(dialogo).getByLabelText(/nombre genérico/i)).not.toHaveAttribute('aria-invalid')
  })

  it('editar hasta chocar con otro también muestra el aviso', async () => {
    actualizarMedicamento.mockRejectedValue(new ApiError(409, 'Ya existe un medicamento ... (codigo 1).'))
    const user = await montar()
    await user.click(screen.getByRole('button', { name: `Editar ${PANADOL.descripcion}` }))
    await llenar(user, { concentracion: '500 mg' })
    await user.click(screen.getByRole('button', { name: /guardar medicamento/i }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/codigo 1/)
  })
})

describe('Catálogo de medicamentos · criterio 4: desactivar no borra', () => {
  it('desactiva tras confirmar, y el medicamento sigue en el catálogo como desactivado', async () => {
    cambiarEstadoMedicamento.mockResolvedValue({ ...PANADOL, activo: false })
    const user = await montar()

    await user.click(screen.getByRole('button', { name: `Desactivar ${PANADOL.descripcion}` }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/las recetas emitidas antes lo siguen mostrando/i)).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: /^desactivar$/i }))

    await waitFor(() => expect(cambiarEstadoMedicamento).toHaveBeenCalledWith(1, false))
    // Sale de la vista normal...
    await waitFor(() => expect(screen.queryByText('Panadol')).not.toBeInTheDocument())
    // ...pero no se borró: está entre los desactivados, listo para reactivarse.
    await user.click(screen.getByLabelText(/mostrar desactivados/i))
    expect(screen.getByRole('button', { name: `Reactivar ${PANADOL.descripcion}` })).toBeInTheDocument()
  })

  it('reactiva un desactivado sin pasos de más', async () => {
    cambiarEstadoMedicamento.mockResolvedValue({ ...ZANTAC, activo: true })
    const user = await montar()
    await user.click(screen.getByLabelText(/mostrar desactivados/i))
    await user.click(screen.getByRole('button', { name: `Reactivar ${ZANTAC.descripcion}` }))

    await waitFor(() => expect(cambiarEstadoMedicamento).toHaveBeenCalledWith(2, true))
    const fila = (await screen.findByText('Zantac')).closest('tr') as HTMLElement
    await waitFor(() => expect(within(fila).getByText('Activo')).toBeInTheDocument())
  })

  it('si el servidor rechaza el cambio, lo dice y la fila no cambia', async () => {
    cambiarEstadoMedicamento.mockRejectedValue(
      new ApiError(403, 'No tienes permiso para desactivar medicamentos: el catálogo solo lo mantiene un administrador.'),
    )
    const user = await montar()
    await user.click(screen.getByRole('button', { name: `Desactivar ${PANADOL.descripcion}` }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^desactivar$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/solo lo mantiene un administrador/i)
    const fila = screen.getByText('Panadol').closest('tr') as HTMLElement
    expect(within(fila).getByText('Activo')).toBeInTheDocument()
  })
})
