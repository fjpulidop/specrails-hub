## Context

Specrails-hub stores everything the user's AI work produces — tickets, Explore conversations, jobs, file provenance, file summaries, contract layers, OTEL telemetry, spending — across a per-project SQLite database and a small filesystem cache. This data is the hub's unique strategic asset: no other tool has it. Today it is only reachable through navigating the dashboard.

The introduction of "Ask the Hub" must respect every existing constraint that has shaped the codebase so far:

- **Local-first, zero external services at runtime.** No new API keys; no telemetry to third parties; embeddings ship with the desktop installer.
- **Provider-agnostic.** Every existing manager that spawns an AI CLI consumes the `ProviderAdapter` contract — never branches on `provider === 'X'`. Ask must follow the same rule.
- **Per-project isolation.** Each project has its own SQLite, queue manager, chat manager, ai_invocations. Ask data lives in the same place; cross-project search is opt-in and off by default.
- **Coverage policy.** 70% global / 80% server lines+functions+statements / 70% server branches / 80% client lines+statements / 70% client functions. New code is held to those gates with no thresholds lowered.
- **Reserved-paths contract with specrails-core.** Nothing new under the user's working tree. All Ask state lives in `~/.specrails/projects/<slug>/jobs.sqlite` (new tables) and the bundled binary directory.

The existing `ai_invocations` table, `spending.ts` aggregator, `ProviderAdapter` registry, `file-summary-manager` chokidar pipeline, `path-resolver` GUI-launch logic, and `boundBroadcast` per-project WebSocket pattern are reused verbatim. The desktop bundling pipeline (`scripts/build-sidecar.mjs`, the `node-pty`/`pty.node` external-copy pattern, `APPLE_SIGNING_IDENTITY` codesigning) gives us a proven path for shipping the embedding model.

## Goals / Non-Goals

**Goals:**
- A single global Cmd+K modal in the hub that answers natural-language questions about the active project in under ~3 seconds total (sub-50 ms for the search-only path).
- Hybrid retrieval — BM25 (FTS5) + cosine over local embeddings + Reciprocal Rank Fusion — over all dense semantic content: tickets, explore turns, jobs, file summaries, recent git commits.
- Aggregation pipeline that answers "how is the project going?" using SQL over `tickets`, `jobs`, `ai_invocations`, `file_provenance`, and `git` — not retrieval.
- Provider-agnostic answer LLM. Users with only Codex installed get a fully functional product; users with both pick at first run; users with neither still get useful search.
- 100% local at runtime. The embedding model is bundled. No new API key, no new network endpoint hit during normal operation.
- Coverage parity with the rest of the codebase (no exemptions to global / server / client thresholds).
- Reusable provider plumbing: a `ProviderAdapter.spawnOneShot` method that consolidates the three existing ad-hoc one-shot spawn sites without changing their behaviour.

**Non-Goals:**
- Voice input, mobile companion, embedding fine-tuning, agentic deep-ask tools, multi-tab agent reasoning. Deferred.
- Hub-wide cross-project search by default. The setting exists but is off in v1.
- Answer permalinks / sharing.
- Auto re-embedding on bundled-model upgrade. Manual "Reindex" only.
- Replacing existing surfaces (Analytics, SpecsBoard, JobDetail). Ask augments; it does not subsume.
- Editing indexed documents from the modal.

## Decisions

### D1. Embeddings: bundled `multilingual-e5-small` via `@xenova/transformers`

**Decision:** Bundle a quantized `intfloat/multilingual-e5-small` ONNX model (~118 MB on disk) in `src-tauri/binaries/embeddings/`, load via `@xenova/transformers` running in a `worker_thread`, output 384-dim float32 vectors normalized to unit length.

**Why over alternatives:**
- vs `voyage-3-lite` / `text-embedding-3-small` (cloud): violates "no external services, no new API keys" constraint.
- vs `nomic-embed-text` via Ollama: forces user to install Ollama. Hub install must be zero-friction.
- vs `onnxruntime-node` (native binaries): introduces per-platform native compile pain. WASM via `@xenova/transformers` is one path for macOS / Windows / Linux at the cost of ~4× slower throughput, which is irrelevant at our scale (a project with 5 000 docs backfills in ~100 s, single time).
- vs `all-MiniLM-L6-v2`: English-only. Most of this project's tickets and conversations are in Spanish — multilingual is non-negotiable.
- vs unquantized e5-small: ~471 MB vs ~118 MB. Quality difference is < 1% on retrieval benchmarks; bundle size matters.

