## ADDED Requirements

### Requirement: Unified per-project AI invocation table

The system SHALL persist one row per AI CLI invocation in a per-project SQLite table `ai_invocations` with the columns defined in the design document.

#### Scenario: Schema present after migration

- **WHEN** a project's database is migrated to the latest schema version
- **THEN** the `ai_invocations` table exists with columns `id`, `project_id`, `surface`, `surface_ref_id`, `ticket_id`, `conversation_id`, `model`, `status`, `started_at`, `finished_at`, `duration_ms`, `duration_api_ms`, `tokens_in`, `tokens_out`, `tokens_cache_read`, `tokens_cache_create`, `total_cost_usd`, `num_turns`, `session_id`, `created_at`
- **AND** indices `idx_ai_inv_project_started`, `idx_ai_inv_project_surface`, and `idx_ai_inv_project_ticket` are present.

#### Scenario: Surface column constrained to known values

- **WHEN** a row is inserted via the `recordInvocation` helper
- **THEN** the `surface` value MUST be one of `job`, `quick-spec`, `explore-spec`, `ai-edit`
- **AND** any other value MUST be rejected at the helper level before reaching SQLite.

### Requirement: Capture from QueueManager (`surface='job'`)

The system SHALL insert one `ai_invocations` row for every job spawned by `QueueManager`, populated from the same `result` event already used to update the `jobs` table.

#### Scenario: Job completes successfully

- **WHEN** a job's spawned `claude` process emits a `result` event and exits with code 0
- **THEN** a new `ai_invocations` row exists with `surface='job'`, `surface_ref_id=<jobId>`, `status='success'`, and the `tokens_*`, `total_cost_usd`, `num_turns`, `duration_ms`, `duration_api_ms`, `model`, `session_id` values from the `result` event
- **AND** the existing `jobs` row is also updated as before (no regression in queue UI).

#### Scenario: Job process exits before emitting `result`

- **WHEN** a job's spawned process exits with non-zero code without ever emitting a `result` event
- **THEN** an `ai_invocations` row is inserted with `status='failed'`, `model` from the spawn args (best-effort), all token/cost/turn columns NULL, and `started_at`/`finished_at` from process timestamps.

#### Scenario: Job is cancelled by the user

- **WHEN** a job is killed via the cancel endpoint before the `result` event arrives
- **THEN** an `ai_invocations` row is inserted with `status='aborted'` and metric columns NULL.

### Requirement: Capture from Quick spec generation (`surface='quick-spec'`)

The system SHALL insert one `ai_invocations` row per `POST /tickets/generate-spec` invocation, regardless of whether a ticket is ultimately created.

#### Scenario: Quick spec succeeds and creates a ticket

- **WHEN** the spawned `claude` (or `codex`) process for `/tickets/generate-spec` emits a `result` event
- **AND** the route then creates a ticket with id `T`
- **THEN** an `ai_invocations` row exists with `surface='quick-spec'`, `surface_ref_id=<request-id>`, `status='success'`, the metric columns populated, and `ticket_id=T`.

#### Scenario: Quick spec succeeds but ticket creation fails

- **WHEN** the `result` event is received but the subsequent ticket persistence step throws
- **THEN** an `ai_invocations` row is still inserted with `status='success'`, metrics populated, and `ticket_id=NULL`
- **AND** the row counts toward total cost in the dashboard but appears under "Unattributed" in the Top Tickets widget.

### Requirement: Capture from Explore conversations (`surface='explore-spec'`), one row per turn

The system SHALL insert one `ai_invocations` row for every CLI invocation triggered by `ChatManager.sendMessage` whose conversation has `kind='explore'`. Conversations with `kind='sidebar'` MUST NOT produce any `ai_invocations` rows.

#### Scenario: Explore conversation kind is recorded at creation

- **WHEN** the client posts to `/chat/conversations` with body `{ kind: 'explore' }`
- **THEN** the resulting `chat_conversations` row has `kind='explore'`
- **AND** a request without the field defaults to `kind='sidebar'`.

#### Scenario: Each Explore turn produces one row

- **WHEN** a user sends three messages in an Explore conversation `C` and each spawned process emits a `result` event
- **THEN** three `ai_invocations` rows exist with `surface='explore-spec'`, `conversation_id=C`, `surface_ref_id` distinct per turn.

#### Scenario: Sidebar chat is not captured

- **WHEN** a user sends messages in a conversation with `kind='sidebar'`
- **THEN** no rows are inserted into `ai_invocations` regardless of the `result` event content.

#### Scenario: Ticket creation back-fills `ticket_id` on prior turns

