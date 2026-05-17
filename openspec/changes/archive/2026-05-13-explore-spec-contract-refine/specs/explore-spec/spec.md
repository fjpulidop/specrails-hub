## ADDED Requirements

### Requirement: Per-project Contract Refine toggle defaults OFF

The hub SHALL persist a per-project boolean setting `explore_contract_refine_enabled`, default `false`, exposed via `GET /api/projects/:projectId/explore-contract-refine-enabled` and `PATCH /api/projects/:projectId/explore-contract-refine-enabled`. The PATCH endpoint MUST accept `{ enabled: boolean }` and reject other payloads with HTTP 400. The setting MUST be stored in the existing `queue_state` key/value table under the key `config.explore_contract_refine_enabled`. The toggle MUST drive whether the Contract Refine post-commit step fires for any newly committed Explore spec in that project.

#### Scenario: Default value is false
- **WHEN** a fresh project is registered and `GET /api/projects/:id/explore-contract-refine-enabled` is called before any user interaction
- **THEN** the response is `{ enabled: false }`

#### Scenario: PATCH persists the new value
- **WHEN** the client PATCHes `{ enabled: true }`
- **THEN** the server responds 200 with `{ enabled: true }`
- **AND** a subsequent GET returns `{ enabled: true }`

#### Scenario: Invalid payload rejected
- **WHEN** the client PATCHes `{ enabled: "yes" }` or any non-boolean
- **THEN** the server responds 400
- **AND** the stored value is unchanged

#### Scenario: Toggle OFF disables refine on commit
- **GIVEN** the toggle is `false`
- **WHEN** the user commits an Explore spec via `Create Spec`
- **THEN** no refine spawn is scheduled for the resulting ticket
- **AND** the ticket's description does NOT contain a Contract Layer section

#### Scenario: Toggle ON enables refine on commit
- **GIVEN** the toggle is `true`
- **WHEN** the user commits an Explore spec via `Create Spec` (new ticket or flipped draft)
- **THEN** a refine spawn is scheduled within 100 ms of the commit response
- **AND** on success the ticket description is patched to include the Contract Layer section

### Requirement: Hub-wide kill switch for Contract Refine

The hub SHALL honour an environment variable `SPECRAILS_EXPLORE_CONTRACT_REFINE`. When the variable is the literal string `0`, `false`, or `off` (case-insensitive), the refine step MUST be skipped for every project regardless of the per-project toggle. The per-project toggle and its endpoints MUST remain readable and writable when the env kill switch is active — only the *firing* of refines is suppressed.

#### Scenario: Kill switch disables refine across all projects
- **GIVEN** the server is started with `SPECRAILS_EXPLORE_CONTRACT_REFINE=0`
- **WHEN** any project with `explore_contract_refine_enabled=true` commits an Explore spec
- **THEN** no refine spawn is scheduled
- **AND** the ticket description is left as the user committed it

#### Scenario: Toggle endpoint still functions under kill switch
- **GIVEN** the server is started with `SPECRAILS_EXPLORE_CONTRACT_REFINE=off`
- **WHEN** the client PATCHes `{ enabled: true }`
- **THEN** the server responds 200 with `{ enabled: true }`
- **AND** subsequent GETs reflect the stored value

#### Scenario: Default-empty env behaves as enabled
- **WHEN** the server is started without `SPECRAILS_EXPLORE_CONTRACT_REFINE` set
- **THEN** the kill switch is treated as inactive
- **AND** per-project toggles drive refine behaviour normally

### Requirement: Contract Refine runs as a post-commit Explore turn

