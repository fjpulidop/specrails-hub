## ADDED Requirements

### Requirement: contextScope carries contractRefine per conversation

The server-side `ContextScope` type SHALL gain a `contractRefine: boolean` field, persisted in `chat_conversations.context_scope` JSON alongside the existing `specrails`, `openspec`, `full`, `mcp` flags. `normalizeContextScope` MUST default missing `contractRefine` values to `false`. `defaultBootScope('explore', mcpEnabled, contractRefineEnabled)` MUST derive the initial value from the project's `explore_contract_refine_enabled` setting.

#### Scenario: contractRefine defaults to false when absent in stored scope
- **GIVEN** a legacy `chat_conversations` row whose `context_scope` JSON lacks `contractRefine`
- **WHEN** the runner reads the scope via `normalizeContextScope`
- **THEN** `contractRefine` is `false`

#### Scenario: defaultBootScope reads the project setting
- **GIVEN** the project's `explore_contract_refine_enabled` is `true` and `explore_mcp_enabled` is `false`
- **WHEN** `defaultBootScope('explore', false, true)` is called
- **THEN** the returned scope has `contractRefine: true` and `mcp: false`

#### Scenario: contractRefine round-trips through JSON
- **WHEN** a scope `{ specrails: true, openspec: false, full: true, mcp: false, contractRefine: true }` is JSON-stringified and re-normalised
- **THEN** every flag including `contractRefine` round-trips byte-equal

### Requirement: from-draft commit reads contractRefine from conversation scope

When `POST /tickets/from-draft` schedules `runContractRefine` after a successful commit, the runner SHALL gate the spawn on `conversation.context_scope.contractRefine` first. If the field is `false` (including the legacy `false` default) the runner MUST early-return with `reason='scope-disabled'`. The project-wide `explore_contract_refine_enabled` setting MUST NOT be consulted by the from-draft path going forward, except as the boot default value the Add Spec modal pre-fills.

#### Scenario: Per-conversation false skips refine even when project default is true
- **GIVEN** the project setting `explore_contract_refine_enabled` is `true`
- **AND** the committed conversation's `context_scope.contractRefine` is `false`
- **WHEN** the user commits via `Create Spec`
- **THEN** no refine spawn is scheduled
- **AND** the ticket has no Contract Layer appended

#### Scenario: Per-conversation true fires refine even when project default is false
- **GIVEN** the project setting is `false`
- **AND** the committed conversation's `context_scope.contractRefine` is `true`
- **WHEN** the user commits via `Create Spec`
- **THEN** a refine spawn is scheduled
- **AND** on success the ticket gains a Contract Layer section

#### Scenario: New scope-disabled reason recorded as failed invocation
- **WHEN** the runner early-returns with `reason='scope-disabled'`
- **THEN** no `claude` process is spawned
- **AND** no `ai_invocations` row is recorded for that attempt
- **AND** no `explore.contract_refine_failed` WS event is broadcast

### Requirement: Retry endpoint stays gated by the project setting

`POST /api/projects/:projectId/tickets/:id/contract-refine` SHALL continue to gate on the project-wide `explore_contract_refine_enabled` setting and the hub-wide kill switch, NOT on the originating conversation's `contextScope.contractRefine`. Tickets created with `contractRefine=false` in their scope MUST still be retriable when the project default is `true`.

#### Scenario: Retry succeeds for a ticket whose origin scope opted out
- **GIVEN** ticket `T` whose origin Explore conversation had `context_scope.contractRefine=false`
- **AND** the project setting is `true`
- **WHEN** the user POSTs the retry endpoint for `T`
- **THEN** the server responds 202 with `{ scheduled: true }`
- **AND** a refine spawn fires for `T`

#### Scenario: Retry rejected when project setting is OFF
- **GIVEN** the project setting is `false`
- **WHEN** the user POSTs the retry endpoint
- **THEN** the server responds 409 regardless of the conversation's stored scope

### Requirement: Quick mode supports Contract Refine after generate-spec

The `POST /api/projects/:projectId/tickets/generate-spec` endpoint SHALL accept an optional `contractRefine: boolean` field in its request body. When `true` and the kill switch is inactive and the project setting permits it, the server MUST schedule `runContractRefine` after the generated ticket is persisted. The refine spawn MUST use a one-shot pathway (no `--resume`, no parent conversation): the system prompt is augmented with the just-generated `title` and `description` so the model has the spec body in-context, and the recorded `ai_invocations` row uses `surface='quick-spec'` with `conversation_id=null` and the new ticket id.

