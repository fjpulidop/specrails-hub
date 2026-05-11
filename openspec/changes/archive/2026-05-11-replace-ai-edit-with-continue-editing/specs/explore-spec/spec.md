## ADDED Requirements

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
