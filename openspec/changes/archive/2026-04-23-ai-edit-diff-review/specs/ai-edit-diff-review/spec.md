## ADDED Requirements

### Requirement: AI Edit has three UI states driven by session data
TicketDetailModal SHALL render the AI Edit surface in one of three states: **Idle** (CTA button only), **Composing** (instruction input + attachment chip bar + submit), or **Reviewing** (diff view + chip bar + refine input + Apply/Discard). The state SHALL be derived from the client-side values `aiEditOpen`, `proposedDraft`, and `aiEditing` — no additional server calls are required to transition.

#### Scenario: Idle to Composing
- **WHEN** the user clicks the "AI Edit" CTA on an idle ticket
- **THEN** the description render is replaced by the Composing UI in the main content column
- **AND** the right sidebar (priority, labels, prerequisites, AttachmentsSection) remains visible

#### Scenario: Composing to Reviewing
- **WHEN** the AI Edit stream finishes (`ticket_ai_edit_done` WS message) with non-empty output
- **THEN** `proposedDraft` is set to the full streamed text
- **AND** the UI renders the word-level diff of `currentDescription` vs. `proposedDraft`
- **AND** the input field clears and refocuses for the next refinement turn

#### Scenario: Reviewing to Idle via Apply
- **WHEN** the user clicks "Apply" in Reviewing mode
- **THEN** the ticket description is saved to `proposedDraft`
- **AND** `proposedDraft`, `priorInstructions[]`, and `sessionAttachmentIds[]` are cleared
- **AND** a "Revert to original" button remains available using `descriptionSnapshot`

#### Scenario: Reviewing to Idle via Discard
- **WHEN** the user clicks "Discard" in Reviewing mode
- **THEN** `proposedDraft`, `priorInstructions[]`, and `sessionAttachmentIds[]` are cleared
- **AND** the ticket description remains at its saved value
- **AND** no server call is made

### Requirement: Word-level diff view
The system SHALL render the diff between `currentDescription` and `proposedDraft` at word granularity using the `diff` npm package's `diffWords` function. Unchanged tokens render as plain text; inserted tokens render with a green background highlight; deleted tokens render with a red background highlight and strikethrough.

#### Scenario: Single-word change
- **WHEN** one word differs between original and proposed
- **THEN** only that word renders with diff styling; surrounding prose is unchanged

#### Scenario: Paragraph rewrite
- **WHEN** a whole paragraph is rewritten
- **THEN** the diff view shows the original tokens struck through followed by the new tokens highlighted
- **AND** the markdown structure (headings, lists) around the change is preserved

#### Scenario: Pure addition
- **WHEN** the proposed draft adds new content without removing anything
- **THEN** only insertion highlights are rendered; no strikethrough tokens appear

### Requirement: Refinement loop preserves iteration context
The system SHALL support iterative refinement within an AI Edit session. Each refinement turn SHALL send the prior proposal and the accumulated instruction history to the server alongside the new instruction.

#### Scenario: Second turn uses prior proposal as base
- **WHEN** the user is in Reviewing mode and submits a new refinement ("make it shorter")
- **THEN** the request body includes `priorInstructions: [firstInstruction]` and `priorProposal: firstDraft`
- **AND** the response replaces `proposedDraft` with the new output (not appending, not stacking diffs)

#### Scenario: Nth turn accumulates all prior instructions
- **WHEN** the user is on their 4th refinement turn in the same session
- **THEN** `priorInstructions` contains exactly 3 entries in submission order
- **AND** `priorProposal` is the draft from turn 3

#### Scenario: Apply starts fresh next time
- **WHEN** the user Applies a draft and re-opens AI Edit on the same ticket
- **THEN** `priorInstructions` is empty and `priorProposal` is null (fresh session)
- **AND** the new baseline `currentDescription` equals the just-applied draft

### Requirement: Session-scoped attachment pinning
The system SHALL maintain a client-side `sessionAttachmentIds: string[]` representing attachments actively pinned to the current AI Edit session. This list SHALL be a subset of `ticket.attachments.map(a => a.id)` and SHALL be sent as `attachmentIds` on every ai-edit request in the session.

#### Scenario: Chip remove during iteration
- **WHEN** the user clicks `×` on a session chip during Reviewing mode
- **THEN** that attachment id is removed from `sessionAttachmentIds` only
- **AND** the attachment is NOT deleted from the ticket (still visible in `AttachmentsSection`)
- **AND** the next refine turn's request omits that id from `attachmentIds`

#### Scenario: Attachment added mid-session
- **WHEN** the user drops/pastes/browses a new file while in Composing or Reviewing mode
- **THEN** the file is uploaded and appended to BOTH `ticket.attachments` AND `sessionAttachmentIds`
- **AND** it appears in the session chip bar immediately

#### Scenario: Attachment deleted from AttachmentsSection mid-session
- **WHEN** the user removes an attachment via `AttachmentsSection` while an AI Edit session is active
- **THEN** that attachment id is also removed from `sessionAttachmentIds`
- **AND** subsequent refine turns do not send the stale id

### Requirement: Apply remains reversible via snapshot
The system SHALL capture `descriptionSnapshot` at the moment of the first successful Apply in a given modal-open cycle. A "Revert to original" control SHALL remain visible after Apply, reverting the description to that snapshot when clicked.

#### Scenario: Revert after single Apply
- **WHEN** the user Applies a draft and then clicks "Revert to original"
- **THEN** the description is set back to the pre-Apply value
- **AND** the Revert button disappears

#### Scenario: Revert baseline after multiple Applies in same modal session
- **WHEN** the user Applies, iterates again, and Applies a second time
- **THEN** "Revert to original" still reverts to the description that existed BEFORE the first Apply of the current modal-open cycle
- **AND** closing and reopening the modal resets the snapshot to the saved description
