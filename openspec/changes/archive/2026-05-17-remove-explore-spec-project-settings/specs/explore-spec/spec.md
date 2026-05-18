## REMOVED Requirements

### Requirement: Per-project Use-MCPs-in-Explore toggle defaults OFF

**Reason**: The MCP-in-Explore decision is now exclusively per-spec, captured at creation time in the conversation's `context_scope.mcp` and stored on the resulting ticket via `origin_conversation_id`. There is no project-level default and no project-level override. Removing the project setting eliminates a second, retroactive source of truth that could silently change the behaviour of new specs.

**Migration**: The `queue_state` row `config.explore_mcp_enabled` (if present) is left in place but is no longer read or written. Users who relied on it should select the `External tools (MCPs)` toggle (or a preset that includes `mcp: true`) in the Add Spec modal — `useContextScope` persists the chosen scope per-project so the slider remembers the user's last selection. The REST endpoints `GET /api/projects/:projectId/explore-mcp-enabled` and `PATCH /api/projects/:projectId/explore-mcp-enabled` are removed.

### Requirement: Per-project Contract Refine toggle defaults OFF

**Reason**: Contract Refine is now exclusively per-spec, captured at creation time in the conversation's `context_scope.contractRefine`. There is no project-level default; the lifecycle runner and the retry endpoint no longer consult a project setting. The hub-wide kill switch `SPECRAILS_EXPLORE_CONTRACT_REFINE` remains as the ops escape hatch.

**Migration**: The `queue_state` row `config.explore_contract_refine_enabled` (if present) is left in place but is no longer read or written. Users who relied on it should select a preset that includes `contractRefine: true` (e.g. `Max` or `Hub`) or enable the flag via `Fine-tune` in the Add Spec modal. The REST endpoints `GET /api/projects/:projectId/explore-contract-refine-enabled` and `PATCH /api/projects/:projectId/explore-contract-refine-enabled` are removed.

### Requirement: SettingsPage Explore Spec card includes the toggle

**Reason**: With the project-level toggles removed, the entire `Explore Spec` card in `SettingsPage` is removed. There is no per-project Explore configuration to surface in Settings; all Explore options live in the Add Spec modal.

**Migration**: Users navigate to Add Spec to configure MCP and Contract Refine. The deleted card includes the helper copy describing the latency/cost trade-off — equivalent guidance lives next to the per-spec slider/preset chooser.

## MODIFIED Requirements

### Requirement: Explore turns spawn from a hub-managed cwd by default

Every Explore conversation turn (chat conversations with `kind='explore'`) SHALL spawn `claude` with `cwd` selected by the conversation's `contextScope.mcp` flag. When `contextScope.mcp` is `true` the spawn cwd MUST be `<project.path>`; otherwise it MUST be `~/.specrails/projects/<slug>/explore-cwd/`. The hub-managed cwd MUST contain a hub-owned `CLAUDE.md` and a symlink `./project` (junction on Windows) pointing at the project's absolute path. The user's `<project>/CLAUDE.md` MUST NOT be modified, moved, deleted, or referenced by the spawn cwd in any way. The conversation's stored `contextScope.mcp` MUST be set at creation time exclusively from the Add Spec modal's `External tools (MCPs)` toggle (or the active preset). The hub MUST NOT consult any project-level setting when initialising or interpreting `contextScope.mcp`. Legacy conversations whose `context_scope` is `null` or missing the `mcp` field MUST be treated as `mcp: false` (spawn from hub-managed cwd).

#### Scenario: contextScope.mcp false uses hub-managed cwd
- **WHEN** an Explore turn fires and the conversation's `contextScope.mcp` is `false`
- **THEN** `claude` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** that directory contains a hub-owned `CLAUDE.md` file
- **AND** that directory contains a `project` entry that resolves to the project's absolute path

#### Scenario: contextScope.mcp true uses project cwd
- **WHEN** an Explore turn fires and the conversation's `contextScope.mcp` is `true`
- **THEN** `claude` is spawned with `cwd` equal to `<project.path>`
- **AND** the hub-managed `explore-cwd/` directory is not used for that turn

#### Scenario: Project CLAUDE.md is never touched
- **WHEN** an Explore conversation is created, run, resumed, minimized, restored, or closed
- **THEN** the file `<project.path>/CLAUDE.md` is not modified, moved, or deleted by the hub
- **AND** the hub-managed `explore-cwd/CLAUDE.md` is a separate file with hub-owned content

