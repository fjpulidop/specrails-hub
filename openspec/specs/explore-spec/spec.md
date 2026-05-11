# explore-spec Specification

## Purpose
TBD - created by archiving change add-explore-spec-mode. Update Purpose after archive.
## Requirements
### Requirement: Two-mode segmented control in Add Spec
The `Add Spec` modal SHALL render a segmented control with exactly two modes — `Quick` and `Explore` — and SHALL NOT render the legacy `Explore codebase` checkbox. `Quick` MUST be selected by default. The user's mode choice MUST persist for the duration of the modal session and reset when the modal closes.

#### Scenario: Quick is the default
- **WHEN** the user opens the Add Spec modal
- **THEN** the `Quick` mode is selected
- **AND** the legacy `Explore codebase` checkbox is not present anywhere in the modal

#### Scenario: Switching mode preserves the typed idea
- **WHEN** the user types text in the composer and switches between `Quick` and `Explore`
- **THEN** the typed text is preserved
- **AND** the submit button label updates to reflect the selected mode (`Generate Spec` for Quick, `Continue` for Explore)

#### Scenario: Modal close resets mode
- **WHEN** the user closes the modal in Explore mode and reopens it
- **THEN** the modal opens in Quick mode again

### Requirement: Quick mode preserves existing fast-path behaviour
The `Quick` mode SHALL behave identically to the current default `Generate Spec` flow: the user's idea, any attachments, and the model selected in the Add Spec model picker are sent to `POST /api/projects/:projectId/tickets/generate-spec`, the modal closes, and a toast tracks generation progress until the new ticket appears.

#### Scenario: Quick submits to generate-spec
- **WHEN** the user types an idea in Quick mode and clicks `Generate Spec`
- **THEN** the modal closes
- **AND** a `POST /api/projects/<id>/tickets/generate-spec` is sent with `{ idea, attachmentIds, pendingSpecId, model }`
- **AND** a loading toast is shown until the ticket is generated

#### Scenario: Quick supports attachments
- **WHEN** the user attaches a file in Quick mode and submits
- **THEN** the attachment ids are included in the request payload
- **AND** the attachments are bound to the new ticket on success

#### Scenario: Quick forwards selected model
- **WHEN** the user picks a non-default model in the Add Spec picker and submits in Quick mode
- **THEN** the request body's `model` field equals the picker's selected value

### Requirement: Explore mode opens a full-screen overlay shell
Selecting `Explore` and submitting the initial idea SHALL replace the modal with a full-screen overlay using the same visual language as `AI Edit`: eyebrow `EXPLORE SPEC · interactive`, headline copy, two-column layout (conversation left, draft right), composer at the bottom with optional chip row, header back-arrow and close button.

#### Scenario: Initial idea becomes first user message
- **WHEN** the user types `dark mode toggle` in Explore mode and clicks `Continue`
- **THEN** the modal is replaced by the Explore Spec overlay
- **AND** `dark mode toggle` appears as the first user turn in the conversation history
- **AND** Claude's response begins streaming within 2 seconds of overlay mount

#### Scenario: Header chrome matches AI Edit
- **WHEN** the overlay is open
- **THEN** the header shows a back arrow on the left, `EXPLORE SPEC · interactive` eyebrow, and a close `✕` on the right
- **AND** the layout reserves space for macOS native traffic-light controls when running under Tauri on macOS

#### Scenario: Two-column layout
- **WHEN** the overlay is open with at least one assistant turn complete
- **THEN** the left column shows the conversation as a vertical scroll of user/assistant turn bubbles
- **AND** the right column shows the structured draft fields
- **AND** the composer is anchored at the bottom of the left column

### Requirement: Structured draft panel with editable fields
The right column SHALL render the live draft as discrete editable controls covering: `title` (text input), `priority` (select with `low | medium | high | critical`), `labels` (chip multi-add/remove), `description` (multi-line textarea), `acceptanceCriteria` (bulleted list with add/remove). Every field MUST be editable by the user at any moment. Field changes pushed by Claude MUST animate (200ms background flash) only on the modified field.

#### Scenario: Manual edit persists across Claude updates
- **WHEN** the user types `low` in the priority select while the latest Claude turn proposed `high`, and then sends another user message and Claude responds again with `priority: high` in its draft block
- **THEN** between user message N and Claude turn N+1 the user's `low` value remains visible
- **AND** after the user sends message N+1, Claude's next draft update may overwrite `priority` if it does so explicitly

#### Scenario: Claude update animates only changed fields
- **WHEN** Claude's turn produces a draft block changing `description` only
- **THEN** the description textarea bg flashes for 200ms
- **AND** other fields do not animate

#### Scenario: All fields independently editable
- **WHEN** the user clicks any field while the assistant is streaming
- **THEN** the field accepts input
- **AND** the streaming continues unaffected on the left

