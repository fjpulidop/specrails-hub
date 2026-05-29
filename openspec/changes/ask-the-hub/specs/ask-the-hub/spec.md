## ADDED Requirements

### Requirement: Feature kill switch
The system SHALL honour the `SPECRAILS_ASK_HUB` environment variable as a hard kill switch for the entire Ask-the-Hub feature.

#### Scenario: Kill switch off disables all server routes
- **WHEN** the server is started with `SPECRAILS_ASK_HUB=0` (or `false` / `off`, case-insensitive)
- **THEN** every endpoint mounted under `/api/projects/:projectId/ask/*` MUST respond with HTTP 404
- **AND** the embedder worker thread MUST NOT be spawned
- **AND** the indexer MUST NOT subscribe to any in-process events

#### Scenario: Kill switch off hides the client modal
- **WHEN** the hub client receives a kill-switch-on response from the server bootstrap
- **THEN** the global Cmd+K listener MUST NOT be registered
- **AND** the `AskHubProvider` MUST render no portal or modal

#### Scenario: Default state is enabled
- **WHEN** no `SPECRAILS_ASK_HUB` value is set
- **THEN** the feature MUST be active

### Requirement: Per-project index schema
The system SHALL create a per-project semantic index in the existing `jobs.sqlite` via a new migration that adds the `ask_docs`, `ask_docs_fts` (FTS5), and `ask_query_log` tables.

#### Scenario: Migration creates required tables
- **WHEN** a project's database is migrated to the latest schema version with the feature enabled
- **THEN** `ask_docs` MUST exist with columns `rowid`, `kind`, `source_id`, `ticket_id`, `job_id`, `conversation_id`, `file_path`, `title`, `body`, `body_hash`, `ts`, `model`, `schema_version`, `embedding`
- **AND** `ask_docs_fts` MUST exist as an FTS5 virtual table over `(title, body)` with `content='ask_docs_meta'` semantics
- **AND** `ask_query_log` MUST exist with columns for `query`, `scope`, `model`, `intent`, `sources_count`, `cost_usd`, `latency_ms`, `rated`, `ts`
- **AND** indices on `(kind)`, `(ticket_id)`, `(ts DESC)` MUST be present.

#### Scenario: Migration is additive and idempotent
- **WHEN** the migration is run against a database that already has it applied
- **THEN** no error MUST be raised
- **AND** no existing rows in any other table MUST be modified.

### Requirement: Local-only embedding model
The system SHALL embed text using the bundled `multilingual-e5-small` ONNX model executed via `@xenova/transformers` in a `worker_thread`, with no network call at runtime.

#### Scenario: Embedder produces a 384-dim unit-norm float32 vector
- **WHEN** the embedder is invoked with a non-empty string
- **THEN** it MUST return a `Float32Array` of length 384
- **AND** the L2 norm of the returned vector MUST be 1.0 within a tolerance of 1e-5.

#### Scenario: Embedder does not perform network I/O
- **WHEN** any embedding is computed
- **THEN** no outbound HTTP / DNS request MUST be made
- **AND** the model files MUST be loaded exclusively from `src-tauri/binaries/embeddings/` in packaged builds or the local `@xenova/transformers` cache in dev.

#### Scenario: Embedder is lazy-loaded with post-boot prefetch
- **WHEN** the server boots with the feature enabled
- **THEN** the embedder worker MUST NOT block server startup
- **AND** a prefetch MUST be scheduled approximately 5 seconds after `app.listen` completes.

### Requirement: Hybrid search with BM25, vector cosine, and RRF
The system SHALL execute every `factual` or `decision` query via hybrid retrieval over the per-project index, fusing BM25 and vector results with Reciprocal Rank Fusion before reranking.

#### Scenario: BM25 + cosine + RRF returns top 20 candidates
- **WHEN** a user submits a query
- **THEN** the search pipeline MUST first compute the top 50 BM25 matches via FTS5
- **AND** the top 50 cosine matches over the in-memory vector cache
- **AND** combine them with `score = Σ 1 / (60 + rank_i)` to produce a ranked list of at most 20 candidates.

#### Scenario: Heuristic reranker is the default
- **WHEN** `ask_reranker` is set to `'heuristic'` (the default) or is unset
- **THEN** the top 20 candidates MUST be reranked by a deterministic local function combining recency, kind weight, and fused score
- **AND** no LLM call MUST be made for reranking.

#### Scenario: Exact identifier query wins via BM25
- **WHEN** a query contains a string matching a ticket ID, file path, or commit SHA present in the index
- **THEN** that document MUST appear in the top 3 results.

### Requirement: Intent router
The system SHALL classify every query into one of `factual`, `status`, `compare`, `decision`, or `search` and dispatch to the matching pipeline.

