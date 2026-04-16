import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __WS_URL__: JSON.stringify('ws://localhost:4200'),
  },
  test: {
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/main.tsx',
        'src/test-setup.ts',
        'src/test-utils.tsx',
        'src/types.ts',
        // Tauri-only component: returns null in non-Tauri (test) environments.
        // Internal sub-components are structurally unreachable in jsdom tests.
        'src/components/TitleBar.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})
