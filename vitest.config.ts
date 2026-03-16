/**
 * Vitest configuration for Fly TTY
 */

import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@fly-tty/engine': resolve(__dirname, 'packages/engine/src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    environment: 'node',
    coverage: {
      include: [
        'packages/engine/src/**/*.ts',
        '!packages/engine/src/**/index.ts',
        '!packages/engine/src/types/**/*.ts',
        '!packages/engine/src/adapters/ide/**/*.ts',
        '!packages/engine/src/adapters/terminal/ghostty-applescript.ts',
      ],
    },
  },
})