#### Scenario: Legacy null scope defaults to hub-managed cwd
- **GIVEN** an Explore conversation row whose stored `context_scope` is `null` or lacks the `mcp` field
- **WHEN** a turn fires for that conversation
- **THEN** `claude` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`

### Requirement: Hub-wide kill switch for Contract Refine

The hub SHALL honour an environment variable `SPECRAILS_EXPLORE_CONTRACT_REFINE`. When the variable is the literal string `0`, `false`, or `off` (case-insensitive), the refine step MUST be skipped for every project regardless of per-conversation scope. The kill switch suppresses both the post-commit auto-fire path and the manual retry endpoint.

#### Scenario: Kill switch disables refine across all projects
- **GIVEN** the server is started with `SPECRAILS_EXPLORE_CONTRACT_REFINE=0`
- **WHEN** any committed Explore conversation has `context_scope.contractRefine=true`
- **THEN** no refine spawn is scheduled
- **AND** the ticket description is left as the user committed it

#### Scenario: Kill switch disables retry endpoint
- **GIVEN** the server is started with `SPECRAILS_EXPLORE_CONTRACT_REFINE=off`
- **WHEN** the client POSTs `POST /api/projects/:projectId/tickets/:id/contract-refine` for a ticket with a valid `origin_conversation_id`
- **THEN** the server responds 409
- **AND** no spawn is scheduled

#### Scenario: Default-empty env behaves as enabled
- **WHEN** the server is started without `SPECRAILS_EXPLORE_CONTRACT_REFINE` set
- **THEN** the kill switch is treated as inactive
- **AND** per-conversation scope drives refine behaviour normally

### Requirement: Contract Refine runs as a post-commit Explore turn

When the hub-wide kill switch is inactive, the hub SHALL fire a Contract Refine turn after every successful Explore spec commit whose source conversation has `context_scope.contractRefine === true`. The refine MUST run asynchronously (the client's `Create Spec` request MUST return as fast as it does today). The refine MUST spawn `claude` through `ChatManager` reusing the parent Explore conversation's lifecycle (concurrency cap, idle-kill, crash auto-respawn, `--resume <session_id>`, cwd resolution from the conversation's `contextScope.mcp`). The refine MUST use the same model as the parent conversation. The post-commit path MUST NOT consult any project-level setting.

#### Scenario: Refine fires after new-ticket commit
- **WHEN** the user commits an Explore draft via `POST /tickets/from-draft` (legacy insert path)
- **AND** the committed conversation has `context_scope.contractRefine=true`
- **THEN** `ChatManager.runContractRefine(conversationId, ticketId)` is invoked after the HTTP response is sent
- **AND** the refine spawn uses `--resume <session_id>` of the parent Explore conversation

#### Scenario: Refine fires after draft flip-in-place commit
- **WHEN** the user commits a session whose source ticket is `status='draft'` (flip-in-place path)
- **AND** the committed conversation has `context_scope.contractRefine=true`
- **THEN** the refine fires against the flipped ticket id, not a new ticket id

#### Scenario: Refine reuses parent conversation model
- **GIVEN** an Explore conversation created with `model='haiku'`
- **WHEN** the refine fires for its commit
- **THEN** the spawned `claude` argv selects `haiku` (same as parent turns)

#### Scenario: Refine respects parent conversation cwd
- **GIVEN** an Explore conversation with `contextScope.mcp=false` (hub-managed cwd)
- **WHEN** the refine fires
- **THEN** the spawn `cwd` is `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** the spawn does NOT add `<project.path>` cwd

#### Scenario: Refine counts against per-project concurrency cap
- **GIVEN** five Explore turns currently streaming for a project (cap reached)
- **WHEN** a refine fires for a sixth turn
- **THEN** the refine queues using the existing Explore queue semantics
- **AND** the 30 s busy timeout applies identically

### Requirement: Refine failure is non-blocking and surfaces a recoverable toast