### Requirement: Fenced spec-draft block protocol
The hub SHALL recognise a fenced code block tagged ` ```spec-draft ` in any assistant message produced during an Explore conversation and MUST parse the JSON payload, broadcast a `spec_draft.update` WebSocket event with the merged draft, and remove the block from the chat content delivered to clients.

#### Scenario: Valid block updates the draft and is stripped
- **WHEN** the assistant turn body contains a valid `spec-draft` block with `{ "title": "X", "ready": false }`
- **THEN** the chat content broadcast to the WS strips the entire fenced block
- **AND** a `spec_draft.update` message is broadcast to subscribers with the merged draft including `title: "X"` and `ready: false`

#### Scenario: Invalid JSON is ignored without crash
- **WHEN** the assistant turn contains a block with malformed JSON
- **THEN** the block is treated as plain text in the chat content
- **AND** no `spec_draft.update` event is emitted for that turn
- **AND** a server warning is logged with the conversation id

#### Scenario: Unknown fields are dropped
- **WHEN** the block contains `{ "title": "X", "foo": "bar", "priority": "weird" }`
- **THEN** `title: "X"` is merged into the draft
- **AND** the unknown `foo` field is dropped silently
- **AND** the invalid `priority` value is dropped silently and the prior priority is retained

#### Scenario: Empty strings are treated as no-op
- **WHEN** the block contains `{ "title": "", "description": "Updated text" }`
- **THEN** the draft `title` is unchanged
- **AND** the draft `description` is set to `"Updated text"`

#### Scenario: Arrays replace, not append
- **WHEN** the prior draft has `labels: ["ui"]` and the new block has `labels: ["ui", "theme"]`
- **THEN** the merged draft has `labels: ["ui", "theme"]`
- **AND** when a subsequent block has `labels: []` the merged draft has `labels: []`

### Requirement: Always-available Create Spec action
The overlay SHALL render a `Create Spec` action that is enabled the moment the draft has a non-empty `title`. The action MUST visually amplify (filled primary background plus a soft pulse animation) when the latest draft block reports `ready: true`. The action MUST be disabled when `title` is empty or only whitespace. There MUST be no auto-create behaviour.

#### Scenario: Disabled before title exists
- **WHEN** the draft has no title and Claude has not yet produced one
- **THEN** the `Create Spec` button is rendered disabled with a subtle hint that a title is required

#### Scenario: Available as soon as title appears
- **WHEN** Claude's first draft block sets a non-empty `title`
- **THEN** the button is enabled in its outline (non-amplified) appearance

#### Scenario: Amplified on ready true
- **WHEN** the latest assistant turn emits a draft block with `ready: true`
- **THEN** the button switches to filled primary background with a continuous soft pulse
- **AND** a small banner `✦ Draft ready` is shown above the button

#### Scenario: User commits at any time
- **WHEN** the user clicks the button while it is enabled
- **THEN** the current draft is committed via the from-draft endpoint and the overlay closes regardless of `ready` state

### Requirement: Commit endpoint for structured draft
The hub SHALL expose `POST /api/projects/:projectId/tickets/from-draft` that accepts `{ title, description, labels, priority, acceptanceCriteria }`, validates the payload, inserts the ticket into the project's `local-tickets.json` directly without invoking any LLM generation, and returns the inserted ticket. The route MUST reject empty or whitespace-only `title` with HTTP 400.

#### Scenario: Successful commit returns the ticket
- **WHEN** the client posts a valid draft to `from-draft`
- **THEN** the server inserts a new ticket with the supplied fields
- **AND** responds 200 with the inserted ticket including its assigned numeric `id` and `source: "propose-spec"`

#### Scenario: Empty title rejected
- **WHEN** the client posts `{ title: "  ", description: "..." }`
- **THEN** the server responds 400 with an error message identifying the missing title
- **AND** no ticket is inserted

#### Scenario: Invalid priority normalised
- **WHEN** the payload contains `priority: "weird"` and other valid fields
- **THEN** the server defaults `priority` to `"medium"` and inserts the ticket
- **AND** the response reflects the normalised priority

#### Scenario: Labels and criteria default to empty
- **WHEN** the payload omits `labels` and `acceptanceCriteria`
- **THEN** the inserted ticket has `labels: []` and `acceptanceCriteria: []`

### Requirement: Slash command and system prompt for explore-spec
The hub SHALL provide a slash command `/specrails:explore-spec` whose body instructs Claude to (1) act as an interactive thinking partner, (2) ask only the questions necessary to clarify scope, (3) maintain a structured draft via fenced ` ```spec-draft ` JSON blocks, (4) set `ready: true` in the block when the draft is in good enough shape to commit, and (5) never create a ticket itself. The command body MUST include at least two few-shot examples showing the fenced-block convention.

#### Scenario: Explore submit invokes the slash command
- **WHEN** the Explore overlay mounts with the user's initial idea
- **THEN** the chat is started with a prompt that begins with `/specrails:explore-spec` and includes the user's idea as the message body

#### Scenario: System prompt forbids self-creation
- **WHEN** Claude is operating under the `/specrails:explore-spec` prompt
- **THEN** the prompt explicitly tells the model that the hub will commit the ticket and the model MUST NOT call any ticket-creation slash command or write to `local-tickets.json`

### Requirement: Conversation-scoped state with stateless lifecycle
The Explore overlay SHALL maintain conversation and draft state for the lifetime of a single overlay session. Closing the overlay (X, back-arrow, or Esc) SHALL discard the conversation and the draft. There MUST be no persistence across overlay sessions.

#### Scenario: Close discards everything
- **WHEN** the user closes the overlay after 4 turns
- **THEN** no records of the conversation or draft remain in client memory
- **AND** reopening Explore from the modal starts a fresh conversation with no prior context

#### Scenario: Confirm-discard guard on non-empty conversation
- **WHEN** the user attempts to close the overlay (X, back-arrow, or Esc) with at least one assistant turn beyond the initial user idea
- **THEN** a confirmation dialog appears with `Discard conversation?` and a destructive primary action
- **AND** dismissing the dialog returns to the overlay
- **AND** confirming closes the overlay and discards state

#### Scenario: No confirm on bare-initial overlay
- **WHEN** the user closes the overlay before Claude's first response
- **THEN** the overlay closes without a confirmation dialog

### Requirement: Draft pane suggested chips
The Explore overlay SHALL render up to three quick-reply chips above the composer when the latest assistant turn includes a `chips` array in its `spec-draft` block. Clicking a chip SHALL send its text as the next user message immediately. When no chips are provided by the latest turn, the chip row MUST NOT render any fallback chips.

#### Scenario: Chips render and submit
- **WHEN** the assistant turn emits `chips: ["Looks good — create", "Smaller scope"]`
- **THEN** two chips render above the composer
- **AND** clicking `Looks good — create` sends that string as the next user message

#### Scenario: No fallback chips
- **WHEN** the assistant turn omits the `chips` field
- **THEN** the chip row is not rendered

#### Scenario: Chips capped at three
- **WHEN** the assistant turn emits four chip strings
- **THEN** only the first three are rendered

