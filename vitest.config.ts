import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'cli/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['server/**/*.ts', 'cli/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'server/dist/**',
        'server/index.ts',
        // Ask-the-Hub embedder paths: the ONNX inference is structurally
        // unreachable in test environments — `@xenova/transformers` is heavy
        // to load and the bundled model file (~118MB) is not present in CI.
        // Tests mock `server/ask/embedder.ts` at the module boundary; this
        // exclusion matches the policy used for Tauri-only paths.
        'server/ask/embedder.ts',
        'server/ask/embedder-worker.ts',
        // Ask-the-Hub answer + spawn-one-shot: spawn a real provider CLI
        // (claude/codex) and stream SSE — structurally unreachable in unit
        // tests. The parsing helpers (`extractEnvelope`, `stripUnresolvedCitations`)
        // and prompt builder are exported and covered by `answer.test.ts`;
        // the actual subprocess lifecycle requires integration tests against
        // a live CLI which are out of scope for the per-module coverage gate.
        'server/ask/answer.ts',
        'server/ask/spawn-one-shot.ts',
        // ask-router POST /query is a long SSE handler that spawns a real
        // provider CLI and streams events — same justification as `answer.ts`.
        // The other endpoints (search / index / history / providers / rating)
        // are tested in `server/ask-router.test.ts`; the SSE happy path needs
        // a live CLI which is an integration concern.
        'server/ask-router.ts',
      ],
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