When the per-project toggle is ON and the kill switch is inactive, the hub SHALL fire a Contract Refine turn after every successful Explore spec commit. The refine MUST run asynchronously (the client's `Create Spec` request MUST return as fast as it does today). The refine MUST spawn `claude` through `ChatManager` reusing the parent Explore conversation's lifecycle (concurrency cap, idle-kill, crash auto-respawn, `--resume <session_id>`, cwd resolution from the conversation's `contextScope.mcp`). The refine MUST use the same model as the parent conversation.

#### Scenario: Refine fires after new-ticket commit
- **WHEN** the user commits an Explore draft via `POST /tickets/from-draft` (legacy insert path)
- **AND** the toggle is ON
- **THEN** `ChatManager.runContractRefine(conversationId, ticketId)` is invoked after the HTTP response is sent
- **AND** the refine spawn uses `--resume <session_id>` of the parent Explore conversation

#### Scenario: Refine fires after draft flip-in-place commit
- **WHEN** the user commits a session whose source ticket is `status='draft'` (flip-in-place path)
- **AND** the toggle is ON
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

### Requirement: Contract Refine system prompt is structural and read-only

The refine turn SHALL be initiated by a marker user message `/specrails:contract-refine` and rely on a dedicated structural system prompt distinct from the main Explore prompt. The system prompt MUST forbid the model from modifying user-authored content, MUST instruct the model to emit exactly one fenced block tagged ` ```contract-layer ` containing a JSON object, and MUST forbid any tool calls regardless of the parent conversation's `contextScope.full`. The system prompt MUST be byte-stable across two refines of the same `(conversationId, ticketId, contract-prompt-version)` so retries hit the Anthropic prompt cache. The spawn argv MUST include `--disallowedTools Read,Grep,Glob,Bash` for the refine turn even when the parent conversation enabled them.

#### Scenario: Marker message starts the refine
- **WHEN** the refine fires
- **THEN** the user message sent into the conversation is exactly `/specrails:contract-refine`
- **AND** this message is NOT shown in the client's conversation history (filtered like the parent `/specrails:explore-spec` bootstrap)

#### Scenario: Refine spawn forbids tools
- **WHEN** the refine fires for a parent conversation that had `contextScope.full=true`
- **THEN** the spawn argv includes `--disallowedTools Read,Grep,Glob,Bash`
- **AND** does NOT include `--allowedTools Read,Grep,Glob`

#### Scenario: System prompt is byte-stable across retries
- **WHEN** the refine is invoked twice in a row for the same `(conversationId, ticketId)` and the same `contract-prompt-version`
- **THEN** the two system prompt strings are byte-for-byte equal

#### Scenario: System prompt forbids user-content edits
- **WHEN** the refine system prompt is built
- **THEN** the prompt contains an explicit instruction that the model MUST NOT alter or restate the user-authored title, description, labels, priority, or acceptance criteria
- **AND** the prompt instructs the model to emit only the `contract-layer` fenced block

### Requirement: contract-layer fenced block parses to a known shape

The hub SHALL recognise a fenced code block tagged ` ```contract-layer ` in the refine assistant turn and parse the JSON payload against a fixed shape:

```
{
  "contractVersion": 1,
  "namingContract": {
    "enums":     [{ "name": string, "values": string[], "file": string }],
    "fields":    [{ "name": string, "type": string, "where": string }],
    "functions": [{ "signature": string, "file": string }],
    "files":     [{ "path": string, "purpose": string }]
  },
  "dataShapes":    [{ "name": string, "ts": string }],
  "stateMachine":  string | null,
  "invariants":    string[],
  "fileTouchList": [{ "path": string, "action": "create" | "extend" | "delete", "reason": string }]
}
```

Unknown keys MUST be dropped silently. Missing arrays MUST default to `[]`. A missing or non-integer `contractVersion` MUST cause the block to be treated as malformed. The raw fenced block MUST be stripped from the chat content broadcast to clients (same scrub behaviour as the `spec-draft` block). Malformed blocks MUST log a server warning with `conversationId` and `ticketId` and MUST be treated as a refine failure.

#### Scenario: Valid block parses to canonical shape
- **WHEN** the refine assistant turn contains a `contract-layer` block with the full known shape
- **THEN** the parsed object exposes all five top-level fields with the declared types
- **AND** the raw block is removed from the chat content broadcast over the WS

#### Scenario: Missing optional arrays default to empty
- **WHEN** the block omits `invariants` and `dataShapes`
- **THEN** the parsed object has `invariants: []` and `dataShapes: []`

#### Scenario: Unknown keys are dropped
- **WHEN** the block contains `{ "contractVersion": 1, "namingContract": {...}, "specFlavour": "weird" }`
- **THEN** `specFlavour` is not surfaced in the parsed result
- **AND** parsing succeeds

#### Scenario: Missing contractVersion is malformed
- **WHEN** the block omits `contractVersion` or sets it to a non-integer
- **THEN** parsing fails
- **AND** a server warning is logged with `conversationId` and `ticketId`
- **AND** the refine is treated as a failure per the refine-failure requirement

#### Scenario: Malformed JSON does not crash
- **WHEN** the block contains malformed JSON
- **THEN** parsing fails gracefully
- **AND** the chat content broadcast still strips the fenced block boundaries
- **AND** the refine is treated as a failure

### Requirement: Successful refine patches the ticket description with a Contract Layer section

On successful parse of the `contract-layer` block, the hub SHALL patch the committed ticket's description by appending a deterministic Contract Layer markdown section. The section MUST be separated from the user-authored body by a single horizontal rule line `\n\n---\n\n` followed by the heading `## Contract Layer` and exactly five labelled subsections in this order: `### Naming Contract`, `### Data Shapes`, `### State Machine`, `### Invariants`, `### File Touch List`. Subsections that have no items MUST render the literal line `_N/A — model did not produce items for this subsection._` (or equivalent). The patch MUST use the existing `PATCH /api/projects/:projectId/tickets/:id` endpoint with only the `description` field set. The patch MUST NOT alter `title`, `labels`, `priority`, or any other ticket field. The hub MUST broadcast a `ticket_updated` WebSocket event after the patch, identical in shape to other PATCH-driven updates.

#### Scenario: Successful refine appends the Contract Layer section
- **WHEN** the refine produces a valid `contract-layer` block
- **THEN** the ticket's `description` is patched
- **AND** the patched description ends with `\n\n---\n\n## Contract Layer\n\n### Naming Contract\n...\n### Data Shapes\n...\n### State Machine\n...\n### Invariants\n...\n### File Touch List\n...`
- **AND** the original user-authored part of the description (everything before the `\n\n---\n\n` separator) is byte-identical to the description committed by `from-draft`

#### Scenario: Empty subsections render an N/A placeholder
- **WHEN** the `contract-layer` block contains an empty `invariants` array
- **THEN** the rendered `### Invariants` subsection contains the literal `_N/A — model did not produce items for this subsection._` line

#### Scenario: stateMachine null renders N/A
- **WHEN** the `contract-layer` block contains `stateMachine: null`
- **THEN** the rendered `### State Machine` subsection contains the N/A placeholder line

#### Scenario: PATCH carries only description
- **WHEN** the hub fires the patch after a successful refine
- **THEN** the PATCH request body contains only `description`
- **AND** does NOT contain `title`, `labels`, `priority`, `acceptanceCriteria`, or `status`

#### Scenario: ticket_updated WS event fires after patch
- **WHEN** the patch succeeds
- **THEN** a `ticket_updated` WS event is broadcast for the project
- **AND** subscribers receive the updated ticket payload including the new description

### Requirement: Refine failure is non-blocking and surfaces a recoverable toast

If the refine fails for any reason — model error, `chat_error`, crash that exhausts auto-respawn, malformed `contract-layer` block, hub-side parser exception, timeout at 60 seconds from refine spawn start — the hub MUST NOT patch the ticket description and MUST broadcast a project-scoped WebSocket event `explore.contract_refine_failed { ticketId, reason }` where `reason` is one of `model_error | crashed | malformed | timeout | parser_error`. The client SHALL react by showing a sonner toast on the SpecsBoard surface with copy "Contract layer skipped — ticket saved without it" and an action button `Reintentar`. Activating `Reintentar` SHALL invoke `POST /api/projects/:projectId/tickets/:id/contract-refine` to fire a fresh refine for the same ticket. The endpoint MUST require the toggle to be ON; otherwise it MUST respond 409. The retry MUST reuse the same `(conversationId, ticketId)` pair and the same lifecycle as the original refine.

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
- **WHEN** the client POSTs `POST /api/projects/:projectId/tickets/:id/contract-refine`
- **AND** the toggle is ON and the kill switch is inactive
- **THEN** a fresh refine spawn is scheduled for the same ticket id
- **AND** the response is 202 with `{ scheduled: true }`

#### Scenario: Retry endpoint rejects when toggle is OFF
- **WHEN** the client POSTs the retry endpoint while the toggle is OFF
- **THEN** the server responds 409 with an error code indicating the feature is disabled
- **AND** no spawn is scheduled

#### Scenario: Retry endpoint rejects unknown ticket
- **WHEN** the client POSTs the retry endpoint for a ticket id that does not exist
- **THEN** the server responds 404

### Requirement: Refine writes one ai_invocations row per turn

Each Contract Refine spawn SHALL write a single row to `ai_invocations` at process exit via the existing `recordInvocation` capture path. The row MUST have `surface='explore-spec'`, `conversation_id` equal to the parent Explore conversation id, and `ticket_id` equal to the ticket being refined. Other columns (`model`, `started_at`, `finished_at`, `duration_ms`, `duration_api_ms`, `tokens_in/out/cache_read/cache_create`, `total_cost_usd`, `num_turns`, `status`, `session_id`) MUST be populated using the same rules as Explore turns. Refine failures MUST still record a row with `status` set to `failed` or `aborted` so spending analytics absorb the cost transparently.

#### Scenario: Successful refine records one row
- **WHEN** a refine completes successfully and the ticket is patched
- **THEN** exactly one new `ai_invocations` row exists for the refine spawn
- **AND** the row's `surface='explore-spec'`, `conversation_id` matches the parent, and `ticket_id` matches the refined ticket

#### Scenario: Failed refine still records a row
- **WHEN** a refine fails because the spawn crashed and auto-respawn was exhausted
- **THEN** an `ai_invocations` row is still recorded for the failed attempt
- **AND** its `status` is `failed` or `aborted`

#### Scenario: ticket_id back-fill works for flipped drafts
- **WHEN** the refine fires after a flip-in-place draft commit
- **THEN** the recorded `ticket_id` is the flipped ticket id (not a new id)
- **AND** matches the ticket id targeted by the patch

### Requirement: SettingsPage Explore Spec card includes the toggle

The client `SettingsPage` SHALL render a toggle labelled `Enrich committed specs with a Contract Layer` (or equivalent Spanish copy used by the project) inside the existing `Explore Spec` card. The toggle MUST be wired to `GET/PATCH /api/projects/:projectId/explore-contract-refine-enabled`. The card MUST include a short helper line describing the trade-off (e.g., "Adds ~3-8 s background work and ~2× cost per Explore spec"). The toggle MUST NOT add a new card or restructure the existing Explore Spec card.

#### Scenario: Toggle reflects server state on mount
- **WHEN** the SettingsPage mounts for a project where the server reports `enabled: true`
- **THEN** the toggle renders in the ON position

#### Scenario: Toggle persists on change
- **WHEN** the user flips the toggle from OFF to ON
- **THEN** the client sends `PATCH /api/projects/:projectId/explore-contract-refine-enabled` with `{ enabled: true }`
- **AND** the toggle remains ON across page reloads

#### Scenario: Helper copy describes trade-off
- **WHEN** the toggle is rendered
- **THEN** a short helper line near the toggle informs the user of the latency and cost trade-off

### Requirement: TicketDetailModal renders Contract Layer collapsed by default

When a ticket's description contains a Contract Layer section (delimited by the `\n\n---\n\n## Contract Layer\n\n` prefix), `TicketDetailModal` SHALL render the body in two regions: the user-authored body (rendered normally) and the Contract Layer region rendered inside a collapsible disclosure widget that defaults to collapsed. The disclosure header MUST display the label `Contract Layer` and an indicator of whether sections are populated (e.g., a count badge of non-N/A subsections). Expanding the disclosure MUST reveal the full Contract Layer markdown. SpecsBoard previews (and any other card-style summary surface) MUST ignore content after the `\n\n---\n\n` separator when computing the preview text.

#### Scenario: Modal renders collapsed disclosure
- **WHEN** the modal opens for a ticket whose description contains a Contract Layer section
- **THEN** a collapsible disclosure with the label `Contract Layer` is rendered after the user-authored body
- **AND** the disclosure is collapsed by default

#### Scenario: Expand reveals full Contract Layer
- **WHEN** the user clicks the disclosure header
- **THEN** the disclosure expands to show all five subsections rendered as markdown

#### Scenario: SpecsBoard preview ignores Contract Layer
- **WHEN** SpecsBoard renders a card preview for a ticket whose description contains a Contract Layer
- **THEN** the preview text is computed from only the user-authored portion of the description (everything before `\n\n---\n\n`)

#### Scenario: Ticket without Contract Layer renders unchanged
- **WHEN** the modal opens for a ticket whose description does not contain the Contract Layer separator
- **THEN** no disclosure is rendered
- **AND** the description renders identically to today

### Requirement: SpecsBoard surface tracks refine pending and failure states

The client SHALL render a sonner toast on the SpecsBoard surface for each ticket whose refine is in-flight. The toast text SHALL be `Afinando contrato…` and the toast id MUST be derived deterministically from the ticket id so consecutive refines do not stack. On `ticket_updated` (refine success) the toast MUST be dismissed automatically. On `explore.contract_refine_failed` the toast MUST swap to an error variant with copy `Contract layer skipped — ticket saved without it` and an action `Reintentar` that POSTs to the retry endpoint. The toast MUST be dismissable manually at any time.

#### Scenario: Pending toast appears on commit when toggle is ON
- **WHEN** the user commits an Explore spec with the toggle ON
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