#### Scenario: Status query routes to aggregation
- **WHEN** a query matches the status regex (e.g. contains `cómo va`, `resumen`, `status`, `this week`)
- **THEN** the router MUST classify it as `status`
- **AND** the aggregation pipeline MUST be invoked instead of retrieval.

#### Scenario: Default classification is factual
- **WHEN** a query matches none of the heuristic patterns and the LLM fallback is disabled
- **THEN** the router MUST classify it as `factual`.

#### Scenario: Classification persisted in query log
- **WHEN** any query completes (success or failure)
- **THEN** a row MUST be written to `ask_query_log` with the resolved `intent` value.

### Requirement: Aggregation pipeline for status queries
The system SHALL answer `status` queries by composing context from SQL aggregates over `tickets`, `jobs`, `ai_invocations`, `file_provenance`, `job_profiles`, and `git` history — without invoking retrieval.

#### Scenario: Status query produces aggregated context
- **WHEN** a `status` query for the current week is processed
- **THEN** the pipeline MUST execute queries for shipped tickets, in-progress tickets, stalled tickets, jobs run/failed, weekly spending (via `getSpending`), file hotspots (top 5), profile mix, and recent git activity
- **AND** the combined context passed to the answer LLM MUST be under 2000 tokens.

#### Scenario: Status answer cites real ticket and job IDs
- **WHEN** the LLM produces the answer
- **THEN** every numerical claim about ticket counts, costs, or job outcomes MUST be backed by a citation referencing a real source ID present in the aggregated context.

### Requirement: Provider-agnostic answer LLM
The system SHALL produce natural-language answers by spawning the user's configured AI CLI (Claude or Codex) via the existing `ProviderAdapter` contract, never via a direct SDK or HTTP client.

#### Scenario: Answer LLM uses `ProviderAdapter.spawnOneShot`
- **WHEN** an `ask` query needs an LLM-generated answer
- **THEN** the server MUST resolve the configured provider via `hub_settings.ask_answer_provider`
- **AND** call `ProviderAdapter.spawnOneShot` with the system prompt, sources, and configured model
- **AND** never construct an `anthropic` or `openai` HTTP request.

#### Scenario: Cost is recorded as a new `ai_invocations` row
- **WHEN** a successful answer is emitted
- **THEN** one row MUST be written to `ai_invocations` with `surface='ask'`, `status='success'`, `conversation_id=null`, `ticket_id=null`, and the cost/turn/duration fields populated from the spawn result.

### Requirement: First-run provider picker
The system SHALL prompt the user to pick an answer provider the first time the Cmd+K modal is opened, but only when both Claude and Codex CLIs are detected on PATH.

#### Scenario: Two providers available shows the picker
- **WHEN** the modal is opened, `ask_answer_provider` is unset, and both providers are detected
- **THEN** the modal MUST render a `FirstRunProviderPicker` with the three options Claude / Codex / Search only
- **AND** the user's choice MUST persist to `hub_settings.ask_answer_provider`.

#### Scenario: One provider available auto-selects silently
- **WHEN** the modal is opened, `ask_answer_provider` is unset, and exactly one provider is detected
- **THEN** the setting MUST be set automatically to that provider
- **AND** no picker MUST be shown.

#### Scenario: No provider available shows search-only mode
- **WHEN** the modal is opened, `ask_answer_provider` is unset, and no provider is detected
- **THEN** the setting MUST be set to `'none'`
- **AND** the modal MUST render an install-CTA banner.

### Requirement: Search-only mode (opt-out from AI answers)
The system SHALL keep the Cmd+K modal fully functional as a hybrid search experience when no AI answer provider is available or selected.

#### Scenario: Cmd+K with `ask_answer_provider='none'`
- **WHEN** the user opens Cmd+K and `ask_answer_provider='none'`
- **THEN** typing MUST stream hybrid search results within 100 ms p95
- **AND** no LLM CLI MUST be spawned at any point
- **AND** the modal MUST show source results grouped by kind (tickets, conversations, files, commits).

#### Scenario: Modal stays useful when provider becomes unavailable mid-session
- **WHEN** the configured provider CLI is no longer present on PATH at query time
- **THEN** the server MUST respond with a `degraded` indicator
- **AND** the client MUST surface a banner without overwriting the persisted setting
- **AND** searches MUST continue to work.

### Requirement: REST + SSE answer endpoint
The system SHALL expose `POST /api/projects/:projectId/ask/query` as a Server-Sent-Events endpoint that streams `sources`, `token`, `citation`, `followups`, `invocation`, and `done` events.

