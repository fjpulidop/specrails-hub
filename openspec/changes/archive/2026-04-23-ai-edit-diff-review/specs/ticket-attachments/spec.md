## MODIFIED Requirements

### Requirement: Attachments injected into ai-edit Claude spawn
The system SHALL accept an optional `attachmentIds: string[]` field in the `POST /tickets/:id/ai-edit` request body and inject files into the Claude CLI spawn using the same mechanism as generate-spec. The route SHALL also accept optional `priorInstructions?: string[]` and `priorProposal?: string` fields to support iterative refinement turns. When `priorProposal` is present, the system prompt SHALL instruct Claude to refine the prior draft rather than rewrite the saved description from scratch, and the user prompt SHALL thread the instruction history for context.

#### Scenario: AI edit with attachments
- **WHEN** ai-edit is called with `attachmentIds`
- **THEN** the Claude CLI process receives image flags and/or extracted text for each attachment

#### Scenario: First-turn edit (no prior proposal)
- **WHEN** ai-edit is called without `priorProposal`
- **THEN** Claude is prompted to rewrite the saved description according to the user's instructions
- **AND** the behavior matches the pre-change ai-edit flow exactly

#### Scenario: Refinement turn with prior proposal
- **WHEN** ai-edit is called with `priorProposal` populated and non-empty `priorInstructions`
- **THEN** the user prompt includes the current saved description (for reference), the accumulated `priorInstructions` in order, the `priorProposal` as the "latest draft", and the new `instructions`
- **AND** Claude's output replaces the proposed draft rather than rewriting the saved description

#### Scenario: Refinement turn reuses attachment resolution
- **WHEN** ai-edit is called with both `priorProposal` and `attachmentIds`
- **THEN** `attachmentManager.getClaudeArgs` runs exactly as in first-turn mode
- **AND** the resulting text blocks are wrapped in `<user-attachment>` delimiters identically
