## MODIFIED Requirements

### Requirement: Unified per-project AI invocation table

The system SHALL persist one row per AI CLI invocation in a per-project SQLite table `ai_invocations` with the columns defined in the design document.

#### Scenario: Schema present after migration

- **WHEN** a project's database is migrated to the latest schema version
- **THEN** the `ai_invocations` table exists with columns `id`, `project_id`, `surface`, `surface_ref_id`, `ticket_id`, `conversation_id`, `model`, `status`, `started_at`, `finished_at`, `duration_ms`, `duration_api_ms`, `tokens_in`, `tokens_out`, `tokens_cache_read`, `tokens_cache_create`, `total_cost_usd`, `num_turns`, `session_id`, `created_at`
- **AND** indices `idx_ai_inv_project_started`, `idx_ai_inv_project_surface`, and `idx_ai_inv_project_ticket` are present.

#### Scenario: Surface column constrained to known values

- **WHEN** a row is inserted via the `recordInvocation` helper
- **THEN** the `surface` value MUST be one of `job`, `quick-spec`, `explore-spec`, `ai-edit`, `file-summary`, `ask`
- **AND** any other value MUST be rejected at the helper level before reaching SQLite.

## ADDED Requirements

### Requirement: Capture from Ask-the-Hub answer queries (`surface='ask'`)

The system SHALL insert one `ai_invocations` row for every answer-LLM invocation triggered by an Ask-the-Hub query, regardless of which provider (Claude or Codex) was used.

#### Scenario: Ask query completes successfully

- **WHEN** an Ask-the-Hub query streams to completion with the configured provider
- **THEN** an `ai_invocations` row MUST be inserted with `surface='ask'`, `status='success'`, `conversation_id=null`, `ticket_id=null`, and populated `model`, `tokens_*`, `total_cost_usd`, `num_turns`, `duration_ms` fields.

#### Scenario: Ask query aborted by the client

- **WHEN** the SSE stream is cancelled by the client before the answer completes
- **THEN** the row MUST be inserted with `status='aborted'` and whatever partial cost/token fields are available.

#### Scenario: Ask query fails because provider CLI crashed

- **WHEN** the spawned provider process exits non-zero without emitting a `result` event
- **THEN** the row MUST be inserted with `status='failed'` and the `model` field populated from the configured setting.

#### Scenario: Ask cost appears in analytics by surface

- **WHEN** `getSpending` aggregates the period and the project has at least one `surface='ask'` row
- **THEN** the `bySurface` breakdown MUST include an entry for `ask` with the matching totals
- **AND** the daily timeline stacked bars MUST include an `ask` band where rows exist on that day.
