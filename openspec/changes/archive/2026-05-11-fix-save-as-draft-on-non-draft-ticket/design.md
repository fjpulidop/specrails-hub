## Context

`POST /:projectId/tickets/save-as-draft` was originally written for the **fresh Explore session** flow: the user opens Explore from scratch, types a few turns, hits **Save as Draft**, and a brand-new draft ticket is inserted. The endpoint's idempotency key is `(origin_conversation_id, status='draft')` — sending the same `conversationId` twice updates the existing draft instead of duplicating it.

The **Continue Editing** flow (`replace-ai-edit-with-continue-editing`) introduced a second entry point into `ExploreSpecShell`: the user opens an editable ticket (any of `draft | todo | backlog`) from `TicketDetailModal`, the shell mounts in **edit mode** with that ticket's title/description/labels seeded into the draft pane, and a fresh Explore conversation is created. When the user clicks **Save as Draft** in this mode and the original ticket is **not already a draft**, the endpoint sees no matching `(conversationId, status='draft')` row and falls through to its insert path. Result: the original ticket stays in `todo`/`backlog`, and a new orphan draft (with a different id and no relation to the source ticket) appears in the Backlog column.

The fix is small in scope: teach the endpoint to demote an existing ticket in place when the client identifies it, and teach the client to identify it.

## Goals / Non-Goals

**Goals:**
- A user who clicks **Save as Draft** while editing a non-draft ticket sees that ticket transition to `status='draft'` in place — same `id`, same position in the SpecsBoard, no duplicate.
- The flow is idempotent: clicking **Save as Draft** twice in the same session produces one ticket in `draft`, never two.
- The original Save-as-Draft path (no `editTicketId` in the request) is byte-compatible with the previous behaviour.
- WebSocket consumers receive a `ticket_updated` event for in-place demotions (not `ticket_created`), so the SpecsBoard re-renders the existing card rather than spawning a new one.

**Non-Goals:**
- Restoring `priority` if the user later commits the draft back to a non-draft status. Demotion sets `priority = null`; a subsequent commit must supply a new priority via the existing commit path. (Captured as Open Question Q1.)
- Surfacing "this draft was demoted from #N" anywhere in the UI. The `id` is preserved, so the user is not confused about which ticket they edited.
- Changing the Continue-Editing-on-`draft` flow. Demoting an already-draft ticket is a no-op flip and must continue to work.

## Decisions

### D1. Client sends `editTicketId`, server flips in place

The client adds `editTicketId: editTicket.id` to the `POST /tickets/save-as-draft` body whenever `ExploreSpecShell` is in edit mode. The server, when `editTicketId` is present and resolves to a real ticket, **skips** the `(origin_conversation_id, status='draft')` lookup entirely and updates that ticket directly:

- `status` → `'draft'`
- `priority` → `null`
- `origin_conversation_id` → request's `conversationId`
- `title` / `description` / `labels` → as supplied (same merge rules as today)
- `updated_at` → now
- All other fields preserved (`assignee`, `prerequisites`, `metadata`, `comments`, `created_at`, `created_by`, `source`)

**Alternative considered:** server-side detection — look up "any ticket whose `origin_conversation_id === conversationId`, regardless of status". Rejected: a fresh Explore session has no link to the source ticket, so the server would still need the client to identify it. Adding `editTicketId` to the body is the smallest, most explicit contract.

### D2. `editTicketId` is optional and additive

Existing callers (the no-edit-mode flow) keep working unchanged. The endpoint:

- If `editTicketId` is present and the ticket exists → flip-in-place path (D1).
- If `editTicketId` is present but no ticket exists → 404 (`ticket not found`).
- If `editTicketId` is present but is not a number → 400 (`editTicketId must be a number`).
- If `editTicketId` is absent → existing path (lookup by `conversationId`, insert if no match) unchanged.

**Alternative considered:** treat `editTicketId` as required when the conversation has no matching draft, rather than falling through to insert. Rejected: that would break the Save-as-Draft from a fresh session, which is the bulk of the existing usage.

### D3. Idempotency: two saves on the same `editTicketId` are a no-op flip

When the endpoint receives a second `Save as Draft` for the same `(editTicketId, conversationId)` and the ticket is **already** `status='draft'` with the same `origin_conversation_id`, it MUST still return 200 with the updated `title`/`description`/`labels` and broadcast `ticket_updated`, but MUST NOT insert anything and MUST NOT change `priority` again (it is already `null`).

This handles two real scenarios:
- The user edits, clicks Save as Draft, edits some more, clicks Save as Draft again.
- The user clicks Save as Draft from Continue Editing on a ticket that was *already* a draft (same ticket, same conversation).

### D4. Broadcast event reflects what actually happened

The current endpoint chooses between `ticket_created` and `ticket_updated` by comparing `created_at === updated_at`. This breaks for the flip-in-place path because `created_at` is preserved from the original ticket but `updated_at` is bumped — so the heuristic still picks `ticket_updated`, which happens to be correct, but only by accident. We make the choice explicit: the flip-in-place path **always** emits `ticket_updated`. The fresh-insert path keeps the existing `created_at === updated_at` heuristic for backward compatibility.

### D5. Permission check: ticket must belong to this project

`editTicketId` is resolved inside the project's own ticket store (the request is already scoped to `:projectId`). No cross-project lookup is possible; no extra ACL is needed. If `editTicketId` is not found in the store, return 404.

### D6. Priority handling on demotion

The existing `validatePriorityForStatus` invariant says priority MAY be `null` only when `status === 'draft'`. Demotion sets both at once (`status='draft'`, `priority=null`), so the invariant holds throughout the mutation. We do **not** stash the prior priority anywhere; if the user later commits the draft, they must re-pick a priority via the normal commit path. (See Open Question Q1.)

## Risks / Trade-offs

- **Risk:** A bug in client logic causes `editTicketId` to be sent when `editTicket` is actually undefined (e.g., during a stale render). → **Mitigation:** `handleSaveAsDraft` reads `editTicket` from the closure that already gates UI behaviour throughout the shell; the property is sent inside `editTicket ? { editTicketId: editTicket.id } : {}`. Server validation (D2) returns 404 cleanly if it ever does happen.
- **Risk:** A user demotes a `todo` with `priority='high'` and then immediately discards the resulting draft, expecting the original to come back. → **Mitigation:** Out of scope — no undo for this change. Documented in Q1. The user can re-create the ticket if they truly wanted that.
- **Risk:** Two browser tabs open the same non-draft ticket via Continue Editing simultaneously and both save as draft. → **Mitigation:** Last-write-wins is acceptable (already documented as out of scope by `ticket-drafts`). Both saves succeed, the second `origin_conversation_id` overwrites the first; the orphaned conversation is harmless and stays in `chat_conversations` until the user discards it.
- **Trade-off:** We do not migrate or repair drafts already created by the buggy path. Users who already have orphan drafts will need to delete them by hand. The fix is forward-only; no data backfill.

## Migration Plan

No data migration. No schema migration. Forward-compatible API change (`editTicketId` is optional). Deploy server + client together via the standard release pipeline. Rollback = revert the two-file change; the endpoint reverts to insert-on-no-match behaviour without any data corruption.

## Open Questions

- **Q1**: Should the server stash the previous `priority` somewhere (e.g., `metadata.previous_priority`) so a future commit can restore it? → **Decision (proposal):** No. Out of scope. Demotion is an explicit "park this for later" gesture; the user re-picks priority on commit.