#### Scenario: SSE stream emits the documented events in order
- **WHEN** a client posts a valid query
- **THEN** the server MUST emit at most one `sources` event before any `token` events
- **AND** every `token` event MUST be a UTF-8 string chunk of the answer
- **AND** every `citation` event MUST reference an `n` whose `sourceIdx` exists in the previously emitted `sources` payload
- **AND** the stream MUST terminate with exactly one `done` event.

#### Scenario: Client cancels stream
- **WHEN** the client aborts the HTTP request mid-stream
- **THEN** the server MUST terminate the spawned provider CLI within 1 second
- **AND** the partial `ai_invocations` row MUST be written with `status='aborted'`.

#### Scenario: Provider crash propagates as error event
- **WHEN** the provider CLI exits with non-zero before emitting a `result`
- **THEN** the server MUST emit `event: error` with a structured reason
- **AND** write an `ai_invocations` row with `status='failed'`.

### Requirement: Citation enforcement
The system SHALL enforce that every numeric or factual claim in the answer is backed by a `[N]` citation referencing a real source.

#### Scenario: Unresolved citation is stripped
- **WHEN** the answer text contains `[N]` where `N` does not appear in the `sources` event payload
- **THEN** the server MUST strip the citation marker before forwarding the token chunk
- **AND** log a warning to telemetry.

#### Scenario: Citation click opens the corresponding source surface
- **WHEN** the user clicks a `CitationChip` of kind `ticket`
- **THEN** the existing `TicketDetailModalProvider.openTicketDetail` MUST be invoked with the cited ticket id
- **AND** the modal MUST stay open behind the ticket modal so the user can return.

### Requirement: Event-driven incremental indexer
The system SHALL update the per-project index incrementally in response to in-process events emitted by existing managers, using `body_hash` as the invalidation key.

#### Scenario: Job completion enqueues re-index for touched files and ticket
- **WHEN** `QueueManager` records job completion with a non-empty `tickets[]` or new `file_provenance` rows
- **THEN** the indexer MUST upsert a `job` doc for that job id
- **AND** upsert `ticket` docs for every ticket id in `tickets[]` whose body hash has changed
- **AND** upsert `file-summary` docs for every file path whose summary changed since indexing.

#### Scenario: Explore turn triggers debounced re-index
- **WHEN** an `explore`-kind chat conversation persists a new (user, assistant) turn pair
- **THEN** the indexer MUST schedule an `explore-turn` upsert with a debounce of 5 seconds keyed on `conversationId`.

#### Scenario: File summary update triggers re-index
- **WHEN** `FileSummaryManager` emits a summary-updated event
- **THEN** the indexer MUST upsert the corresponding `file-summary` doc.

#### Scenario: Unchanged body_hash skips embedding
- **WHEN** an upsert is requested for a doc whose `body_hash` already matches the stored row
- **THEN** no embedding MUST be computed
- **AND** the `ts` field MUST NOT be updated.

### Requirement: First-open backfill with progress
The system SHALL run a one-time backfill of the per-project index lazily on the first modal open, streaming progress over WebSocket.

#### Scenario: First open triggers backfill
- **WHEN** a user opens Cmd+K for the first time in a project with no existing `ask_docs` rows
- **THEN** the indexer MUST enumerate tickets, explore turns, jobs, file summaries, and recent (≤6 months) git commits
- **AND** broadcast `ask.indexing` events with `{phase, current, total}` every 5% of progress
- **AND** broadcast `ask.index_updated` upon completion.

#### Scenario: Backfill is resumable
- **WHEN** the server is killed mid-backfill and restarted
- **THEN** the next backfill MUST skip docs whose `body_hash` already matches the stored row.

#### Scenario: Project removal cleans up the index
- **WHEN** `ProjectRegistry.removeProject` is invoked
- **THEN** all `ask_docs*` and `ask_query_log` rows for that project MUST be removed alongside the project's other state.

### Requirement: Global Cmd+K modal
The system SHALL render a single global modal mounted via `AskHubProvider` at the App root, opened by a configurable hotkey (default `Cmd+K` / `Ctrl+K`) that is suppressed while another `[role="dialog"]` is active.

#### Scenario: Default hotkey opens the modal
- **WHEN** the user presses `Cmd+K` (mac) or `Ctrl+K` (win/linux) inside the hub
- **THEN** the modal MUST open and focus its input.

#### Scenario: Hotkey is suppressed under another dialog
- **WHEN** any element with `role="dialog"` is currently mounted and focused
- **THEN** the hotkey MUST NOT open the modal
- **AND** the keystroke MUST fall through to the underlying dialog.

#### Scenario: Modal opens via portal at body root
- **WHEN** the modal renders
- **THEN** it MUST be appended via portal to a top-level node so it is not clipped by any ancestor `overflow:hidden` container.