- **WHEN** an Explore conversation `C` has produced N rows with `ticket_id=NULL`
- **AND** the user calls `POST /tickets/from-draft` with the conversation reference, creating ticket `T`
- **THEN** the request handler updates all N rows: `UPDATE ai_invocations SET ticket_id=T WHERE conversation_id=C AND ticket_id IS NULL`
- **AND** subsequent turns in the same conversation are inserted with `ticket_id=T` directly.

### Requirement: Capture from AI Edit refines (`surface='ai-edit'`)

The system SHALL insert one `ai_invocations` row per refine session managed by `AgentRefineManager` at process exit.

#### Scenario: Refine completes

- **WHEN** an AI Edit refine session's spawned process emits a `result` event
- **THEN** an `ai_invocations` row exists with `surface='ai-edit'`, `surface_ref_id=<refineId>`, `status='success'` and metrics populated.

### Requirement: Surfaces explicitly excluded from capture

The system SHALL NOT insert `ai_invocations` rows for the chat sidebar or the setup wizard, even when those flows spawn AI CLI processes.

#### Scenario: Setup wizard spawn produces no rows

- **WHEN** `SetupManager` spawns `npx specrails-core` and the embedded `/setup` chat
- **THEN** zero `ai_invocations` rows exist with `surface IN ('chat','setup')` (those values are not part of the allowed `surface` set).

### Requirement: Aggregation and querying via `getSpending`

The system SHALL expose a single server function `getSpending(db, opts)` that returns the data for all dashboard widgets in one response, supporting filters: `period` (`7d`/`30d`/`90d`/`all`/`custom`+`from`/`to`), `surface[]`, `model[]`, `status`, `minCostUsd`, `ticketId`.

#### Scenario: Total cost matches sum across surfaces

- **WHEN** five `success` rows exist with costs $1.00, $0.50, $0.25, $0.10, $0.05 in the requested period
- **THEN** `summary.totalCostUsd` returned by `getSpending` equals 1.90.

#### Scenario: Filter by surface narrows totals

- **WHEN** `getSpending` is called with `surface=['quick-spec']`
- **THEN** the returned `totals` and every breakdown reflect only `surface='quick-spec'` rows.

#### Scenario: Failed rows excluded from averages

- **WHEN** the dataset contains 2 `success` rows ($1.00 and $3.00) and 1 `failed` row (cost NULL) in the period
- **THEN** `summary.avgCostPerSpec` (or per-job, per-refine) equals $2.00, not $1.33
- **AND** `summary.totalRuns` equals 3 and `summary.failureRate` equals 1/3.

#### Scenario: Daily timeline is stacked by surface

- **WHEN** the response includes `dailyTimeline`
- **THEN** each entry has shape `{ date, jobsCostUsd, quickCostUsd, exploreCostUsd, aiEditCostUsd }`
- **AND** there is exactly one entry per day in the period (zero-filled for days with no rows).

#### Scenario: Top tickets aggregate cross-surface

- **WHEN** a ticket `T` has 2 job rows ($5.00 each), 1 explore row ($2.00), and 0 quick rows
- **THEN** `topTickets[i] = { ticketId: T, totalCostUsd: 12.00, breakdown: { job: 10.00, 'explore-spec': 2.00 } }` for some `i`.

#### Scenario: Previous-period delta is computed with the same filter set

- **WHEN** filters select `surface=['quick-spec']` over `period='30d'`
- **THEN** `summary.prevTotalCostUsd` is the total for `surface='quick-spec'` in the *previous* 30-day window
- **AND** `summary.deltaPct` equals `(curr - prev) / prev * 100` (or `null` if `prev === 0`).

### Requirement: Raw invocation listing for table block and export

The system SHALL expose `getInvocations(db, opts)` returning paginated raw rows for the dashboard's table block and for the Raw export, with the same filter set as `getSpending` plus `limit` and `offset`.

#### Scenario: Pagination

- **WHEN** `limit=50, offset=100` is requested
- **THEN** the response contains at most 50 rows starting from the 101st in `started_at DESC` order.

#### Scenario: Hard cap for export

- **WHEN** the request is flagged as an export and the underlying query would return more than 10 000 rows
- **THEN** the response contains 10 000 rows
- **AND** the response metadata includes `truncated: true, totalAvailable: <N>`.

### Requirement: WebSocket invalidation on new captures

The system SHALL broadcast a project-scoped `spending.invalidated` WebSocket message after every successful `recordInvocation` write, so that an open dashboard can refresh.

#### Scenario: Message format

- **WHEN** a row is written for project `P`
- **THEN** a WebSocket message `{ type: 'spending.invalidated', projectId: P }` is broadcast on `/ws`
- **AND** the message has no payload beyond those two fields.