### Requirement: Streaming defers draft updates to turn end
While an assistant turn is streaming the draft pane SHALL NOT update mid-stream. Draft updates MUST only apply once the assistant turn completes and the fenced block is parsed end-to-end. The pane MAY render a subtle "draft updating…" hint when the streaming text contains the start delimiter ` ```spec-draft `.

#### Scenario: No partial update mid-stream
- **WHEN** an assistant turn streams text that includes the start of a `spec-draft` block but the turn has not finished
- **THEN** the draft fields do not change
- **AND** an "updating…" hint may appear above the title field

#### Scenario: Update applies on turn complete
- **WHEN** the streaming turn completes with a fully formed `spec-draft` block
- **THEN** the draft updates and any changed fields animate
- **AND** the "updating…" hint disappears

### Requirement: Explore launch payload carries the selected model

The Explore launch handoff (the `onExploreLaunch` payload from the Add Spec modal to the parent that owns `ExploreSpecShell`) SHALL include the model selected in the Add Spec picker as `model: string`. The Explore conversation MUST be created with that model as its `model` field, and the model MUST remain fixed for every assistant turn in that conversation for the lifetime of the conversation.

#### Scenario: Payload includes model
- **WHEN** the user picks `opus` and clicks `Continue` in Explore mode
- **THEN** the `ExploreLaunchPayload` passed to `onExploreLaunch` includes `model: "opus"`

#### Scenario: Conversation seeded with chosen model
- **WHEN** the Explore conversation is created from the launch payload
- **THEN** the persisted conversation row's `model` equals the launch payload's `model`

#### Scenario: Subsequent turns reuse the seeded model
- **GIVEN** an Explore conversation seeded with `model: "haiku"`
- **WHEN** the user sends additional messages
- **THEN** every assistant turn is generated using `haiku`
- **AND** no UI surface changes the conversation's model mid-flow

### Requirement: ExploreSpec shell can be minimized to the dock

The ExploreSpec full-screen overlay SHALL expose a minimize control in its header, distinct from the existing back arrow and close (`×`) buttons. Activating the minimize control MUST hide the overlay without unmounting it, register a chip in the global minimized chats dock, and never trigger the discard-confirm dialog.

#### Scenario: Minimize hides overlay and adds chip
- **WHEN** the user clicks the minimize control on an ExploreSpec overlay with a non-empty composer
- **THEN** the overlay is hidden from the viewport
- **AND** a chip appears in the global minimized chats dock with the current draft title (or "Untitled spec" when empty) as its label
- **AND** no discard-confirm dialog is shown

#### Scenario: Restore from chip preserves all state
- **WHEN** the user clicks the chip for a previously minimized ExploreSpec session
- **THEN** the active project switches to the session's owning project (if different)
- **AND** the application navigates to the spec proposal entry route
- **AND** the overlay is shown with the same conversation history, draft fields, composer text, attachments, streaming state, and discard-confirm pending state as before minimize

#### Scenario: ExploreSpec shell hoisted out of ProposeSpecModal
- **WHEN** an ExploreSpec session is active and the user closes `ProposeSpecModal`
- **THEN** the ExploreSpec shell remains mounted (in the global minimized chats provider's hidden host)
- **AND** the session is added to the dock as a chip if it wasn't already visible there


### Requirement: ExploreSpec shell exposes a Save as Draft action

`ExploreSpecShell` SHALL render a `Save as Draft` action in its header (or equivalent persistent control surface), distinct from the back arrow, the minimize control, the close (`×`) button, and the existing `Create Spec` action. Activating the action MUST persist the current Explore session as a ticket with `status='draft'` and `origin_conversation_id` equal to the session's conversation id, and MUST close the shell without triggering the discard-confirm dialog. The action MUST be available whenever the conversation has at least one user-submitted turn.

#### Scenario: Save as Draft persists a draft ticket
- **WHEN** the user clicks `Save as Draft` on an Explore session whose conversation id is `C` and that has at least one user-submitted turn
- **THEN** a ticket is created with `status='draft'` and `origin_conversation_id = C`
- **AND** the shell closes
- **AND** no discard-confirm dialog is shown

#### Scenario: Save as Draft is disabled before the user has spoken
- **WHEN** the user opens an Explore session and has not yet submitted any turn
- **THEN** the `Save as Draft` action is disabled (or hidden)

#### Scenario: Save as Draft reuses the existing draft ticket on a resumed session
- **WHEN** the user opened the session via `Continue Explore` from an existing draft ticket `T`
- **AND** the user clicks `Save as Draft`
- **THEN** the existing ticket `T` is updated in place (its title may be regenerated only if previously empty; `origin_conversation_id` is preserved)
- **AND** no second draft ticket is created

### Requirement: Auto-title is generated when saving a draft without a title

When the server receives a save-as-draft request and no human-meaningful title has been produced for the conversation yet, it SHALL generate a non-empty title from the conversation transcript before persisting the ticket. The generated title MUST be a meaningful, single-line string suitable for display on the board card. The user MAY edit the title after saving via the existing ticket-edit affordances.

#### Scenario: Empty-title save produces a generated title
- **WHEN** the server receives a save-as-draft request whose payload has no title or an empty title
- **AND** the conversation has at least one user-submitted turn
- **THEN** the persisted ticket has a non-empty single-line title

#### Scenario: User-provided title is honoured verbatim
- **WHEN** the server receives a save-as-draft request whose payload contains a non-empty title
- **THEN** the persisted ticket's title equals the provided value

#### Scenario: Auto-title fallback when summarization fails
- **WHEN** the auto-title generator fails or times out
- **THEN** the server falls back to a deterministic title derived from the first user-submitted turn
- **AND** the request still succeeds with a non-empty title

### Requirement: Close-without-commit prompts the user with Save / Discard / Cancel

When the user attempts to close `ExploreSpecShell` (via Esc, the close `×` button, or any equivalent gesture) while the conversation has unsaved content and the session is NOT a no-op resume of an unchanged draft, the shell SHALL present a three-way prompt: `Save as Draft`, `Discard`, and `Cancel`. `Save as Draft` MUST be the default-focused action. `Discard` MUST retain the existing destructive-confirm semantics (the conversation is removed). `Cancel` MUST keep the shell open without persisting anything. The minimize control MUST NOT trigger this prompt.

#### Scenario: Close on a dirty session shows the three-way prompt
- **WHEN** the user closes the shell on a session with unsaved content
- **THEN** a prompt appears with `Save as Draft`, `Discard`, and `Cancel`
- **AND** `Save as Draft` is the default-focused action

#### Scenario: Save as Draft from the close prompt persists and closes
- **WHEN** the user activates `Save as Draft` from the close prompt
- **THEN** the session is persisted as a draft ticket
- **AND** the shell closes

#### Scenario: Discard from the close prompt removes the conversation
- **WHEN** the user activates `Discard` from the close prompt
- **THEN** the conversation is removed and the shell closes
- **AND** no draft ticket is created

#### Scenario: Cancel keeps the shell open
- **WHEN** the user activates `Cancel` from the close prompt
- **THEN** the shell remains open and the session is unchanged

#### Scenario: Minimize bypasses the prompt
- **WHEN** the user activates the minimize control on a dirty session
- **THEN** the existing minimize-to-toast behaviour fires
- **AND** the three-way close prompt is not shown

### Requirement: Continue Explore reopens the shell from a draft ticket

When `ExploreSpecShell` is opened with a `resumeConversationId` corresponding to a draft ticket (i.e., the conversation is the `origin_conversation_id` of a ticket with `status='draft'`), the shell SHALL hydrate the session with the persisted conversation history, draft fields, attachments, and streaming state. The ticket's `status` MUST remain `draft` while the resumed session is active. The Save as Draft action and the close-prompt flow defined above MUST apply to the resumed session.

#### Scenario: Resume hydrates conversation state
- **WHEN** the shell opens with a `resumeConversationId` that points to a draft ticket's `origin_conversation_id`
- **THEN** the conversation history, draft fields, attachments, and streaming state are restored from the server

#### Scenario: Status stays draft during resumed session
- **WHEN** the user is exploring inside a resumed draft session
- **THEN** the underlying ticket's `status` remains `draft`
- **AND** the ticket continues to render with the draft visual treatment on the board

#### Scenario: Save during resumed session updates the existing ticket
- **WHEN** the user activates `Save as Draft` (explicit button or close-prompt) on a resumed session
- **THEN** the existing draft ticket is updated in place
- **AND** no new ticket is created

### Requirement: Commit endpoint flips an existing draft ticket in place

When the user invokes the existing `Create Spec` action (which calls `POST /tickets/from-draft`) and the source is a draft ticket, the server SHALL update the existing ticket row instead of creating a new one. The transition MUST set `status` to the configured initial active status (e.g., `todo`), set a non-null `priority`, update title/description/spec body to the final values, and preserve `origin_conversation_id`. When the source is not a draft ticket (legacy callsite), the previous insert behaviour MUST be preserved.

#### Scenario: Commit transitions the draft ticket in place
- **WHEN** the user activates `Create Spec` on a session originating from draft ticket `T`
- **THEN** the row for `T` is updated with `status` set to the initial active status, a non-null `priority`, and the final title/description/spec content
- **AND** `T.origin_conversation_id` retains the conversation id it had while in draft
- **AND** no second ticket is created

#### Scenario: Legacy commit path still creates a new ticket
- **WHEN** the existing `from-draft` endpoint is called with a payload that does not reference a draft ticket
- **THEN** a new ticket is created with the previous (pre-change) behaviour

#### Scenario: Commit rejects when priority cannot be resolved
- **WHEN** a commit request from a draft ticket arrives with no `priority` and the draft has `priority IS NULL`
- **THEN** the server rejects the request with a 400-class error
- **AND** the ticket remains `status='draft'`

### Requirement: Explore turns spawn from a hub-managed cwd by default

Every Explore conversation turn (chat conversations with `kind='explore'`) SHALL spawn `claude` with `cwd = ~/.specrails/projects/<slug>/explore-cwd/` UNLESS the per-project `explore_mcp_enabled` setting is `true`. The hub-managed cwd MUST contain a hub-owned `CLAUDE.md` and a symlink `./project` (junction on Windows) pointing at the project's absolute path. The user's `<project>/CLAUDE.md` MUST NOT be modified, moved, deleted, or referenced by the spawn cwd in any way.

#### Scenario: Default Explore turn uses the hub-managed cwd

- **WHEN** an Explore conversation sends its first turn and `explore_mcp_enabled` is unset or `false`
- **THEN** `claude` is spawned with `cwd` equal to `~/.specrails/projects/<slug>/explore-cwd/`
- **AND** that directory contains a hub-owned `CLAUDE.md` file
- **AND** that directory contains a `project` entry that resolves to the project's absolute path

#### Scenario: Toggle ON falls back to legacy spawn cwd

- **WHEN** an Explore turn is sent and `explore_mcp_enabled` is `true`
- **THEN** `claude` is spawned with `cwd` equal to `<project.path>`
- **AND** the hub-managed `explore-cwd/` directory is not used for that turn

#### Scenario: Project CLAUDE.md is never touched

- **WHEN** an Explore conversation is created, run, resumed, minimized, restored, or closed
- **THEN** the file `<project.path>/CLAUDE.md` is not modified, moved, or deleted by the hub
- **AND** the hub-managed `explore-cwd/CLAUDE.md` is a separate file with hub-owned content

### Requirement: Explore-cwd lifecycle is hub-managed

The hub SHALL ensure the per-project `explore-cwd/` directory exists, contains an up-to-date hub-owned `CLAUDE.md`, and exposes a `./project` link to the project path before any Explore turn spawns from it. The directory MUST be created lazily on first use rather than eagerly at server start. When a project is removed via `ProjectRegistry.removeProject`, the directory MUST be removed recursively (the `./project` link MUST be unlinked, not followed). When the hub version changes, the embedded `CLAUDE.md` content MUST be re-materialised on next use so the on-disk file matches the embedded template. The symlink MUST be recreated when the project's path has changed since last use.

#### Scenario: First Explore turn materialises the cwd

- **WHEN** a project sends its first ever Explore turn
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` is created
- **AND** `CLAUDE.md` is written from the embedded template
- **AND** `project` link is created pointing at `<project.path>`

