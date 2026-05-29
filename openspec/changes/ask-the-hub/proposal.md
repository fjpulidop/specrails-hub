## Why

Specrails-hub already captures unique per-project signal that no other tool has access to: ticket specs, Explore conversations, job runs, file provenance, file summaries, contract layers, telemetry, and spending — but today this data is locked behind navigating five different panels. Users cannot quickly answer "why did we add OAuth?", "how is the project going?", or "which tickets touched server/queue-manager.ts?" without manual digging. The hub has the data to become the **memory of your project's AI work**; it just needs a conversational surface.

## What Changes

- New global **Cmd+K modal** that searches and answers natural-language questions about the project (tickets, jobs, conversations, files, commits).
- New per-project **semantic index** stored in the existing per-project SQLite (`ask_docs` + FTS5 + embeddings as BLOB) with hybrid search (BM25 + cosine + Reciprocal Rank Fusion).
- New **local embeddings pipeline** using a bundled `multilingual-e5-small` ONNX model via `@xenova/transformers` running in a worker thread — 100% local, no API keys, no network at runtime.
- New **intent router** that classifies queries (`factual` / `status` / `compare` / `decision` / `search`) and dispatches to specialised pipelines — including an **aggregation pipeline** that answers "how's the project going" using SQL over existing tables (`tickets`, `jobs`, `ai_invocations`, `file_provenance`, `spending`).
- New **answer LLM** path that reuses the existing `ProviderAdapter` abstraction (claude / codex) — provider-agnostic with a first-run picker when both are installed, **opt-out to search-only mode** when neither is installed or the user prefers no AI.
- New REST + SSE surface under `/api/projects/:projectId/ask/*` with streaming sources, tokens, citations, and follow-ups.
- New WebSocket events `ask.indexing`, `ask.index_updated`, `ask.degraded` (all project-scoped).
- New `ai_invocations.surface = 'ask'` row per answer query, surfacing cost on the existing `/analytics` page.
- New `ask_query_log` table per project for thumbs feedback and analytics on the questions themselves.
- New section in `GlobalSettingsPage` (Ask the Hub: provider, answer model, indexing status, reindex, history toggle, hotkey).
- Bundled artifact: `src-tauri/binaries/embeddings/` (~118MB quantized ONNX + tokenizer) shipped with the desktop installer via the existing `scripts/build-sidecar.mjs` pattern.
- Kill switch: `SPECRAILS_ASK_HUB=0` disables the feature server-side; `ask_answer_provider='none'` keeps Cmd+K as a pure-search experience.
- Refactor (oportunistic): introduce `ProviderAdapter.spawnOneShot(...)` consolidating the ad-hoc spawn patterns already duplicated across `contract-refine-runner`, `project-router /tickets/generate-spec`, and `agent-refine-manager`. No behaviour change for those callers.

## Capabilities

### New Capabilities
- `ask-the-hub`: Conversational project memory — Cmd+K modal, hybrid search index, intent router, answer pipelines, citations, history, settings, telemetry of queries themselves.

### Modified Capabilities
- `project-spending`: `ai_invocations.surface` accepts a new value `'ask'`. Existing analytics surfaces (`/analytics` Hero, By Surface, Daily Timeline, raw table, exports) render `'ask'` with a dedicated colour and label without code change in callers, but the spec must document the new surface as a recognised value.

## Impact

**New code**
- `server/ask/` — new directory: `indexer.ts`, `embedder.ts`, `embedder-worker.ts`, `chunker.ts`, `search.ts`, `intent-router.ts`, `pipelines/{factual,status,compare,decision}.ts`, `answer.ts`, `provider-detect.ts`, `prompts.ts`.
- `server/ask-router.ts` — REST + SSE endpoints under `/api/projects/:projectId/ask/*`.
- `client/src/components/ask/` — new directory: `AskHubProvider.tsx`, `AskHubModal.tsx`, `AskResults.tsx`, `AskAnswerStream.tsx`, `CitationChip.tsx`, `FirstRunProviderPicker.tsx`.
- `client/src/lib/ask-client.ts` — SSE helper + fetch wrappers.

