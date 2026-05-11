## ADDED Requirements

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
