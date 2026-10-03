// Matchers de jest-dom (`toBeDisabled`, `toBeInTheDocument`, …) registrados en
// `expect` de Vitest. El subpath `/vitest` es el que además declara los tipos.
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin esto, los componentes montados en una prueba siguen en el DOM durante la
// siguiente y las consultas por texto encuentran duplicados.
afterEach(() => {
  cleanup()
})