#### Scenario: Project removal cleans up

- **WHEN** the project is removed from the hub registry
- **THEN** `~/.specrails/projects/<slug>/explore-cwd/` no longer exists
- **AND** any active Explore spawn for that project is terminated

#### Scenario: Hub version bump refreshes the template

- **WHEN** the hub starts after an upgrade and the next Explore turn fires
- **THEN** `explore-cwd/CLAUDE.md` is rewritten from the new embedded template
- **AND** the rewrite happens before the spawn

#### Scenario: Project path change triggers symlink recreation

- **WHEN** the registered project path differs from the symlink target on the next Explore turn
- **THEN** the existing `project` link is replaced with a fresh link to the current path
- **AND** the spawn proceeds with the corrected link in place

### Requirement: Explore system prompt is byte-stable across turns

The system prompt sent to `claude` for an Explore turn (i.e. when `options.lightweight === true`) MUST be byte-identical across two consecutive invocations of the same Explore conversation when neither the project name nor the attachment set has changed. The lightweight prompt builder MUST NOT inject timestamps, dynamic counts, job ids, recent-job summaries, cost figures, or any per-invocation data.

#### Scenario: Two consecutive lightweight prompt builds are byte-equal

- **WHEN** the lightweight system prompt is built twice in a row for the same project name with no attachments
- **THEN** the two strings are byte-for-byte equal

