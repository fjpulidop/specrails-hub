## 1. Dependencies

- [x] 1.1 Add `diff` and `@types/diff` to root `package.json`
- [x] 1.2 `npm install`

## 2. Server — refinement support

- [x] 2.1 Extend `POST /tickets/:id/ai-edit` body parsing in `server/project-router.ts` to accept `priorInstructions?: string[]` and `priorProposal?: string` (validate types, default to undefined)
- [x] 2.2 Introduce a `isRefinement` flag (`typeof priorProposal === 'string' && priorProposal.length > 0`)
- [x] 2.3 When `isRefinement`, append a refinement rule to the system prompt: "You are editing an in-progress draft, not the saved description. Apply the new refinement to the draft."
- [x] 2.4 When `isRefinement`, build the user prompt as: `## Current Description\n\n<desc>\n\n## Prior Refinement Turns\n\n<numbered list>\n\n## Latest Draft\n\n<priorProposal>\n\n## New Refinement\n\n<instructions>\n\nOutput the updated description now.`
- [x] 2.5 When NOT `isRefinement`, keep the existing prompt shape unchanged (backwards compat)
- [x] 2.6 Confirm `attachmentManager.getClaudeArgs(...)` is called the same way in both branches

## 3. Client — AiEditDiffView component

- [x] 3.1 Create `client/src/components/AiEditDiffView.tsx` — props: `{ original: string, proposed: string, className?: string }`
- [x] 3.2 Import `diffWords` from `diff`; render tokens with inline insert/delete spans
- [x] 3.3 Style: insertions `bg-green-500/20 text-green-200`, deletions `bg-red-500/20 text-red-300 line-through opacity-70`, unchanged plain
- [x] 3.4 Wrap output in `prose prose-invert prose-xs` so markdown spacing matches the modal's description view
- [x] 3.5 Handle whitespace-only diffs gracefully (don't render a noisy highlight for trailing newlines)

## 4. Client — SessionAttachmentBar component

- [x] 4.1 Create `client/src/components/SessionAttachmentBar.tsx` — props: `{ ticketKey, sessionIds: string[], ticketAttachments: Attachment[], onRemoveFromSession(id), onAddAttachment(attachment), disabled? }`
- [x] 4.2 Render a chip row using `AttachmentChip` for each session id resolved against `ticketAttachments`
- [x] 4.3 Chip `×` fires `onRemoveFromSession(id)` (does NOT call the server DELETE)
- [x] 4.4 Include a compact "+ Add" button that triggers the existing file input flow; uploaded attachments call `onAddAttachment(a)` and are added to both session + ticket
- [x] 4.5 Show an empty-state pill ("No pinned resources — drop files to add") when the session list is empty

## 5. Client — AiEditComposer component

- [x] 5.1 Extract the Composing-state UI from `TicketDetailModal.tsx` into `client/src/components/AiEditComposer.tsx` — props: `{ ticketKey, onSubmit(instructions, attachmentIds), onCancel, attachments: Attachment[], sessionIds: string[], onSessionIdsChange, disabled? }`
- [x] 5.2 Reuse `RichAttachmentEditor` internally; mirror its `attached` state into `sessionIds`
- [x] 5.3 Drop/paste/browse of new files → upload → append to `sessionIds` via `onSessionIdsChange`
- [x] 5.4 Submit handler gathers editor plain text + current `sessionIds` and calls `onSubmit(text, sessionIds)`

## 6. Client — TicketDetailModal integration

- [x] 6.1 Remove the sidebar AI Edit block (the compact textarea + Apply/Cancel buttons in the right rail)
- [x] 6.2 Add three new state slots: `proposedDraft: string | null`, `priorInstructions: string[]`, `sessionAttachmentIds: string[]`
- [x] 6.3 Render main-content area with a tri-state switch: Idle → description view + CTA; Composing → `AiEditComposer`; Reviewing → `AiEditDiffView` + `SessionAttachmentBar` (read-only pins) + inline refine input + [Discard] [Apply]
- [x] 6.4 First submit (Idle → Composing): call `ai-edit` with `{ instructions, description, attachmentIds: sessionAttachmentIds }`, set `aiEditing=true`; stream handler sets `proposedDraft` on `ticket_ai_edit_done`
- [x] 6.5 Refine submit (Reviewing): call `ai-edit` with `{ instructions, description, attachmentIds: sessionAttachmentIds, priorInstructions, priorProposal: proposedDraft }`; on done, replace `proposedDraft` and push prior instruction
- [x] 6.6 Apply: set description via `onSave`, capture `descriptionSnapshot` if not already set, clear session state, show Revert button
- [x] 6.7 Discard: clear session state without saving, return to Idle
- [x] 6.8 On modal close: clear session state (including snapshot if it points to currently-saved value) and reset
- [x] 6.9 Sync `sessionAttachmentIds` against `ticket.attachments` — when AttachmentsSection removes an id, filter it from the session list

## 7. UX polish

- [x] 7.1 Show a dim "Turn N" badge next to the AI Edit header in Reviewing mode
- [x] 7.2 Auto-focus the refine input on entering Reviewing mode (defer with `setTimeout` so transition completes first)
- [x] 7.3 Collapse `priorInstructions` older than the 5 most recent into a "N earlier turns" summary line (clickable to expand)
- [x] 7.4 Disable Apply button while a stream is in flight; show spinner inline

## 8. Regression safety

- [x] 8.1 Verify first-turn ai-edit still works when client sends only `{ instructions, description, attachmentIds? }` (no prior fields) — existing callers continue to work
- [x] 8.2 Verify Revert-to-original behavior unchanged for single-Apply case
- [x] 8.3 Verify attachment upload + deletion flows (from this change) still synchronize with `ticket.attachments`
- [x] 8.4 Run `npm run typecheck` (server + client) — clean
- [x] 8.5 Run `openspec validate ai-edit-diff-review --strict` — valid
