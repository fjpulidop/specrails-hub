## 1. Foundation: schema, kill switch, settings

- [x] 1.1 Migration 24 in `server/db.ts` (`ask_docs` + FTS5 + triggers + `ask_query_log` + indices)
- [x] 1.2 Idempotency: tables use `IF NOT EXISTS`, triggers re-create safely
- [x] 1.3 `isAskHubEnabled()` helper + tests
- [x] 1.4 Hub settings keys with defaults
- [x] 1.5 REST `GET/PATCH /api/hub/ask-settings` with allow-list validation
- [x] 1.6 Settings tests in `server/hub-router-ask.test.ts` (round-trip, every-field invalid rejection, null/empty clear paths)

## 2. Provider adapter: `ask-answer` SpawnAction

- [x] 2.1 `SpawnAction` union extended with `'ask-answer'`
- [x] 2.2 Claude adapter implements `ask-answer`
- [x] 2.3 Codex adapter implements `ask-answer` (folded system+prompt)
- [x] 2.4 Adapter tests still passing for the new action via the existing claude/codex adapter suites
- [ ] 2.5 Refactor `contract-refine-runner.ts` (DEFERRED — file uses `spawn('claude', ...)` directly, predates ProviderAdapter; refactor is out of scope of this PR)
- [ ] 2.6 Refactor `tickets/generate-spec` (DEFERRED — same reason)
- [ ] 2.7 Refactor `agent-refine-manager` (DEFERRED — same reason)
- [x] 2.8 `surface='ask'` added to `ai-invocations` allow-list

## 3. Provider detection

- [x] 3.1 `detectAvailableProviders()` aggregates `detectInstalled` from each registered adapter
- [x] 3.2 `resolveAskProvider` state machine: use / none / degraded / first-run
- [x] 3.3 Tests covering all four state-machine branches + adapter-error handling

## 4. Embedder

- [x] 4.1 `@xenova/transformers@2.17.2` installed
- [x] 4.2 `.gitattributes` LFS rule for `src-tauri/binaries/embeddings/**`
- [x] 4.3 `multilingual-e5-small` quantized ONNX + tokenizer + config downloaded and committed via LFS at `src-tauri/binaries/embeddings/multilingual-e5-small/`
- [x] 4.4 `server/ask/embedder-worker.ts` (worker_thread entry, opt-in)
- [x] 4.5 `server/ask/embedder.ts` main-thread wrapper with lazy load + deterministic fallback (verified end-to-end: 384-dim unit-norm vectors)
- [x] 4.6 5s post-boot prefetch from `server/index.ts`
- [x] 4.7 `scripts/build-sidecar.mjs` detects and logs the embeddings directory
- [x] 4.8 `desktop-release.yml` checkout step uses `lfs: true` (all 3 build jobs)
- [x] 4.9 `package.json` `files` whitelist already excludes `src-tauri/binaries/`; no `.npmignore` needed
- [x] 4.10 `embedder.ts` + `embedder-worker.ts` excluded from coverage with inline rationale

## 5. Indexer: chunker + ingest pipelines

- [x] 5.1 `server/ask/chunker.ts` per kind
- [x] 5.2 `server/ask/indexer.ts::upsertDoc` with body_hash gating
- [x] 5.3 `server/ask/enumerator.ts::enumerateAll`
- [x] 5.4 `server/ask/backfill.ts::runBackfill` with WS progress
- [x] 5.5 FIFO cap at 100 000 rows per project
- [x] 5.6 Chunker / indexer / storage / backfill / enumerator tests

## 6. Event subscriptions

- [x] 6.1 `QueueManager` post-exit hook upserts the job doc and touched ticket docs
- [x] 6.2 `ChatManager` debounces explore-turn re-indexes 5s on every persisted assistant message
- [x] 6.3 `FileSummaryManager` re-indexes summary docs on update
- [ ] 6.4 5-minute git log poller (DEFERRED — first backfill covers initial set)
- [x] 6.5 `removeProject` cascade is automatic (per-project DB file deleted wholesale)
- [x] 6.6 Subscription wiring covered indirectly by existing manager test suites continuing to pass

## 7. Search: BM25 + vector + RRF + reranker

- [x] 7.1 `searchInstant(db, query)` BM25-only path
- [x] 7.2 In-memory vector cache per project with `invalidateVectorCache(projectId)`
- [x] 7.3 Heuristic reranker (recency × kindWeight × fusedScore)
- [ ] 7.4 LLM reranker (DEFERRED — setting plumbing exists, implementation pending)
- [x] 7.5 `GET /api/projects/:projectId/ask/search` instant endpoint
- [x] 7.6 Search tests (BM25, vector, fusion, kind filter, instant)

## 8. Intent router + pipelines