#### Scenario: Quick toggle ON fires refine after generation
- **GIVEN** the kill switch is inactive and the project setting permits refine
- **WHEN** the client posts `{ idea, contractRefine: true }` to `generate-spec`
- **THEN** the ticket is created normally
- **AND** within 100 ms of the response the refine spawn is scheduled
- **AND** the refine spawn argv does NOT include `--resume`

#### Scenario: Quick toggle OFF skips refine
- **WHEN** the client posts `{ idea, contractRefine: false }` to `generate-spec`
- **THEN** the ticket is created and no refine spawn is scheduled

#### Scenario: Quick refine writes a quick-spec invocation row
- **WHEN** a Quick refine completes successfully
- **THEN** an `ai_invocations` row exists with `surface='quick-spec'`, `conversation_id IS NULL`, and `ticket_id` equal to the new ticket id

#### Scenario: Quick refine respects the kill switch
- **GIVEN** the env kill switch is active
- **WHEN** the client posts `{ idea, contractRefine: true }`
- **THEN** the ticket is created and no refine spawn is scheduled

### Requirement: Add Spec modal Explore mode renders the six-stop slider

In Explore mode, the Add Spec modal SHALL render a `<ContextScopeSlider>` component in place of the existing four-checkbox row. The slider MUST expose exactly six stops in fixed left-to-right order: `Minimal`, `Light`, `Standard`, `Rich`, `Max`, `Hub`. The label of the active stop MUST be highlighted; inactive stop labels MUST remain visible. A one-line cost summary MUST appear directly below the rail, copy fixed per stop (see design.md D5). The `▾ Fine-tune` disclosure MUST render below the cost line and contain the five individual flag toggles (`specrails`, `openspec`, `full`, `mcp`, `contractRefine`), bound to the same state as the slider.

#### Scenario: Initial mount picks the matching preset
- **WHEN** the modal opens with a boot scope matching `Rich` (specrails+openspec+full, mcp=false, contractRefine=false)
- **THEN** the slider thumb sits on the `Rich` stop
- **AND** the active stop label is highlighted

#### Scenario: Drag and release snaps to nearest stop
- **WHEN** the user drags the thumb 60 % of the rail width to the right and releases mid-air
- **THEN** the thumb snaps to the closest stop on release
- **AND** the bound scope flags update to that preset's combination
- **AND** the cost line updates to the new preset's copy

#### Scenario: Click on a stop dot jumps to that preset
- **WHEN** the user clicks on the `Max` stop label / dot
- **THEN** the thumb animates to `Max`
- **AND** the bound flags are `{ specrails: true, openspec: true, full: true, mcp: false, contractRefine: true }`

#### Scenario: Keyboard arrow keys move one stop
- **GIVEN** focus on the slider with the thumb on `Standard`
- **WHEN** the user presses `ArrowRight`
- **THEN** the thumb moves to `Rich`
- **AND** `ArrowLeft` from `Rich` moves back to `Standard`
- **AND** `End` jumps to `Hub`
- **AND** `Home` jumps to `Minimal`

#### Scenario: Touch / pointer-events drag works in webview
- **WHEN** a pointer-down on the thumb is followed by a pointer-move and pointer-up
- **THEN** the slider tracks the pointer and snaps on pointer-up
- **AND** the same handlers fire for both mouse and touch input types

### Requirement: Custom indicator appears when the scope matches no preset

When the bound scope combination does not match any of the six preset rows exactly, the slider MUST render a `Custom` pill that replaces the active-stop highlight, positioned between the two nearest stops by interpolated cost rank. The user MUST NOT be able to drag *to* `Custom`; dragging always snaps to one of the six preset stops on release.

#### Scenario: Toggling a single flag off-preset enters Custom
- **GIVEN** the slider is on `Standard` (specrails+openspec, others false)
- **WHEN** the user opens Fine-tune and toggles `contractRefine` on
- **THEN** the slider shows the `Custom` pill (no preset matches `specrails+openspec+contractRefine`)
- **AND** the cost line reads "Custom mix — see Fine-tune below"

#### Scenario: Dragging from Custom snaps to a preset, never to Custom
- **GIVEN** the slider is currently in the Custom state
- **WHEN** the user drags the thumb and releases anywhere on the rail
- **THEN** the thumb snaps to one of the six preset stops
- **AND** the Custom pill disappears

### Requirement: Fine-tune disclosure stays available

The `▾ Fine-tune` disclosure under the slider MUST render five aligned rows, one per flag: `Specrails specs`, `OpenSpec specs`, `Full repo read`, `External tools (MCPs)`, `Enrich with Contract Layer`. Each row MUST render the toggle styled identically to the existing Settings page toggles (height `h-5`, width `w-9`, theme tokens, `shrink-0`). Toggling any flag MUST write through to the same state the slider reads, so the slider's thumb position re-derives automatically.

