import type { Metadata } from 'next'
import { VistaDelMapa } from './VistaDelMapa'

// La página es de servidor solo para poder declarar `metadata` (un componente
// con 'use client' no puede). Todo lo que se ve vive en VistaDelMapa, que es de
// cliente porque el mapa necesita el navegador.

export const metadata: Metadata = {
  title: 'Mapa de clínicas · DocRecord Sv',
  description:
    'Las clínicas de la red DocRecord en El Salvador: dónde quedan, su teléfono y su horario de atención.',
}

export default function MapaPage() {
  return <VistaDelMapa />
}