**Throughput target on Apple Silicon (M-series):** ~50 docs/s in WASM for short chunks (under 256 tokens). Worker-thread loaded lazily, prefetched 5 s post-boot to avoid blocking the event loop.

### D2. Vector storage: BLOB in existing SQLite, JS cosine, no `sqlite-vec`

**Decision:** Store each embedding as `BLOB` (`Float32Array(384).buffer`, 1 536 bytes) in a new `ask_docs` table inside the per-project `jobs.sqlite`. Add an FTS5 virtual table `ask_docs_fts` as the keyword sidecar. Cosine similarity is computed in JavaScript on demand, over a hot in-memory cache keyed by `projectId`.

**Why over `sqlite-vec`:**
- `sqlite-vec` requires bundling a platform-specific shared library (`.dylib` / `.dll` / `.so`). We already pay this complexity tax for `pty.node`; adding another increases surface area for platform bugs.
- At our scale (target ceiling: 50 000 docs per project), naive JS dot-product over a single `Float32Array` is ~25 ms for 50 k docs and ~5 ms for 10 k. That is well inside our 3 s answer latency budget.
- Migration to `sqlite-vec` later is mechanical (same BLOB column, swap the search function); no schema breakage.

**Indices:** `(kind)`, `(ticket_id)`, `(ts DESC)`, plus the FTS5 sidecar.

### D3. Hybrid search: BM25 + cosine, fused with Reciprocal Rank Fusion (RRF)

**Decision:** For each query, run BM25 (FTS5 `MATCH`) for top 50 and cosine over the in-memory vector cache for top 50. Fuse with RRF (`score = Σ 1 / (60 + rank_i)`), take top 20. Optionally rerank with a Haiku-tier LLM call (setting `ask_reranker`, defaults to `'heuristic'` — recency × kind weight × score — to avoid extra LLM cost). Pass top 8 to the answer LLM.

**Why:** Pure-vector search loses on exact identifier queries ("ticket #142", "server/queue-manager.ts"). Pure-BM25 loses on semantic queries ("auth bug" ⇄ "session error"). RRF is parameter-light and well-studied; no learning required. Heuristic rerank is free and good enough for v1.

### D4. Answer LLM via `ProviderAdapter.spawnOneShot`, never via SDK

**Decision:** No new HTTP client to Anthropic/OpenAI. Reuse the existing `ProviderAdapter` (`server/providers/`) by adding a `spawnOneShot(opts)` method that spawns the project provider's CLI (`claude -p ... --max-turns 1 --model haiku` or `codex exec ... --model gpt-4o-mini`) with `--output-format stream-json` (Claude) or its Codex equivalent, parses the stream, and returns `{stdoutStream, exitPromise}`.

**Why over Anthropic SDK direct:**
- Zero new API keys. The user already has one CLI authenticated; reuse it.
- Same parser path as `claude` / `codex` everywhere else in the hub. Bug fixes converge.
- `nativeCostUsd: false` on Codex is already handled by `pricing.ts`; no new logic.

**Cost capture:** every Ask answer writes one row to `ai_invocations` with `surface='ask'`, `conversation_id=null`, `ticket_id=null`, and full token / cost / duration data via `finaliseInvocationResult`. `spending.ts` already aggregates by surface — `'ask'` shows up automatically.

**Refactor side-effect:** `contract-refine-runner.ts`, `project-router /tickets/generate-spec`, and `agent-refine-manager.ts` adopt `spawnOneShot` and drop their inline spawn code. This is mechanical and ships with the change; behaviour is identical.

### D5. Provider selection: first-run picker, hub-wide setting, opt-out to search-only

**Decision:** On hub boot, call `provider-detect.ts::detectAvailableProviders()` (which wraps existing `setup-prerequisites` logic). State machine:

- 0 providers available → `ask_answer_provider = 'none'`; banner in modal "Install Claude or Codex to enable AI answers".
- 1 provider available, setting empty → silently set to that provider.
- 2 providers available, setting empty → render `FirstRunProviderPicker` inside the Cmd+K modal the **first time** it is opened. Three options: Claude, Codex, Search only. Choice persists to `hub_settings.ask_answer_provider`.
- Setting present → use it. Re-evaluate on every modal open; if the configured provider has become unavailable, show a `Provider unavailable` banner and fall back to search-only for that session (do not auto-rewrite the setting — user intent is preserved).

**Per-project override:** Out of scope for v1. The answer LLM only synthesises sources; provider affinity with the project is irrelevant.

### D6. Intent router: regex-first, LLM fallback

