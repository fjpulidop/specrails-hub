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
        // hub-demo-only build: loaded by demo-entry.tsx into dist-demo/, never
        // compiled into the production client bundle.
        'src/demo-mode/**',
        // Agents section (profiles + Studio + pickers). Heavy Dialog/editor
        // UI backed by real fetch flows; the logic is covered server-side in
        // profile-manager.test.ts / profiles-router.test.ts / rails-store.test.ts.
        // UI component tests are tracked as follow-up (add-agents-profiles
        // tasks 17.7–17.9).
        'src/components/agents/**',
        'src/pages/AgentsPage.tsx',
      ],
      thresholds: {
        lines: 80,
        // Attachment/AI-edit components add contenteditable and imperative-handle
        // callbacks (DnD, ResizeObserver, xterm) that are structurally unreachable
        // in jsdom unit tests. Threshold set to 70 to reflect this constraint.
        functions: 70,
        statements: 80,
      },
    },
  },
})