### Requirement: Query history per project
The system SHALL persist the last 20 queries the user made in a project locally and surface them when the input is empty.

#### Scenario: Empty input shows recent queries
- **WHEN** the modal opens with no text in the input
- **THEN** the most recent up to 20 prior queries for the active project MUST be listed under a "Recent" heading.

#### Scenario: Selecting a recent query re-runs it
- **WHEN** the user clicks or presses Enter on a recent query
- **THEN** the input MUST be populated with that text
- **AND** the search MUST execute immediately.

#### Scenario: History is per-project
- **WHEN** the active project is switched
- **THEN** the history list MUST reflect the new project's queries only.

### Requirement: Settings surface
The system SHALL expose Ask-the-Hub configuration in `GlobalSettingsPage` under a section labelled "Ask the Hub", reading and writing the relevant `hub_settings` keys via `GET/PATCH /api/hub/ask-settings`.

#### Scenario: Settings reflect persisted values
- **WHEN** the settings page is opened
- **THEN** the provider, answer model, reranker, hotkey, auto-index-on-first-open, monthly budget, and indexing status fields MUST match the values returned by `GET /api/hub/ask-settings`.

#### Scenario: Reindex button rebuilds the index for the active project
- **WHEN** the user clicks "Reindex"
- **THEN** a `POST /api/projects/:projectId/ask/index/rebuild` request MUST be issued
- **AND** the existing rows in `ask_docs*` for that project MUST be removed before re-enumeration starts
- **AND** progress MUST stream via `ask.indexing` events.

### Requirement: Budget cap
The system SHALL refuse to invoke the answer LLM for a project when the current month's `ai_invocations` total cost with `surface='ask'` meets or exceeds the hub-wide `ask_monthly_budget_usd` setting (default $5).

#### Scenario: Over budget returns 429 and disables AI affordance
- **WHEN** an `ask/query` request is received and the current month's `ask` spending meets the cap
- **THEN** the server MUST respond with HTTP 429 and a body of `{ reason: 'budget' }`
- **AND** the client MUST render a single non-spammy toast and disable the "Ask AI" button until the next calendar month.

#### Scenario: Search endpoint is unaffected
- **WHEN** the budget cap is reached
- **THEN** `GET /api/projects/:projectId/ask/search` MUST continue to return results normally.

### Requirement: Query thumbs feedback
The system SHALL allow the user to mark each answer as helpful (`👍`) or unhelpful (`👎`) and persist the choice on the corresponding `ask_query_log` row.

#### Scenario: Thumb up updates the log row
- **WHEN** the user clicks the thumb-up button on a rendered answer
- **THEN** `ask_query_log.rated` for that query MUST be set to `1`.

#### Scenario: Thumb down updates the log row and prompts comment
- **WHEN** the user clicks the thumb-down button
- **THEN** `ask_query_log.rated` MUST be set to `-1`
- **AND** an optional textarea MUST be shown for an open-text comment that, when submitted, is appended to the row.

### Requirement: WebSocket events are project-scoped
The system SHALL emit the new `ask.indexing`, `ask.index_updated`, and `ask.degraded` WebSocket events through `boundBroadcast` so every payload includes the originating `projectId`.

#### Scenario: Indexing progress broadcast carries projectId
- **WHEN** the indexer emits a progress update for project P
- **THEN** every connected client MUST receive a message of type `ask.indexing` whose payload includes `projectId=P`, `phase`, `current`, and `total`.

#### Scenario: Client filters events by active project
- **WHEN** the hub client receives an `ask.*` event whose `projectId` does not match the active project
- **THEN** the modal and settings UI MUST ignore the event.

### Requirement: Bundled embedding artifact
The system SHALL ship the embedding model and tokenizer with the desktop installer under `src-tauri/binaries/embeddings/`, tracked via Git LFS, and locate them at runtime relative to `process.execPath`.

#### Scenario: Build script copies the embeddings directory
- **WHEN** `scripts/build-sidecar.mjs` is executed
- **THEN** the contents of `src-tauri/binaries/embeddings/` MUST be present in the packaged sidecar output.

#### Scenario: Runtime resolver locates the model in a packaged build
- **WHEN** the embedder worker initialises and `process.execPath` points outside the repo (packaged desktop build)
- **THEN** it MUST resolve the model directory via `path.resolve(process.execPath, '..', 'embeddings')`
- **AND** fall back to the `@xenova/transformers` local cache in development mode.

#### Scenario: LFS-tracked model files are recognised by the workflow
- **WHEN** the desktop-release workflow runs
- **THEN** the checkout step MUST be configured with `lfs: true` so the model is present before the build step runs.
