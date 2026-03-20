import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'cli/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['server/**/*.ts', 'cli/**/*.ts'],
      exclude: ['**/*.test.ts', 'server/dist/**', 'server/index.ts'],
      // Global: 70% lines/functions (SPEA-380 target); branches excluded from global
      // because CLI has complex runtime code (HTTP/WebSocket/spawn) requiring integration tests
      // Server: 80% per engineering-standards.md §3.2
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        'server/**': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 70,
        },
      },
    },
  },
})
