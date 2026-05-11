## REMOVED Requirements

### Requirement: AI Edit has three UI states driven by session data

**Reason**: The ticket-scoped AI Edit surface (`TicketAiEditOverlay` in `TicketDetailModal`) is retired in favour of `Continue Editing` which opens `ExploreSpecShell` seeded with the ticket. The 3-state UI was tied to AI-Edit's own shell and no longer applies — Explore's shell + Review overlay covers the same affordances.

**Migration**: Users land on the new `Continue Editing` action in `TicketDetailModal`. The shell uses its existing streaming UX (status pills, char-by-char rendering) instead of the prior Composing/Reviewing toggle.

### Requirement: Word-level diff view

**Reason**: The ticket-scoped word-level diff is now provided by `ExploreReviewOverlay` (added in `power-up-explore-review-diff`) which renders word-level diffs for the title and description against the original ticket. The agent-refine surface continues to use the legacy `AiEditDiffView` component; that capability is owned by `ai-refine-custom-agents`.

**Migration**: When a user clicks `Continue Editing` on a ticket and then `Review →` inside Explore, the resulting overlay shows the same word-level diff against the original ticket text.

### Requirement: Refinement loop preserves iteration context

**Reason**: The dedicated AI Edit refinement loop (instruction → diff → refine → apply) is retired with the ticket surface. The Explore conversation provides multi-turn refinement context naturally — each turn refines the draft and the user can audit the cumulative result via Review at any time.

**Migration**: Multi-turn editing is identical to the existing Explore conversation flow used for new specs.

### Requirement: Session-scoped attachment pinning

**Reason**: AI-Edit-on-tickets used a separate session-scoped attachment pinning model. Tickets edited via Explore use the ticket's own attachments (already accessible from the modal) and the existing Explore `pendingSpecId`-style attachment plumbing.

**Migration**: Attachments pinned via the prior AI-Edit session are not migrated. The ticket's persisted attachments remain on the ticket and are visible/editable through the modal as before.

### Requirement: Apply remains reversible via snapshot

**Reason**: The `descriptionSnapshot` / `titleSnapshot` revert affordance was tightly coupled to the single-shot AI Edit apply. In the new flow, edits are conversational and audited via Review before commit; an undo is one more refinement turn away. We accept the trade-off and surface a "revert to last save" affordance only if users ask.

**Migration**: Users who relied on snapshot revert use the conversation to ask Claude to roll back to a prior wording, or save-as-draft before risky edits.
