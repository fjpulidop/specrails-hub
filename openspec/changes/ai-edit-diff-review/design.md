## Context

`TicketDetailModal` currently renders AI Edit as an ~80px textarea inside the right sidebar. On submit, `POST /tickets/:id/ai-edit` spawns `claude` with `{ instructions, description, attachmentIds? }`, streams markdown over WS, and replaces the description in place. A single `descriptionSnapshot` lets the user "Revert to original". There is no diff, no iteration history, and no way to refine without rewriting the prompt from scratch.

This change keeps the streaming + WS infrastructure intact and layers three things on top: (1) a full-width Composing/Reviewing UI inside the modal's main content area, (2) a word-level diff view, (3) a refinement loop that reuses the previous proposal as the base for the next turn.

## Goals / Non-Goals

**Goals:**
- Full-width AI Edit surface inside TicketDetailModal (replaces description view while active).
- Word-level diff of `currentDescription` vs. `proposedDraft` with inline insert/delete spans.
- Refinement loop: the server accepts `priorInstructions[]` + `priorProposal` so iterations operate on the latest draft, not the original.
- Session-scoped attachment pinning: chip `×` removes from iteration context only; ticket-level attachment deletion stays in `AttachmentsSection`.
- Apply remains reversible via existing `descriptionSnapshot` → "Revert to original" button.

**Non-Goals:**
- Per-hunk accept/reject (global accept/discard only in v1).
- Persisting refinement history to disk (ephemeral, cleared on modal close).
- Slash-command shortcuts (`/shorter`, `/expand`).
- Side-panel composer pattern (this is a modal expansion, not a separate panel).
- Changing the ProposeSpecModal flow (stays one-shot).

## Decisions

### D1: Word-level diff via `diff` npm package
Use `diffWords(original, proposed)` from the `diff` library. Render the returned token array as two parallel views or a single unified view with inline `<span class="bg-green-500/20">` / `<span class="bg-red-500/20 line-through">` for inserted/deleted tokens. Unchanged tokens render as plain prose.

*Why*: `diff` is ~30 KB minified, zero deps, deterministic, and word-level reads naturally for markdown prose (line-level looks too coarse for paragraphs). Library is already in widespread use (Prettier, Jest, many diff viewers).

*Alternative considered*: implement a homemade LCS. Rejected — the edge cases (UTF-8, surrogate pairs, whitespace handling) aren't worth rebuilding.

### D2: Iteration state lives in client component only
TicketDetailModal gains three new state slots:
- `proposedDraft: string | null` — when non-null, the modal is in **Reviewing** mode
- `priorInstructions: string[]` — append-only in the session
- `sessionAttachmentIds: string[]` — subset of `ticket.attachments` currently "pinned" to this iteration

No server storage, no DB, no WS persistence. Modal close → state discarded.

*Why*: refinement history has no value beyond the single iteration session. Persisting it adds migration + UX surface (where to show history?) for little gain. Users who want to save a final wording just Apply.

### D3: Server contract — additive, backwards compatible
`POST /tickets/:id/ai-edit` body extended with two optional fields:
```ts
{
  instructions: string
  description: string              // current saved description
  attachmentIds?: string[]
  priorInstructions?: string[]     // NEW — refinement history
  priorProposal?: string           // NEW — previous AI draft
}
```

When `priorProposal` is absent → behaves exactly as today (first-turn edit).
When present → system prompt switches to "refine this draft" mode and user prompt includes the history + prior draft + new instruction.

*Why*: Clients that don't use the new fields keep working. Future surfaces (e.g. CLI, API consumers) can opt-in without breaking.

### D4: Refinement prompt construction
```
<system-prompt (unchanged rules) + USER_ATTACHMENT_SYSTEM_NOTE if attachments>

<user-prompt>
  ## Current Description
  {description}

  ## Prior Refinement Turns
  1. {priorInstructions[0]}
  2. {priorInstructions[1]}
  ...

  ## Latest Draft (from previous turn)
  {priorProposal}

  ## New Refinement
  {instructions}

  Output the updated description now.
</user-prompt>
```

The "Latest Draft" block is the one Claude should edit, not the saved `description`. The saved description is there for reference only — so Claude knows the original baseline.

