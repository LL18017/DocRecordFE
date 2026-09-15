// ─── Configuración de Vitest ─────────────────────────────────────────────────
// Las pruebas corren sobre el código fuente directamente (no sobre el build de
// Next), así que aquí se replica lo mínimo que Next resuelve por su cuenta: el
// alias `@/` de tsconfig y el transform de JSX de React.

import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Espejo de `paths` en tsconfig.json. Vite no lee tsconfig.paths solo.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom hace falta tanto para los componentes como para `sessionStorage`,
    // del que depende el manejo de tokens en `lib/api.ts`.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