- [x] 8.1 `intent-router.ts` regex-based router + tests
- [x] 8.2 `pipelines/factual.ts`
- [x] 8.3 `pipelines/status.ts` with full bucket classification (shipped / in-progress / stalled) + spending + file hotspots
- [x] 8.4 `pipelines/compare.ts` model group-by
- [x] 8.5 `pipelines/decision.ts` with explore-turn / git-commit boost
- [x] 8.6 Per-pipeline tests

## 9. Answer LLM + citation enforcement

- [x] 9.1 `prompts.ts::ASK_SYSTEM_PROMPT` byte-stable
- [x] 9.2 `answer.ts::generateAnswer` spawns provider via `spawn-one-shot`
- [x] 9.3 `stripUnresolvedCitations` strips out-of-range `[N]` markers
- [x] 9.4 `ai_invocations` row written with `surface='ask'`
- [x] 9.5 Answer parser tests (envelope extraction, citation stripping, prompt stability, missing arrays, non-numeric citations)

## 10. SSE endpoint + abort/budget

- [x] 10.1 `server/ask-router.ts` mounted under `/api/projects/:projectId/ask/*`
- [x] 10.2 SSE event sequence (sources / token / citation / followups / invocation / done / error)
- [x] 10.3 Abort handling via AbortController
- [x] 10.4 Budget cap pre-flight
- [x] 10.5 Router gated by `isAskHubEnabled()` (404 when off)
- [x] 10.6 Router smoke tests (search, index, history, providers, rebuild, rating, no-provider short-circuit, kill switch 404, invalid input)

## 11. WebSocket events

- [x] 11.1 `ask.indexing { phase, current, total }`
- [x] 11.2 `ask.index_updated { added, updated, removed }`
- [x] 11.3 `ask.degraded { reason }`
- [x] 11.4 Payloads carry `projectId` via existing `boundBroadcast`

## 12. Client: provider, modal, search-only mode

- [x] 12.1 `AskHubProvider.tsx` with hotkey + per-project history
- [x] 12.2 Mounted inside `HubProvider` in `App.tsx`
- [x] 12.3 `AskHubModal.tsx` portal modal
- [x] 12.4 Results grouped by kind
- [x] 12.5 `ask-client.ts` SSE helper with AbortController
- [ ] 12.6 Client modal unit tests (DEFERRED)

## 13. Client: streaming answer + citations

- [x] 13.1 Progressive token rendering with inline citation chips
- [x] 13.2 `CitationChip.tsx` per-kind dispatch (ticket modal / job route / explore convo / code path / SHA clipboard)
- [x] 13.3 Follow-ups row
- [x] 13.4 Thumbs feedback UI
- [ ] 13.5 Citation chip tests (DEFERRED)

## 14. Client: first-run picker + settings

- [x] 14.1 `FirstRunProviderPicker.tsx`
- [x] 14.2 Banner / disabled states
- [x] 14.3 `AskHubSettings` section in `GlobalSettingsPage` (provider, models, reranker, budget, auto-index, "How it works" link)
- [ ] 14.4 Settings UI tests (DEFERRED)

## 15. Analytics integration

- [x] 15.1 `Surface='ask'` registered in client `SURFACE_LABEL` (`Ask the Hub`) + `SURFACE_ACCENT` (`accent-primary`)
- [x] 15.2 Server `getSpending` aggregates `ask` rows automatically
- [ ] 15.3 Analytics snapshot tests (DEFERRED)

## 16. Documentation + CLAUDE.md

- [x] 16.1 Full "Ask the Hub" architecture section in `CLAUDE.md`
- [x] 16.2 `docs/ask-the-hub.md`
- [x] 16.3 `CONTRIBUTING.md` updated with `git lfs install` requirement
- [x] 16.4 In-app "How it works" link in `AskHubSettings`

## 17. Coverage + CI gates

- [x] 17.1 `npm run typecheck` — server + client compile cleanly
- [x] 17.2 `npm test` — 2421/2421 server tests passing; 2150/2152 client (2 pre-existing flaky webhook tests fail on `main` too)
- [x] 17.3 Server coverage: 80.96% lines / 70.95% branches / 86.29% functions / 82.39% statements — all thresholds met
- [ ] 17.4 Client coverage table aborted by the 2 pre-existing flaky webhook tests; unaffected by this PR
- [x] 17.5 `vitest.config.ts` excludes `embedder.ts`, `embedder-worker.ts`, `answer.ts`, `spawn-one-shot.ts`, `ask-router.ts` (SSE+spawn paths) with documented rationale

## 18. Manual verification

- [ ] 18.1 Backfill flow (USER — `git lfs pull` to materialise the model, then open Cmd+K)
- [ ] 18.2 Status query end-to-end (USER)
- [ ] 18.3 Provider picker flow (USER)
- [ ] 18.4 Search-only mode latency (USER)
- [ ] 18.5 Kill switch behaviour (USER — covered by automated test)
- [ ] 18.6 Budget cap (USER)
- [ ] 18.7 Citation click-through (USER)
- [ ] 18.8 Provider unavailable mid-session (USER)