If the refine fails for any reason — model error, `chat_error`, crash that exhausts auto-respawn, malformed `contract-layer` block, hub-side parser exception, timeout at 60 seconds from refine spawn start — the hub MUST NOT patch the ticket description and MUST broadcast a project-scoped WebSocket event `explore.contract_refine_failed { ticketId, reason }` where `reason` is one of `model_error | crashed | malformed | timeout | parser_error`. The client SHALL react by showing a sonner toast on the SpecsBoard surface with copy "Contract layer skipped — ticket saved without it" and an action button `Reintentar`. Activating `Reintentar` SHALL invoke `POST /api/projects/:projectId/tickets/:id/contract-refine` to fire a fresh refine for the same ticket. The retry endpoint MUST gate on the hub-wide kill switch and on the ticket having a non-null `origin_conversation_id`; it MUST NOT gate on the originating conversation's `context_scope.contractRefine`. The retry MUST reuse the same `(conversationId, ticketId)` pair and the same lifecycle as the original refine.

#### Scenario: Model error emits failure event and skips patch
- **WHEN** the refine spawn exits with a `chat_error` after auto-respawn is exhausted
- **THEN** no PATCH is sent to the ticket
- **AND** an `explore.contract_refine_failed` WS event is broadcast with `reason: "model_error"` or `"crashed"`
- **AND** the ticket description remains as the user committed it

#### Scenario: 60-second timeout treated as failure
- **WHEN** the refine has been running for 60 seconds without emitting a parseable `contract-layer` block
- **THEN** the refine spawn is terminated
- **AND** an `explore.contract_refine_failed` WS event is broadcast with `reason: "timeout"`

#### Scenario: Retry endpoint fires a fresh refine
- **WHEN** the client POSTs `POST /api/projects/:projectId/tickets/:id/contract-refine` for a ticket with a non-null `origin_conversation_id`
- **AND** the kill switch is inactive
- **THEN** a fresh refine spawn is scheduled for the same ticket id
- **AND** the response is 202 with `{ scheduled: true }`

#### Scenario: Retry endpoint rejects when kill switch active
- **WHEN** the client POSTs the retry endpoint while `SPECRAILS_EXPLORE_CONTRACT_REFINE=off`
- **THEN** the server responds 409 with an error code indicating the feature is disabled
- **AND** no spawn is scheduled

#### Scenario: Retry endpoint rejects ticket without origin conversation
- **WHEN** the client POSTs the retry endpoint for a ticket whose `origin_conversation_id` is `null`
- **THEN** the server responds 409 with an error code indicating no origin conversation
- **AND** no spawn is scheduled

#### Scenario: Retry endpoint rejects unknown ticket
- **WHEN** the client POSTs the retry endpoint for a ticket id that does not exist
- **THEN** the server responds 404

### Requirement: contextScope carries contractRefine per conversation

The server-side `ContextScope` type SHALL include a `contractRefine: boolean` field, persisted in `chat_conversations.context_scope` JSON alongside the existing `specrails`, `openspec`, `full`, `mcp` flags. `normalizeContextScope` MUST default missing `contractRefine` values to `false`. The boot value for the Add Spec modal's `contractRefine` toggle MUST come from the active preset or, when a per-project sticky scope exists (`useContextScope`), from that persisted value. The hub MUST NOT consult any project-level setting when seeding the boot value.

#### Scenario: contractRefine defaults to false when absent in stored scope
- **GIVEN** a legacy `chat_conversations` row whose `context_scope` JSON lacks `contractRefine`
- **WHEN** the runner reads the scope via `normalizeContextScope`
- **THEN** `contractRefine` is `false`

#### Scenario: Modal boot uses per-project sticky scope when available
- **GIVEN** the project has a persisted `useContextScope` value with `contractRefine: true`
- **WHEN** the user opens the Add Spec modal in Explore mode
- **THEN** the Contract Refine flag in the slider/fine-tune surface boots to `true`

#### Scenario: contractRefine round-trips through JSON
- **WHEN** a scope `{ specrails: true, openspec: false, full: true, mcp: false, contractRefine: true }` is JSON-stringified and re-normalised
- **THEN** every flag including `contractRefine` round-trips byte-equal

### Requirement: from-draft commit reads contractRefine from conversation scope

When `POST /tickets/from-draft` schedules `runContractRefine` after a successful commit, the runner SHALL gate the spawn exclusively on `conversation.context_scope.contractRefine` (and on the hub-wide kill switch). If the field is `false` (including the legacy `false` default) the runner MUST early-return with `reason='scope-disabled'`. The runner MUST NOT consult any project-level setting.