**Decision:** Heuristics-first router (`server/ask/intent-router.ts`) keyed on a small set of Spanish/English phrases:

- `/\b(c[oó]mo va|resumen|summary|status|esta semana|últimos? \d+ d[ií]as|how is|how's)\b/i` → `status`
- `/\b(por qu[eé]|why did|decisi[oó]n|chose|eligi[oó])\b/i` → `decision`
- `/\b(vs|comparado|versus|evoluci[oó]n|differ|compare)\b/i` → `compare`
- otherwise → `factual` (which subsumes "search" in v1; the UI exposes "Search only" via `Cmd+⏎` rather than as a routed intent).

If no regex matches **and** an answer provider is configured, the router optionally calls Haiku with a 1-shot classification prompt (50 tokens, ~$0.0005). Default off (`ask_intent_router_llm_fallback = false`) — heuristics-only is the v1 shipped path. The LLM-fallback path exists for instrumentation and future tuning.

**Why:** Regex is free, deterministic, debuggable, and covers the long tail well enough for v1. The LLM fallback exists as a switch we can flip after we collect query logs.

### D7. Aggregation pipeline (status / compare)

**Decision:** For `intent='status'` (and analogous for `compare`), bypass retrieval entirely. Run a small set of parameterised SQL queries against the per-project DB in parallel:

- shipped this period: `SELECT * FROM tickets WHERE status='done' AND updated_at >= ?`
- in progress: same with status filter
- stalled: `updated_at < ? AND status NOT IN ('done','draft')`
- jobs run / failed: `SELECT status, COUNT(*) FROM jobs WHERE finished_at >= ? GROUP BY status`
- spending: reuse `spending.ts::getSpending(db, projectId, filters)` (already exists, already authoritative)
- file hotspots: `SELECT file_path, COUNT(*) FROM file_provenance WHERE at >= ? GROUP BY file_path ORDER BY 2 DESC LIMIT 5`
- profile mix: `SELECT profile_name, COUNT(*) FROM job_profiles WHERE finished_at >= ? GROUP BY profile_name`
- git activity: `simple-git` cap 6 months

Pack into a ~500-token structured context, pass to the answer LLM with a prompt that demands prose + cited ticket / job IDs.

**Why:** Retrieval cannot answer aggregation questions. Without this pipeline the feature would feel "stupid" on the most demo-able query. SQL is cheap, deterministic, and citeable.

### D8. Indexing pipeline: event-driven incremental + backfill

**Decision:** A small `Indexer` module subscribes to in-process events emitted by `QueueManager` (post-exit, `tickets[]` + `file_provenance` rows), `ChatManager` (post-turn for `kind='explore'`, debounced 5 s), `FileSummaryManager` (post-update). Each event upserts the relevant doc(s) — chunking, hashing the body (sha256), comparing to the stored `body_hash`, embedding only when the hash differs.

**Backfill** runs on first modal open per project (or via the `POST /ask/index/rebuild` endpoint). Enumerates all sources, chunks, embeds in batches of 100, persists, broadcasts `ask.indexing` progress every 5%.

**Git commit ingestion** runs at backfill and every 5 minutes via a lightweight poller (cap 6 months of history) — git events are not on the in-process bus.

**Invalidation key:** `body_hash`. Schema upgrade (new embedding model in the future) bumps `schema_version`; mismatch triggers a full re-embed. Not used in v1 because the model is fixed at bundle time.

### D9. Streaming SSE for the answer endpoint

**Decision:** `POST /api/projects/:projectId/ask/query` returns `text/event-stream`. Events:

- `event: sources` — JSON of ranked sources (top 8, with kind/id/title/preview).
- `event: token` — streamed answer delta (plain text chunk).
- `event: citation` — `{n, sourceIdx}` as the LLM emits `[N]` markers (resolved server-side against the sources list).
- `event: followups` — array of 3 suggested next questions.
- `event: invocation` — `{model, cost, turns, durationMs}` for analytics display.
- `event: done` — terminal.

`AbortController` on the client cancels mid-stream; the server kills the spawned CLI.

**Why SSE over WS:** the existing `/ws` is per-hub, broadcast-style, and not request-scoped. SSE keeps the lifecycle simple (1 stream per query) and lets `EventSource` / `fetch` body iteration on the client handle backpressure naturally.

### D10. Client architecture: `AskHubProvider` at the App root

**Decision:** A new context (`AskHubProvider`) mounts at the `App.tsx` root inside `HubProvider`. It owns:

- The global Cmd+K listener (configurable via `ask_hotkey` setting; `Esc` to close).
- The modal's open/closed state.
- The current query, debounced search results, streaming answer buffer, citations.
- Query history (`localStorage['specrails-hub:ask-history:<projectId>']`, last 20).
- A guard against the modal opening when a `[role="dialog"]` is already active (same pattern as the terminal `Cmd+J`).

The modal itself is `client/src/components/ask/AskHubModal.tsx`, rendered via portal directly into `document.body` to avoid z-index fights with the existing `SplitViewShell` and minimisable-chat toasts.

### D11. Citation chips: source-typed, click-through opens existing modals

**Decision:** Each citation `[N]` rendered in the answer is a `<CitationChip>` button. Clicking dispatches based on source kind:

- `ticket` → `TicketDetailModalProvider.openTicketDetail(id)`
- `job` → `navigate(/jobs/<id>)`
- `explore-turn` → `navigate(/specs?conversation=<id>)` and scroll to turn N
- `file-summary` → `navigate(/code?path=<rel>)` (Code Explorer)
- `git-commit` → external link to GitHub if remote configured, else copy SHA to clipboard

No new routes; reuse existing surfaces.

### D12. Bundle the embedding model via existing sidecar pipeline

**Decision:** Add `src-tauri/binaries/embeddings/{model.onnx, tokenizer.json, config.json}` to the repo via Git LFS (the model file is ~118 MB and exceeds GitHub's 100 MB hard cap on regular files). `.gitattributes` rules added; CI runners need `git lfs install`. The desktop release workflow already has access tokens; the npm release workflow does not download LFS files but does not need the model (server-only npm package excludes the binary directory via `.npmignore`).

`scripts/build-sidecar.mjs` is extended to copy `embeddings/` exactly like `node-pty/`. The runtime resolver in `server/ask/embedder.ts` looks up the path via `path.resolve(process.execPath, '..', 'embeddings')` for the packaged build, falling back to `node_modules/@xenova/transformers/...cache` for `npm run dev`.

**Why Git LFS over auto-download:** auto-downloading the model on first run breaks the "100% local, zero network" promise and adds a failure mode (corporate firewalls, offline installs). LFS is the cheapest way to ship a 118 MB blob with the source.

### D13. Kill switch granularity

**Decision:** Three layers, increasingly aggressive:

- `SPECRAILS_ASK_HUB=0|false|off` (env) → `ask-router` returns 404 to every endpoint; client provider unmounts; embedder worker not spawned. Used by ops to disable the feature wholesale.
- `hub_settings.ask_answer_provider = 'none'` → search-only mode. Index still maintained; Cmd+K still useful; no LLM ever spawned.
- `ask_monthly_budget_usd` exceeded → answer endpoint returns 429 with `reason='budget'`; search endpoint unaffected. UI surfaces a single toast and disables the "Ask AI" affordance until next month.

### D14. Coverage strategy for the new code

**Decision:** Server tests use `:memory:` SQLite (existing pattern) and a stub `ProviderAdapter` that returns a canned token stream. The embedder worker is mocked at the module boundary so tests do not load the ONNX model. Client tests cover the modal, results list, streaming render, citation click-through, first-run picker, settings, and search-only path. Coverage adds in line with the existing 80% / 70% targets; no exclusions added in `vitest.config.ts` or `client/vitest.config.ts`.

The bundled model directory and the embedder worker's ONNX inference path are excluded from coverage (structurally unreachable in jsdom / `:memory:` test environments) and documented inline next to the exclusion entries — same policy already used for Tauri-only paths.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 118 MB model bloats the installer / repo. | LFS for the model; `.npmignore` for the npm package; surface size in release notes. Future change can swap to a smaller model (e.g. `bge-micro-v2` at 17 MB) if bundle size complaints arrive. |
| WASM embedding is slow on cold start (~500 ms first inference). | Worker-thread prefetch 5 s post-boot; UI shows a `Calentando…` toast only if a query lands inside the warmup window. Backfill is async with progress bar. |
| FTS5 + cosine in JS does not scale past ~50 k docs per project. | Cap `ask_docs` at 100 k per project with a FIFO sweep of oldest non-ticket docs; log a warning at 50 k. Migrate to `sqlite-vec` if a real user hits the ceiling. |
| LLM hallucinates citations or fabricates sources. | Cite-mandatory prompt + server-side parser that strips unresolved `[N]` markers and tags claims without citations as `uncited` in the rendered output. Per-query thumbs feedback feeds future prompt tuning. |
| Provider CLI crashes mid-stream. | `AbortController` on client; server propagates `event: error` and writes a failed `ai_invocations` row. UI shows a retry button with the same query pre-filled. |
| `multilingual-e5-small` is not multilingual *enough* for the user's language (e.g. Galician, Catalan). | Setting `ask_embedding_quality_threshold` (future) and the explicit "Reindex" button let advanced users swap the model in `src-tauri/binaries/embeddings/` manually. Document the swap procedure in `docs/ask-the-hub.md`. v1 ships e5-small only. |
| Indexing-on-event creates write-amplification on busy projects. | Debounce explore turns at 5 s; batch ticket/job upserts via a 1 s in-memory queue; cap embedding worker to one in-flight batch at a time. |
| First-run picker confuses users with only one provider. | First-run picker only shows when ≥2 providers are detected; silent auto-pick when 1; banner-only when 0. |
| `simple-git` is heavy. | Lightweight `git log --pretty=format:... --since=6.months -n 1000` invoked once per backfill and once per 5-minute poll; cap on results. No working-tree status reads. |
| LFS adoption complicates CI. | Document `git lfs install` in `CONTRIBUTING.md`; ensure the desktop-release workflow uses `actions/checkout@v4` with `lfs: true`. CI for non-desktop jobs does not need the model (server unit tests mock the embedder); add `lfs: false` to the CI workflow to keep PR checkout fast. |
| Cmd+K conflict with browser / Tauri webview. | Setting `ask_hotkey` lets the user rebind. Default to `Cmd+K` (mac) / `Ctrl+K` (win+linux). Guard against active dialogs identical to the terminal pattern. |
| ContractRefine / generate-spec refactor breaks an existing flow. | Refactor uses `spawnOneShot` as a thin wrapper around the existing spawn logic; tests assert identical CLI argv and identical stream parsing. Roll out behind no flag — pure mechanical extraction. |

## Migration Plan

This change is purely additive at the data layer; no destructive migrations.

1. **Database migration (per-project SQLite).** Migration 23 adds `ask_docs`, `ask_docs_fts`, `ask_query_log`. `ai_invocations.surface` already accepts strings — no schema change there; only the spec for `project-spending` is updated to list `'ask'` as a recognised surface.
2. **Bundle the model.** `src-tauri/binaries/embeddings/` committed via LFS; `scripts/build-sidecar.mjs` updated; desktop-release workflow updated to checkout with LFS.
3. **Roll out behind kill switch.** `SPECRAILS_ASK_HUB` defaults unset (= enabled). For the initial release, the README documents how to set it to `0` for users who want to opt out wholesale.
4. **Client mount.** `AskHubProvider` mounted unconditionally inside `HubProvider`; renders nothing when the env disables it.
5. **First-run UX.** When the modal opens for the first time with no `ask_answer_provider` setting, render the picker. No upfront onboarding step.
6. **Backfill.** Lazy — only when the user opens Cmd+K for the first time in a given project. Users who never open it never pay the indexing cost.
7. **Refactor of one-shot spawns.** Lands in the same PR as the new provider method, behind tests that assert argv equality with the previous implementation.

**Rollback:**
- Operations: set `SPECRAILS_ASK_HUB=0` in the hub env; restart. Feature disappears; data untouched.
- Code: revert the PR. `ask_docs*` tables remain on disk (additive migration); next deploy reads them as orphans and is unaffected.
- Bundle: an installer without the `embeddings/` directory still boots — the embedder fails to load and the feature degrades to search-only (BM25-only, which still works since FTS5 ships with SQLite).

## Open Questions

- **Should the index follow the user across machines?** Today `~/.specrails/projects/<slug>/jobs.sqlite` is local. If users sync `~/.specrails/` via iCloud / Dropbox we should ensure the embedding BLOBs are platform-stable (they are — float32 little-endian + same model). No action needed in v1 but worth a docs callout.
- **Embed git commit *diffs* or just commit subjects?** v1: subject + body only (cheap, sufficient). v2: optional `--include-diffs` setting if users request "what changed in auth.ts last month?" and discover the subjects aren't enough.
- **Should the answer LLM choice fall back to `claude` when set to `'codex'` but the project's provider is also Claude?** No — the user's explicit setting wins. Documented behaviour, not a bug.
- **Should we expose the intent classifier output to the user?** Hidden in v1; surface only in the `ask_query_log` row for analytics. If users report wrong-pipeline behaviour we can add a small breadcrumb (`Intent: status →`) under the question echo.