#### Scenario: Attachment-bearing turn appends a stable suffix

- **WHEN** the same prompt is built once with no attachments and once with attachments
- **THEN** the two strings differ only by appending the `USER_ATTACHMENT_SYSTEM_NOTE` suffix
- **AND** all other characters are unchanged

### Requirement: Per-project Use-MCPs-in-Explore toggle defaults OFF

The hub SHALL persist a per-project boolean setting `explore_mcp_enabled`, default `false`, exposed via `GET /api/projects/:projectId/explore-mcp-enabled` and `PATCH /api/projects/:projectId/explore-mcp-enabled`. The PATCH endpoint MUST accept `{ enabled: boolean }` and reject other payloads with HTTP 400. The setting MUST be read fresh at every Explore turn so toggling takes effect on the next message without restarting any process. The client SHALL render the toggle in `SettingsPage` under an Explore section.

#### Scenario: Default value is false

- **WHEN** a fresh project is registered and `GET /api/projects/:id/explore-mcp-enabled` is called before any user interaction
- **THEN** the response is `{ enabled: false }`

#### Scenario: Toggle takes effect on next turn

- **GIVEN** an active Explore conversation that has streamed at least one turn with `enabled=false`
- **WHEN** the user PATCHes `enabled=true` and sends another message in the same conversation
- **THEN** the next spawn uses `<project.path>` as cwd
- **AND** no process restart is required for the change to apply

#### Scenario: Invalid payload rejected

- **WHEN** the client PATCHes `{ enabled: "yes" }` or any non-boolean
- **THEN** the server responds 400
- **AND** the stored value is unchanged

### Requirement: Explore turns kept warm via session resume

Each Explore turn after the first SHALL be respawned with `--resume <session_id>` where `<session_id>` is the value captured from the conversation's first `system` event. The hub does not maintain a persistent claude child process across turns; instead, deterministic system prompt (per the byte-stability requirement) plus consistent `cwd` per turn keep the Anthropic prompt cache warm.

#### Scenario: Second turn uses --resume

- **GIVEN** an Explore conversation whose first turn captured `session_id=S`
- **WHEN** the user sends a second message
- **THEN** the spawned `claude` argv includes `--resume S`

#### Scenario: Resume is preserved across minimize and restore

- **GIVEN** an Explore conversation with `session_id=S` that was minimized and later restored
- **WHEN** the user sends the next message after restore
- **THEN** the spawned `claude` argv includes `--resume S`
- **AND** the conversation row's `session_id` value is unchanged

### Requirement: Idle-kill on minimize after 2 minutes

When an Explore conversation is minimized to the global toast dock, the hub SHALL start a 2-minute idle timer. If the conversation is not unminimised and does not receive a new user message before the timer fires, any active or pending `claude` child process for that conversation MUST be terminated (SIGTERM, 1 second grace, then SIGKILL). The conversation row, its `session_id`, and its draft state MUST NOT be deleted by this idle-kill — the next sent message respawns with `--resume`. If a turn is currently streaming when minimize occurs, the timer MUST NOT start until that turn completes.

#### Scenario: Idle 2 minutes after minimize kills the spawn

- **GIVEN** an Explore conversation with no in-flight turn that the user has just minimized
- **WHEN** 2 minutes elapse without unminimise or a new message
- **THEN** any associated child process is terminated
- **AND** the conversation row's `session_id` is preserved

#### Scenario: Streaming defers the timer

- **GIVEN** an Explore conversation streaming a turn
- **WHEN** the user minimizes mid-stream
- **THEN** the idle timer does not start while streaming continues
- **AND** the timer starts only after the streaming turn completes

#### Scenario: Activity before timer fires cancels it

- **GIVEN** an idle-kill timer is running at 90 seconds
- **WHEN** the user unminimises or sends a new message
- **THEN** the timer is cancelled
- **AND** no SIGTERM is delivered

#### Scenario: Restore after idle-kill respawns with resume

- **GIVEN** an Explore conversation whose process was idle-killed
- **WHEN** the user restores the chip and sends a new message
- **THEN** a fresh `claude` is spawned with `--resume <session_id>`
- **AND** the conversation history shown to the user is unchanged

### Requirement: Crash recovery auto-respawns once

If a `claude` child process for an in-flight Explore turn exits before emitting a `result` event, the hub SHALL respawn the same turn exactly once with the same prompt and `--resume <session_id>`. If the second attempt also exits without a `result` event, the hub MUST emit a `chat_error` for that conversation with a recognisable `crashed` reason. A successful turn SHALL reset the per-conversation crash counter to zero. The auto-respawn MUST NOT fire if the user has explicitly interrupted the turn (Stop button) before the crash occurs.

#### Scenario: First crash transparently respawns

- **GIVEN** an Explore turn whose child process exits non-zero before `result`
- **WHEN** no user interrupt was issued
- **THEN** a second `claude` spawn is started for the same turn with `--resume`
- **AND** the user sees streaming continue without an error message

#### Scenario: Second crash surfaces an error