#### Scenario: Disclosure starts collapsed
- **WHEN** the modal opens
- **THEN** the Fine-tune disclosure is collapsed by default
- **AND** the slider is fully visible above it

#### Scenario: Expanding the disclosure reveals five toggles
- **WHEN** the user clicks the `▾ Fine-tune` chevron
- **THEN** the five toggles render in fixed order: specrails, openspec, full, mcp, contractRefine
- **AND** the chevron rotates to `▴`

#### Scenario: Toggle changes propagate to the slider position
- **WHEN** the user clicks the `Specrails specs` toggle off while on `Standard`
- **THEN** the slider re-derives to `Custom` (specrails off but openspec on does not match any preset)

### Requirement: contractRefine persists in add_spec_context_scope_last

The per-project `add_spec_context_scope_last` payload SHALL include `contractRefine: boolean` alongside the other four flags. Boot order in the modal: (a) per-project last value when present → (b) `defaultBootScope` from project settings.

#### Scenario: Last value rehydrates on next open
- **GIVEN** the user last committed an Explore spec with scope `{ ..., contractRefine: true }`
- **WHEN** the user opens the Add Spec modal again for the same project
- **THEN** the slider boots on a preset that includes `contractRefine: true` (`Max` or `Hub`, depending on other flags) — or `Custom` if no preset matches

#### Scenario: Missing field in legacy payload normalises to false
- **GIVEN** a stored `add_spec_context_scope_last` payload without `contractRefine`
- **WHEN** the modal boots
- **THEN** `contractRefine` is `false`
- **AND** the slider position reflects the matching preset for the remaining flags (or Custom)

### Requirement: Quick mode renders a standalone Contract Refine toggle

In Quick mode, the Add Spec modal SHALL render a single toggle labelled `Enrich with Contract Layer` underneath the model picker. The toggle MUST NOT render in Explore mode (where the slider already covers Contract Refine). The boot value of the Quick toggle MUST come from `add_spec_quick_contract_refine_last` (per project) when present, else the project setting `explore_contract_refine_enabled`. The toggle's value MUST be included in the request body of `POST /tickets/generate-spec` as `contractRefine: boolean`.

#### Scenario: Toggle visible only in Quick mode
- **WHEN** the user selects `Quick` in the segmented control
- **THEN** the Contract Refine toggle renders below the model picker
- **AND** when the user switches to `Explore` the toggle disappears (the slider covers it instead)

#### Scenario: Quick last-used value rehydrates on next open
- **GIVEN** the user last submitted a Quick spec with the toggle ON
- **WHEN** the user reopens the modal in Quick mode for the same project
- **THEN** the toggle boots ON

#### Scenario: Quick submit sends the field in the request body
- **WHEN** the user submits with the toggle ON
- **THEN** the body of the `POST /tickets/generate-spec` request includes `contractRefine: true`

### Requirement: Contract Refine sits at the heavy end of the slider

The slider's preset-to-flag mapping MUST place `contractRefine: true` ONLY at the two heaviest stops: `Max` and `Hub`. The four lighter stops (`Minimal`, `Light`, `Standard`, `Rich`) MUST keep `contractRefine: false`. This positioning communicates that Contract Refine is the highest-cost / highest-output option.

#### Scenario: Light stops do not enable Contract Refine
- **WHEN** the slider is on any of `Minimal`, `Light`, `Standard`, or `Rich`
- **THEN** the bound scope's `contractRefine` is `false`

#### Scenario: Max and Hub stops enable Contract Refine
- **WHEN** the slider is on `Max` or `Hub`
- **THEN** the bound scope's `contractRefine` is `true`

### Requirement: Settings page relabels the project default

The Settings page Explore Spec card SHALL relabel the existing Contract Refine toggle to "Default for new Explore specs" with helper copy that clarifies the value seeds the modal's default and gates retry attempts. The PATCH endpoint and storage shape MUST be unchanged.

#### Scenario: Card label uses the new copy
- **WHEN** the user opens Settings → Explore Spec card
- **THEN** the second toggle reads "Default for new Explore specs"
- **AND** a helper line explains "Seeds the toggle in Add Spec and gates manual retry attempts"

#### Scenario: Endpoint shape unchanged
- **WHEN** the client PATCHes `/explore-contract-refine-enabled` with `{ enabled: true }`
- **THEN** the server still responds `{ enabled: true }` (no schema change)
