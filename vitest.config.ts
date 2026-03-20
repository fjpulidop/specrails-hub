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
      // Target: 80% per engineering-standards.md §3.2
      // Enforcement activated progressively as coverage improves (currently ~15% stmts)
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