- **WHEN** the auto-respawned attempt also exits before `result`
- **THEN** a `chat_error` WS event is broadcast for the conversation with reason `crashed`
- **AND** no third spawn is attempted

#### Scenario: Successful turn resets the counter

- **GIVEN** a conversation whose crash counter is 1 from a previous transient crash
- **WHEN** the next turn completes successfully
- **THEN** the next-future crash will trigger a fresh single auto-respawn

#### Scenario: User interrupt skips auto-respawn

- **GIVEN** an in-flight turn that the user has cancelled via Stop
- **WHEN** the child process exits non-zero
- **THEN** no auto-respawn occurs
- **AND** no `chat_error crashed` event is emitted (the existing cancel pathway handles UX)

### Requirement: Concurrency cap of five Explore spawns per project

The hub SHALL maintain at most five concurrent Explore `claude` child processes per project. When a sixth would be created, the hub MUST first kill the oldest currently-idle (not actively streaming) Explore process for the project. If all five are streaming, the new turn MUST be queued; if the queued turn has waited more than 30 seconds, the hub MUST emit a `chat_error` with reason `busy` and drop the queued spawn.

#### Scenario: Sixth spawn evicts the oldest idle process

- **GIVEN** five active Explore processes for a project, four streaming and one idle
- **WHEN** a sixth Explore turn is sent
- **THEN** the idle process is killed
- **AND** the new turn proceeds without queueing

#### Scenario: All-streaming queue and timeout

- **GIVEN** five Explore processes all currently streaming
- **WHEN** a sixth Explore turn is sent
- **THEN** the new turn is queued
- **AND** if no slot opens within 30 seconds the conversation receives a `chat_error` with reason `busy`

#### Scenario: Slot opens within timeout

- **GIVEN** a queued sixth turn at t=10 seconds
- **WHEN** any of the five streaming turns completes at t=15 seconds
- **THEN** the queued turn is dispatched immediately
- **AND** no `chat_error busy` is emitted

### Requirement: Explore overlay shows status pills until first text delta

The Explore overlay SHALL render a status pill area immediately when the user submits a turn, displaying a sequence of states derived from streamed events. The pills MUST disappear as soon as the first `text` delta of the assistant turn is received. Each individual pill MUST be visible for at least 150 milliseconds before being replaced, to avoid flicker. A skeleton bubble MUST be visible from the moment the user submits the message, before any WebSocket round-trip.

#### Scenario: Pill stages map to events

- **WHEN** the user submits an Explore turn
- **THEN** a pill labelled `Conectando…` appears within 16 ms of submission
- **AND** when the conversation receives a `system` event the pill changes to `Pensando…`
- **AND** when any `tool_use` event arrives during the same turn the pill changes to `Consultando código…`
- **AND** the pill area disappears as soon as the first `text` delta of the turn arrives

#### Scenario: Minimum 150 ms per pill prevents flicker

- **GIVEN** a turn whose `system` and first `text` events arrive within 50 ms of each other
- **WHEN** the pill `Pensando…` would normally show
- **THEN** the pill remains visible for at least 150 ms before being replaced or removed

#### Scenario: Skeleton appears at T+0

- **WHEN** the user clicks Send on the Explore composer
- **THEN** a skeleton assistant bubble is rendered before any server response
- **AND** the skeleton remains until either the first `text` delta or a terminal `chat_error` for that turn

### Requirement: Streaming text renders char-by-char on a smooth tick

The Explore overlay SHALL animate streamed assistant text into the DOM in a smooth char-by-char fashion driven by `requestAnimationFrame` or an equivalent ~60 fps tick, decoupled from the raw WebSocket batch cadence. Buffered characters MUST never be dropped: every character received in `chat_stream` deltas eventually appears in the rendered bubble. If the buffer grows beyond a configurable safety threshold (e.g. 4 KB), the renderer MAY flush the remaining buffer instantly to avoid falling far behind.

#### Scenario: Bursty deltas render smoothly

- **WHEN** the server emits a 500-character delta in a single `chat_stream` event
- **THEN** the rendered bubble grows character-by-character at a perceptible smooth rate
- **AND** every character of the delta eventually appears in the bubble

#### Scenario: Slow trickle still smooth

- **WHEN** the server emits ten single-character deltas spaced 30 ms apart
- **THEN** the rendered bubble shows characters appearing at the cadence the model produced them, without frame drops

#### Scenario: Safety flush on extreme backlog

- **GIVEN** a 100 KB delta arriving in a single event
- **WHEN** the buffer exceeds the safety threshold
- **THEN** the renderer flushes the remaining buffer to the DOM in one go
- **AND** no characters are lost

### Requirement: Rollback escape hatches preserve correctness

The change SHALL provide two independently-toggleable escape hatches:

1. An environment variable `SPECRAILS_EXPLORE_LEGACY_CWD=1` MUST cause every Explore spawn to use `<project.path>` as `cwd`, regardless of the per-project toggle, and MUST cause `ExploreCwdManager` to skip materialising the explore-cwd directory entirely.
2. A client-side build-time flag `VITE_FEATURE_EXPLORE_PREMIUM_UX=false` MUST disable the status pills, the skeleton, and the char-by-char renderer, falling back to the pre-change rendering of `chat_stream` deltas.

Both escape hatches MUST keep the Explore feature functionally usable and MUST NOT cause any data loss in conversations or drafts.

#### Scenario: Server escape hatch forces legacy cwd

- **GIVEN** the server is started with `SPECRAILS_EXPLORE_LEGACY_CWD=1`
- **WHEN** any Explore turn is sent
- **THEN** the spawn `cwd` is `<project.path>`
- **AND** `~/.specrails/projects/<slug>/explore-cwd/` is not created or modified

#### Scenario: Client escape hatch disables premium UX

- **GIVEN** the client is built with `VITE_FEATURE_EXPLORE_PREMIUM_UX=false`
- **WHEN** the user submits an Explore turn
- **THEN** no status pills are rendered
- **AND** no skeleton bubble is rendered
- **AND** streamed deltas render directly without char-by-char animation
- **AND** the conversation history and draft state are unaffected

### Requirement: Explore composer footer exposes a Review action

