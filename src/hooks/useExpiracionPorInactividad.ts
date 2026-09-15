'use client'

// HU-06 (DRS-79), criterios 2 y 3 · expiración por inactividad.
//
// «Como médico que atiende en un consultorio COMPARTIDO quiero […] que el
//  sistema la cierre solo tras un rato sin uso para que nadie más consulte
//  expedientes con mi identidad.»
//
// Esa palabra —compartido— es la que fija las decisiones de abajo. No se trata
// de ahorrar sesiones en un servidor: se trata de que la computadora del
// consultorio queda sola entre paciente y paciente, con un expediente abierto.

import { useCallback, useEffect, useRef, useState } from 'react'

/** 20 minutos sin actividad cierran la sesión (criterio 2). */
export const INACTIVIDAD_MS = 20 * 60 * 1000

/** El aviso aparece 2 minutos antes (criterio 3). */
export const ANTELACION_DEL_AVISO_MS = 2 * 60 * 1000

/**
 * Se vigilan interacciones DELIBERADAS, no cualquier movimiento.
 *
 * `mousemove` es lo que casi todo el mundo usa aquí, y es justo lo que no
 * conviene en este caso: en un consultorio compartido, alguien que pasa y roza
 * el escritorio mantendría viva indefinidamente la sesión del médico anterior.
 * Pulsar, teclear, desplazar o tocar la pantalla son actos de alguien que está
 * usando el sistema.
 */
const EVENTOS_DE_ACTIVIDAD = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

/** Cada cuánto se comprueba el reloj. Ver la nota sobre pestañas en segundo plano. */
const INTERVALO_DE_COMPROBACION_MS = 10 * 1000

export interface UsoDeExpiracion {
  /** Si el aviso previo debe estar visible. */
  avisando: boolean
  /** Segundos que faltan para que expire, mientras `avisando` es cierto. */
  segundosRestantes: number
  /** Lo llama el botón «Continuar»: reinicia la cuenta sin re-autenticar. */
  continuar: () => void
}

export interface OpcionesDeExpiracion {
  /** Sin sesión no hay nada que expirar; el temporizador no corre. */
  activa: boolean
  /** Se llama una sola vez al agotarse el tiempo. */
  alExpirar: () => void
  inactividadMs?: number
  antelacionMs?: number
}

export function useExpiracionPorInactividad({
  activa,
  alExpirar,
  inactividadMs = INACTIVIDAD_MS,
  antelacionMs = ANTELACION_DEL_AVISO_MS,
}: OpcionesDeExpiracion): UsoDeExpiracion {
  // Arranca en 0 y no en `Date.now()`: leer el reloj durante el render es una
  // llamada impura, y aquí además es innecesaria — el efecto fija la marca
  // real al montar, antes de que el intervalo llegue a comprobar nada.
  const ultimaActividad = useRef<number>(0)
  const yaExpiro = useRef(false)
  const [avisando, setAvisando] = useState(false)
  const [segundosRestantes, setSegundosRestantes] = useState(0)

  // El aviso se espeja en una ref porque el efecto necesita CONSULTARLO sin
  // depender de él.
  //
  // Tenerlo en las dependencias parecía inofensivo y no lo era: al aparecer el
  // aviso, el efecto se desmontaba y volvía a montarse, y al montarse reinicia
  // `ultimaActividad`. Resultado: la cuenta atrás se reiniciaba sola a los 18
  // minutos y la sesión NO expiraba nunca. Lo cazó la prueba «cierra la sesión
  // tras 20 minutos», que es justo lo que esa prueba está para vigilar.
  const avisandoRef = useRef(false)
  useEffect(() => {
    avisandoRef.current = avisando
  }, [avisando])

  // `alExpirar` suele venir como función nueva en cada render. Guardarla en una
  // ref evita que el efecto se desmonte y se vuelva a montar constantemente, lo
  // que reiniciaría el contador y haría que la sesión no expirara nunca.
  const alExpirarRef = useRef(alExpirar)
  useEffect(() => {
    alExpirarRef.current = alExpirar
  }, [alExpirar])

  const continuar = useCallback(() => {
    ultimaActividad.current = Date.now()
    setAvisando(false)
  }, [])

  useEffect(() => {
    // Sin sesión no hay nada que vigilar. No se apaga el aviso con un setState
    // aquí: llamarlo dentro del efecto encadena renders, y no hace falta —lo
    // que se devuelve abajo ya lo condiciona a `activa`, así que un aviso
    // colgado de una sesión que acaba de cerrarse no llega a pintarse.
    if (!activa) return

    yaExpiro.current = false
    ultimaActividad.current = Date.now()

    const registrarActividad = () => {
      // Mientras el aviso está en pantalla, moverse NO cuenta como continuar:
      // el criterio 3 pide una decisión explícita, y si un roce cualquiera lo
      // cancelara, el aviso se volvería un parpadeo que nadie llega a leer.
      if (avisandoRef.current) return
      ultimaActividad.current = Date.now()
    }

    const comprobar = () => {
      if (yaExpiro.current) return

      const inactivo = Date.now() - ultimaActividad.current
      const restante = inactividadMs - inactivo

      if (restante <= 0) {
        yaExpiro.current = true
        setAvisando(false)
        alExpirarRef.current()
        return
      }

      if (restante <= antelacionMs) {
        setAvisando(true)
        setSegundosRestantes(Math.ceil(restante / 1000))
      } else {
        setAvisando(false)
      }
    }

    // Se compara contra un RELOJ, no se confía en que un temporizador dispare a
    // tiempo. Los navegadores frenan los temporizadores de las pestañas en
    // segundo plano —a veces a uno por minuto—, así que un setTimeout de 20
    // minutos puede llegar tardísimo. Comparando marcas de tiempo, volver a la
    // pestaña después de media hora detecta el vencimiento en el acto.
    const intervalo = window.setInterval(comprobar, INTERVALO_DE_COMPROBACION_MS)

    // Y se comprueba también al volver a la pestaña, sin esperar al intervalo:
    // es el momento exacto en que alguien puede ver datos que ya no debería.
    const alVolver = () => {
      if (document.visibilityState === 'visible') comprobar()
    }

    EVENTOS_DE_ACTIVIDAD.forEach((evento) =>
      window.addEventListener(evento, registrarActividad, { passive: true }),
    )
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      window.clearInterval(intervalo)
      EVENTOS_DE_ACTIVIDAD.forEach((evento) =>
        window.removeEventListener(evento, registrarActividad),
      )
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [activa, inactividadMs, antelacionMs])

  // Mientras el aviso está visible, la cuenta atrás baja cada segundo. Va en su
  // propio efecto para no acelerar la comprobación general a 1 Hz cuando no
  // hace falta.
  useEffect(() => {
    if (!avisando) return
    const tic = window.setInterval(() => {
      const restante = inactividadMs - (Date.now() - ultimaActividad.current)
      setSegundosRestantes(Math.max(0, Math.ceil(restante / 1000)))
    }, 1000)
    return () => window.clearInterval(tic)
  }, [avisando, inactividadMs])

  return { avisando: activa && avisando, segundosRestantes, continuar }
}
