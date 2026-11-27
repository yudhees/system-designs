import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Plain Vitest (no Nuxt runtime): server routes are tested by stubbing the Nitro
// globals they use, so the suite is fast and needs no keys or network.
export default defineConfig({
  resolve: {
    alias: { '#content': fileURLToPath(new URL('./tests/helpers/content-stub.ts', import.meta.url)) },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