The Explore composer footer SHALL render a `Review →` action positioned between the `Send` button and the `Create Spec` button. The action MUST be visible only when the draft has a non-empty `title` (matching the existing enable-condition of `Create Spec`). Activating the action SHALL open the Review Changes overlay over the shell without unmounting the shell.

#### Scenario: Review button appears when title is non-empty

- **WHEN** the draft has a non-empty title
- **THEN** a `Review →` action is rendered in the composer footer
- **AND** clicking it opens the Review Changes overlay

#### Scenario: Review button is hidden when title is empty

- **WHEN** the draft has no title (or whitespace-only)
- **THEN** the `Review →` action is not rendered

#### Scenario: Shell stays mounted while Review is open

- **WHEN** the Review overlay is open
- **THEN** the underlying Explore shell remains mounted in the DOM
- **AND** closing the overlay returns the user to the exact conversation and draft state they had before opening it

### Requirement: Review Changes overlay renders the full draft against a baseline

The Review Changes overlay SHALL accept a `baseline` describing the prior state of the spec (default empty) and render each draft field with diff highlights against the baseline. The overlay MUST cover `title`, `description`, `labels`, `priority`, and `acceptanceCriteria`. The overlay MUST NOT mutate the underlying draft state.

#### Scenario: Empty baseline renders all fields as additions

- **WHEN** the overlay is opened on a new spec with no prior baseline
- **THEN** all proposed values for `title`, `description`, `labels`, and `acceptanceCriteria` are rendered as added content
- **AND** the `priority` is rendered as a single pill (no before/after arrow)

#### Scenario: Non-empty baseline renders mixed diffs

- **WHEN** the overlay is opened with a baseline that differs from the proposed draft
- **THEN** unchanged text segments are rendered with default styling
- **AND** added segments are visually highlighted (e.g., success-coloured background)
- **AND** removed segments are visually struck through (e.g., warning-coloured strikethrough)

#### Scenario: Overlay does not mutate the draft

- **WHEN** the overlay is open
- **THEN** closing it via `Back to edit` returns the draft to the same in-memory state it had before the overlay opened
- **AND** no `spec_draft.update` WS event is emitted by opening or closing the overlay

### Requirement: Text fields use word-level diff; arrays use set diff; priority uses before/after

`title` and `description` SHALL be diffed at the word level using the existing `diff` package (`diffWords`). `labels` and `acceptanceCriteria` SHALL use a set-based diff that classifies each item as `added`, `removed`, or `unchanged` and renders order-preserved `unchanged + added` followed by `removed` items. `priority` SHALL render a single pill when unchanged or only one side has a value, and a `from → to` pill pair when changed.

#### Scenario: Word-level diff on description

- **WHEN** the baseline description is `Users cannot change the OS theme.` and the proposed description is `Users cannot override the OS theme.`
- **THEN** the rendered description shows the unchanged words intact, `change` struck through, and `override` highlighted as added

#### Scenario: Set diff on labels

- **WHEN** the baseline labels are `["ui", "misc"]` and the proposed labels are `["ui", "theme", "settings"]`
- **THEN** `ui` is rendered as unchanged
- **AND** `theme` and `settings` are rendered as added
- **AND** `misc` is rendered as removed

#### Scenario: Set diff on acceptance criteria preserves proposed order

- **WHEN** the baseline criteria are `["A", "B"]` and the proposed criteria are `["B", "C", "A"]`
- **THEN** the rendered list shows `B`, `C`, `A` in that order as unchanged/added/unchanged
- **AND** no removed entries are rendered

#### Scenario: Priority renders before-and-after when changed

- **WHEN** the baseline priority is `medium` and the proposed priority is `high`
- **THEN** the priority is rendered as a `medium → high` pill pair

#### Scenario: Priority renders single pill when unchanged

- **WHEN** the baseline and proposed priorities are both `medium`
- **THEN** the priority is rendered as a single `medium` pill

### Requirement: Review overlay supports Back-to-edit and Create-Spec actions

The overlay SHALL render two footer actions: `[← Back to edit]` and `[Create Spec]`. `Back to edit` MUST close the overlay without committing. `Create Spec` MUST invoke the same commit handler used by the footer-level `Create Spec` button on the underlying shell; both entry points MUST produce identical results. The `Esc` key MUST be equivalent to `Back to edit`.

#### Scenario: Back to edit closes the overlay

- **WHEN** the user clicks `Back to edit`
- **THEN** the overlay closes
- **AND** the underlying Explore shell becomes interactive again with unchanged draft state
- **AND** no ticket is committed

#### Scenario: Create Spec from the overlay commits the draft

- **WHEN** the user clicks `Create Spec` from inside the overlay
- **THEN** the same commit path used by the footer `Create Spec` button is invoked
- **AND** the overlay closes on success

#### Scenario: Esc closes the overlay equivalent to Back to edit

- **WHEN** the user presses `Esc` while the overlay is open
- **THEN** the overlay closes without committing
- **AND** the draft state is preserved

### Requirement: Review overlay is gated by a build-time escape hatch

The Review-Changes feature SHALL be gated by a client build-time flag `VITE_FEATURE_EXPLORE_REVIEW`. The default value MUST be enabled. Setting `VITE_FEATURE_EXPLORE_REVIEW=false` MUST cause the `Review →` action to not render and MUST keep the rest of the Explore shell functional, including the unchanged `Create Spec` footer action.

#### Scenario: Default build enables Review

- **WHEN** the client is built without setting the flag
- **THEN** the `Review →` action is rendered when the draft has a title
- **AND** clicking it opens the overlay

#### Scenario: Flag set to false hides Review

- **WHEN** the client is built with `VITE_FEATURE_EXPLORE_REVIEW=false`
- **THEN** the `Review →` action is not rendered regardless of draft state
- **AND** the existing `Create Spec` footer action is unaffected and continues to commit when clicked

### Requirement: TicketDetailModal exposes a Continue Editing action

The `TicketDetailModal` SHALL render a `Continue Editing` action ONLY when the ticket's status is `draft`, `todo`, or `backlog`. The action MUST NOT render for tickets in `in_progress`, `done`, or `cancelled` status. Activating the action SHALL open the Explore Spec shell seeded with the ticket as the current draft and as the Review baseline.