#### Scenario: Per-conversation false skips refine
- **GIVEN** the committed conversation's `context_scope.contractRefine` is `false`
- **WHEN** the user commits via `Create Spec`
- **THEN** no refine spawn is scheduled
- **AND** the ticket has no Contract Layer appended

#### Scenario: Per-conversation true fires refine
- **GIVEN** the committed conversation's `context_scope.contractRefine` is `true`
- **AND** the kill switch is inactive
- **WHEN** the user commits via `Create Spec`
- **THEN** a refine spawn is scheduled
- **AND** on success the ticket gains a Contract Layer section

#### Scenario: scope-disabled reason recorded as skipped, not failed
- **WHEN** the runner early-returns with `reason='scope-disabled'`
- **THEN** no `claude` process is spawned
- **AND** no `ai_invocations` row is recorded for that attempt
- **AND** no `explore.contract_refine_failed` WS event is broadcast

### Requirement: Quick mode supports Contract Refine after generate-spec

The `POST /api/projects/:projectId/tickets/generate-spec` endpoint SHALL accept an optional `contractRefine: boolean` field in its request body. When `true` and the hub-wide kill switch is inactive, the server MUST schedule `runContractRefine` after the generated ticket is persisted. The refine spawn MUST use a one-shot pathway (no `--resume`, no parent conversation): the system prompt is augmented with the just-generated `title` and `description` so the model has the spec body in-context, and the recorded `ai_invocations` row uses `surface='quick-spec'` with `conversation_id=null` and the new ticket id. The endpoint MUST NOT consult any project-level setting.

#### Scenario: Quick toggle ON fires refine after generation
- **GIVEN** the kill switch is inactive
- **WHEN** the client posts `{ idea, contractRefine: true }` to `generate-spec`
- **THEN** the ticket is created normally
- **AND** within 100 ms of the response the refine spawn is scheduled
- **AND** the refine spawn argv does NOT include `--resume`

#### Scenario: Quick toggle OFF skips refine
- **WHEN** the client posts `{ idea, contractRefine: false }` to `generate-spec`
- **THEN** the ticket is created and no refine spawn is scheduled

#### Scenario: Quick toggle ON skipped under kill switch
- **GIVEN** the kill switch is active
- **WHEN** the client posts `{ idea, contractRefine: true }` to `generate-spec`
- **THEN** the ticket is created and no refine spawn is scheduled

#### Scenario: Quick refine writes a quick-spec invocation row
- **WHEN** a Quick refine completes successfully
- **THEN** an `ai_invocations` row exists with `surface='quick-spec'`, `conversation_id IS NULL`, and `ticket_id` equal to the new ticket id

### Requirement: SpecsBoard surface tracks refine pending and failure states

The client SHALL render a sonner toast on the SpecsBoard surface for each ticket whose refine is in-flight. The toast text SHALL be `Afinando contrato…` and the toast id MUST be derived deterministically from the ticket id so consecutive refines do not stack. On `ticket_updated` (refine success) the toast MUST be dismissed automatically. On `explore.contract_refine_failed` the toast MUST swap to an error variant with copy `Contract layer skipped — ticket saved without it` and an action `Reintentar` that POSTs to the retry endpoint. The toast MUST be dismissable manually at any time.

#### Scenario: Pending toast appears on commit when conversation scope has contractRefine ON
- **WHEN** the user commits an Explore spec whose conversation has `context_scope.contractRefine=true`
- **THEN** a sonner toast with id `contract-refine:<ticketId>` and text `Afinando contrato…` appears within 100 ms of the commit response

#### Scenario: Success dismisses the toast
- **WHEN** the matching `ticket_updated` event arrives and the patched description contains a Contract Layer section
- **THEN** the toast with id `contract-refine:<ticketId>` is dismissed

#### Scenario: Failure swaps the toast to error variant
- **WHEN** an `explore.contract_refine_failed` WS event arrives for `ticketId`
- **THEN** the existing toast with id `contract-refine:<ticketId>` is updated to the error variant
- **AND** an action button `Reintentar` is rendered on the toast
- **AND** clicking `Reintentar` POSTs `POST /api/projects/:projectId/tickets/<ticketId>/contract-refine`

#### Scenario: Toast id is stable across retries
- **WHEN** the user activates `Reintentar` on the error toast
- **THEN** the toast id remains `contract-refine:<ticketId>` and reverts to the pending variant
- **AND** no second toast for the same ticket is created