**Modified code**
- `server/db.ts` — migration 23: `ask_docs`, `ask_docs_fts` (FTS5), `ask_query_log`.
- `server/queue-manager.ts` — post-exit hook enqueues a re-index for `tickets[]` and `file_provenance` rows touched by the job.
- `server/chat-manager.ts` — post-turn hook for `kind='explore'` conversations enqueues a re-index of the (user, assistant) pair.
- `server/file-summary-manager.ts` — emits an event consumed by the indexer to upsert summary docs.
- `server/ai-invocations.ts` — `surface` column accepts `'ask'`.
- `server/providers/types.ts` — adds `spawnOneShot(opts)` to `ProviderAdapter`.
- `server/providers/claude-adapter.ts` and `server/providers/codex-adapter.ts` — implement `spawnOneShot`.
- `server/contract-refine-runner.ts`, `server/project-router.ts` (`/tickets/generate-spec`), `server/agent-refine-manager.ts` — refactor existing spawn ad-hoc to use `spawnOneShot` (no behaviour change).
- `server/project-registry.ts` — on `removeProject`, drop `ask_docs*` rows (cascade via per-project DB delete already covers this; explicit no-op).
- `server/index.ts` — mount `ask-router`; schedule 5s post-boot prefetch of the embedder worker.
- `client/src/App.tsx` — mount `AskHubProvider` (global Cmd+K listener) inside `HubProvider`.
- `client/src/pages/GlobalSettingsPage.tsx` — new "Ask the Hub" section.
- `client/src/pages/AnalyticsPage.tsx` + components — register `'ask'` surface in the colour/label mapping (uses `accent-primary`).

**Bundled artifacts**
- `src-tauri/binaries/embeddings/{model.onnx, tokenizer.json, config.json}` (~118MB total).
- `scripts/build-sidecar.mjs` — extend to copy the `embeddings/` directory under `src-tauri/binaries/`.

**New dependency**
- `@xenova/transformers` (server-only, pure JS + WASM, no native compile).

**Configuration surface**
- Hub settings (`hub_settings` key/value): `ask_answer_provider` (`'claude'|'codex'|'none'`), `ask_answer_model_claude`, `ask_answer_model_codex`, `ask_reranker` (`'llm'|'heuristic'|'none'`), `ask_auto_index_on_first_open` (boolean), `ask_hotkey` (string), `ask_monthly_budget_usd` (number, default 5).
- Env kill switch: `SPECRAILS_ASK_HUB` (`'0'|'false'|'off'` disables entire feature, returns 404 from the router and unmounts the client provider).
- Reserved paths (hub-managed only, none in the user project): `~/.specrails/projects/<slug>/jobs.sqlite` (new tables).

**WebSocket events** (project-scoped via `boundBroadcast`)
- `ask.indexing` `{phase, current, total}`
- `ask.index_updated` `{added, removed}`
- `ask.degraded` `{reason}`

**Tests**
- Server: `server/ask/*.test.ts` covering chunker, embedder (mocked), search (BM25 + vector + RRF), intent router, each pipeline, citation parser, SSE streaming, provider detection, kill switch, migration 23 idempotency.
- Client: `client/src/components/ask/*.test.tsx` for modal, results, streaming render, citation click-through, first-run picker, search-only mode, settings panel.
- Coverage: must continue to meet the project's mandatory thresholds (70% global, 80% server lines/functions/statements, 70% server branches, 80% client lines/statements, 70% client functions). New code is held to those gates.

**Out of scope**
- Voice input (Whisper) — deferred.
- Cross-project search — toggle exists in design but defaults off; per-project only in v1.
- Multi-language UI — answer LLM responds in the question's language but settings stay in English/Spanish only.
- Agentic deep-ask tools — design contemplates them but the v1 scope ships pipelines only (factual / status / compare / decision).
- Server-managed re-embedding when the bundled model upgrades — manual "Reindex" button only in v1.
- Sharing answer permalinks.