#### Scenario: Continue Editing renders for editable statuses

- **WHEN** the modal is open for a ticket whose status is `todo`, `backlog`, or `draft`
- **THEN** a `Continue Editing` action is rendered

#### Scenario: Continue Editing is hidden for non-editable statuses

- **WHEN** the modal is open for a ticket whose status is `in_progress`, `done`, or `cancelled`
- **THEN** no `Continue Editing` action is rendered

#### Scenario: Continue Editing opens the seeded shell

- **WHEN** the user clicks `Continue Editing`
- **THEN** the Explore Spec shell mounts
- **AND** the shell's draft pane is pre-populated with the ticket's title, description, labels, priority, and any acceptance criteria parsed from the description body
- **AND** the Review overlay (when opened) uses the original ticket values as its baseline rather than an empty baseline

### Requirement: Explore Spec shell supports an edit-existing-ticket mode

The Explore Spec shell SHALL accept an `editTicket` payload describing an existing ticket. When the payload is present, the shell MUST start a fresh conversation (no resume), seed its draft from the payload, expose the ticket id and identifying chrome (e.g., header eyebrow `EDITING SPEC · {id}`), and commit via update-in-place rather than create.

#### Scenario: Fresh conversation on edit-mode mount

- **WHEN** the shell mounts with an `editTicket` payload
- **THEN** no `resumeConversationId` is used
- **AND** the user lands in an empty conversation pane ready for the first message

#### Scenario: Header reflects edit mode

- **WHEN** the shell mounts with an `editTicket` payload
- **THEN** the header eyebrow identifies the ticket being edited

#### Scenario: Draft pane reflects the seeded ticket

- **WHEN** the shell mounts with an `editTicket` payload
- **THEN** the draft pane shows the ticket's title, description, labels, priority, and parsed acceptance criteria
- **AND** the user can edit any field manually before sending the first message

### Requirement: Update-in-place commit path for edit mode

When the shell is in edit mode (`editTicket` set), activating `Create Spec` / `Update Spec` (from either the composer footer or the Review overlay) SHALL commit via `PATCH /api/projects/:projectId/tickets/:id` with the current draft fields. The PATCH request body MUST include `title`, `description`, `labels`, `priority`, and `acceptanceCriteria` when those fields exist on the draft. The request MUST NOT include a `status` field (status changes are not allowed via this path). The server response MUST return the updated ticket, which the shell uses to dispatch the same `onTicketCreated`/`ticket_updated` flow callers already rely on.

#### Scenario: Commit dispatches PATCH for edit mode

- **WHEN** the user activates the commit action while `editTicket` is set
- **THEN** the shell sends `PATCH /api/projects/:projectId/tickets/:id` with the current draft fields
- **AND** the request body includes `acceptanceCriteria` if the draft has any
- **AND** the request body omits `status`

#### Scenario: Commit dispatches POST /tickets/from-draft for new-spec mode

- **WHEN** the user activates the commit action while `editTicket` is unset
- **THEN** the shell sends `POST /api/projects/:projectId/tickets/from-draft` (the existing create path)

### Requirement: Review overlay receives the ticket as baseline in edit mode

When the Explore Spec shell is in edit mode, opening the Review overlay SHALL pass the original ticket values as the `baseline` prop and the current draft as the `proposed` prop. The Review overlay MUST therefore render real diffs (added/removed segments) rather than the empty-baseline preview.

#### Scenario: Word-level diff appears against the original ticket text

- **WHEN** the user has edited the description from `Users cannot change the OS theme.` to `Users cannot override the OS theme.` and opens Review
- **THEN** the overlay's description field shows `change` struck through and `override` highlighted as added
- **AND** unchanged words appear with default styling

#### Scenario: Set diff appears on labels and criteria

- **WHEN** the user has changed labels from `["ui", "misc"]` to `["ui", "theme"]` and opens Review
- **THEN** `ui` renders unchanged, `theme` renders added, `misc` renders removed in the overlay

### Requirement: Review overlay commit button label reflects mode

The Review overlay's commit button SHALL display `Update Spec` when the shell is in edit mode (`editTicket` set) and `Create Spec` otherwise. The button's `data-testid` MUST remain stable (`review-commit`) regardless of mode so tests and the underlying handler are unaffected.

#### Scenario: Edit mode shows Update Spec

- **WHEN** the Review overlay opens with an `editTicket` baseline
- **THEN** the commit button displays the label `Update Spec`

#### Scenario: Create mode shows Create Spec

- **WHEN** the Review overlay opens with no `editTicket`
- **THEN** the commit button displays the label `Create Spec`

### Requirement: PATCH /tickets/:id accepts acceptanceCriteria

The hub SHALL extend `PATCH /api/projects/:projectId/tickets/:id` to accept an optional `acceptanceCriteria: string[]` field. When present, the server MUST fold the array into the ticket's description body under a `## Acceptance Criteria` heading, replacing any existing section with that exact heading. When the array is empty (`[]`), the server MUST remove any existing `## Acceptance Criteria` section. When the field is omitted, the description's acceptance criteria area MUST be left unchanged.

#### Scenario: Criteria array writes a new section

- **WHEN** a PATCH request includes `acceptanceCriteria: ["A", "B"]` and the existing description has no `## Acceptance Criteria` section
- **THEN** the persisted description ends with a `## Acceptance Criteria` section listing `- A` and `- B`

#### Scenario: Criteria array replaces an existing section

- **WHEN** a PATCH request includes `acceptanceCriteria: ["C"]` and the existing description has a `## Acceptance Criteria` section with `- A`
- **THEN** the persisted description's `## Acceptance Criteria` section lists `- C` only

#### Scenario: Empty array removes the section

- **WHEN** a PATCH request includes `acceptanceCriteria: []` and the existing description has a `## Acceptance Criteria` section
- **THEN** the persisted description no longer contains a `## Acceptance Criteria` heading

#### Scenario: Omitted field preserves the section

- **WHEN** a PATCH request omits `acceptanceCriteria` entirely
- **THEN** the persisted description retains any pre-existing `## Acceptance Criteria` section unchanged
