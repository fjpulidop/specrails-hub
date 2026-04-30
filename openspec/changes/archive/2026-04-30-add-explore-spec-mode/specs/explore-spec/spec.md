## ADDED Requirements

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
The `Quick` mode SHALL behave identically to the current default `Generate Spec` flow: the user's idea and any attachments are sent to `POST /api/projects/:projectId/tickets/generate-spec`, the modal closes, and a toast tracks generation progress until the new ticket appears.

#### Scenario: Quick submits to generate-spec
- **WHEN** the user types an idea in Quick mode and clicks `Generate Spec`
- **THEN** the modal closes
- **AND** a `POST /api/projects/<id>/tickets/generate-spec` is sent with `{ idea, attachmentIds, pendingSpecId }`
- **AND** a loading toast is shown until the ticket is generated

#### Scenario: Quick supports attachments
- **WHEN** the user attaches a file in Quick mode and submits
- **THEN** the attachment ids are included in the request payload
- **AND** the attachments are bound to the new ticket on success

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