### D5: Session attachments are a UI concept, not a server concept
The server doesn't care about "session vs ticket" attachments — it only sees `attachmentIds: string[]` per request. The UI maintains `sessionAttachmentIds` as a strict subset of `ticket.attachments.map(a => a.id)`. On each ai-edit turn, only `sessionAttachmentIds` are sent.

Chip `×` in the iteration bar = remove id from `sessionAttachmentIds`. Full delete in `AttachmentsSection` = DELETE server-side AND remove from `sessionAttachmentIds` if present.

New attachments dropped/pasted during a session are auto-uploaded (existing flow) AND auto-added to `sessionAttachmentIds`.

### D6: Modal layout — three states
```
Idle:
  [description render]      [CTA: ✨ AI Edit]

Composing:
  [AiEditComposer]
    ┌─────────────────────────────────┐
    │ ✨ AI Edit                       │
    │ [textbox with attachments pills]│
    │ [chip bar: attached.png]         │
    │ [× Cancel]      [Submit ⏎]       │
    └─────────────────────────────────┘

Reviewing:
  [AiEditDiffView]
    ┌─────────────────────────────────┐
    │ ✨ AI Edit · Turn 2              │
    │ [diff render — original ⇄ draft]│
    │ [chip bar: attached.png (pinned)]│
    │ [refine: "make it shorter"]      │
    │ [Discard]  [Apply ✓]             │
    └─────────────────────────────────┘
```

All three states replace the description view in the main content column while active. The right sidebar (priority, labels, prerequisites, AttachmentsSection) stays visible.

### D7: Diff rendering strategy
Given both `original` and `proposed` are markdown, applying `diffWords` to raw markdown will produce noise in heading/list markers (e.g. `##` vs `## `). We pre-tokenize at whitespace boundaries and treat markdown punctuation as plain tokens. Post-render we wrap the diff output in the same `prose prose-invert` markdown container used elsewhere so formatting survives.

Trade-off: a heading that changes from `## Foo` to `## Bar` shows `Foo` struck + `Bar` inserted, not a full heading rewrite. Acceptable for v1.

## Risks / Trade-offs

- **Diff noise on markdown** → tokens like `*`, `#`, backticks will appear in the diff if they change, which looks ugly. Mitigation: word-level + pre-tokenization treats them as discrete tokens so the surrounding text stays unchanged; we can iterate to line-level for specific blocks later if needed.
- **Long iteration chains inflate the prompt** → every refine carries the full `priorInstructions[]` and `priorProposal`. After 10 turns the prompt grows. Mitigation: UI soft-caps visible history at 5 turns (older are collapsed with "2 earlier turns"); server receives all, but `--max-turns 4` limits Claude's internal reasoning. If users hit limits we add a "Start fresh from current" button.
- **Session attachment list drift** → if the user deletes an attachment from `AttachmentsSection` mid-session, the `sessionAttachmentIds` must be scrubbed to avoid sending a stale id. Mitigation: `AttachmentsSection.onChange` already notifies TicketDetailModal; we filter `sessionAttachmentIds` against the new list on every update.
- **Apply then refine again** → after Apply, the new saved description becomes the baseline. If the user hits AI Edit again, they start a fresh session (empty history, empty `sessionAttachmentIds`). This is intentional — each Apply commits a checkpoint.
- **Revert-to-original still works after multiple Applies** → `descriptionSnapshot` captures the description from BEFORE the current session's first Apply. Multi-session Apply → Apply chains do NOT stack reverts (only single-level undo). Acceptable for v1 — matches current behavior.

## Migration Plan

- `diff` package: `npm install --save diff @types/diff` in the root `package.json` (client imports from root deps).
- No server migration. No data migration. No config changes.
- Existing API clients using the original `{ instructions, description, attachmentIds? }` shape keep working unchanged.

## Open Questions

- Should the refine input auto-focus when Review mode is entered? → Yes, default to focused — users typically iterate immediately. Can be tweaked via user feedback.
- Should we show a small "Turn N" badge in the UI? → Yes, helpful signal; implement as a dim counter next to the AI Edit header.
- Should Apply require confirmation if the diff has >N lines changed? → No in v1; Apply is reversible via "Revert to original". Revisit if users report accidental applies.
