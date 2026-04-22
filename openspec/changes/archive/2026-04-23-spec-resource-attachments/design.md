## Context

Specrails-hub spawns a `claude` CLI process for spec generation (`POST /tickets/generate-spec`) and AI editing (`POST /tickets/:id/ai-edit`). Both currently receive only plain text. Tickets are stored as JSON in `local-tickets.json`; there is no existing attachment concept. The Claude CLI supports `--image <path>` for image files; all other file types must be injected as text content in the prompt.

## Goals / Non-Goals

**Goals:**
- Per-ticket file attachment storage on the local filesystem
- Inline `@filename` pills in a `contenteditable` instruction editor (RichAttachmentEditor)
- Drag & drop (anywhere on the modal → overlay), paste (images), and file browser (multi-select)
- Files passed to Claude CLI at spawn time (images via `--image`, text-extractable files embedded in prompt)
- Persistent Resources section on TicketDetailModal listing all ticket attachments
- Bidirectional coherence: removing a file deletes it from disk and removes its `@pill` from editor
- Premium animations: staggered chip entry, scale-out removal, drop overlay pulse

**Non-Goals:**
- Video file support (deferred)
- Cloud/remote storage (local filesystem only)
- Attachment sharing between tickets
- Attachment versioning or history
- Size limits beyond OS filesystem constraints (no enforced cap in this iteration)

## Decisions

### D1: Filesystem layout, not SQLite blobs
Store files at `~/.specrails/projects/<slug>/attachments/<ticketId>/<uuid>-<originalName>`.

*Why*: SQLite performs poorly with binary blobs >100KB; video exclusion doesn't eliminate large PDFs/images. Files on disk allow direct path references to the CLI (`--image /abs/path`). Metadata (id, filename, mimeType, size, addedAt) lives on the `Ticket` object in `local-tickets.json` — no new DB table needed.

*Alternative considered*: `attachments` table in `jobs.sqlite`. Rejected because it adds a cross-concern dependency and complicates the already-separate `ticket-store.ts` path.

### D2: `contenteditable` RichAttachmentEditor with `@pill` spans
Replace the `<textarea>` in both ProposeSpecModal and TicketDetailModal AI Edit with a `contenteditable` div. Attached files insert as `<span contenteditable="false" data-attachment-id="<uuid>">@filename ✕</span>` at cursor position.

*Why*: Plain textarea with overlay highlight is fragile (pixel-perfect sync required). `contenteditable` gives real inline nodes that can be styled, focused, deleted with keyboard, and iterated via DOM. It's the pattern used by Linear, Notion, and GitHub's comment editor.

*Alternative considered*: Lexical or TipTap. Rejected — full rich-text editors are 100KB+ overhead for a single-purpose textarea replacement. A bespoke ~200-line component is sufficient.

### D3: Upload-on-drop, not upload-on-submit
Files are uploaded to the server (and saved to disk) immediately when dropped/selected, not when the user submits the form.

*Why*: Keeps the submit path simple (just `attachmentIds[]`). Gives immediate visual feedback (chip appears with name/thumbnail). Allows @pills to reference a real server-side ID. Orphaned files (dropped but form cancelled) are acceptable; they remain on disk until the ticket is deleted or the user manually removes them.

### D4: Content extraction pipeline in AttachmentManager
`server/attachment-manager.ts` owns both storage and content extraction. At spawn time, `generate-spec` and `ai-edit` routes call `attachmentManager.getClaudeArgs(attachmentIds)` which returns `{ imageFlags: string[], textBlocks: string[] }`. Image flags go to `claude --image <path>` CLI args; text blocks are appended to the system/user prompt.

Extraction per type:
- **Images** (jpg, jpeg, png, gif, webp): absolute path inlined as `@<abs-path>` inside a `<user-attachment>` block. Claude CLI auto-resolves `@path` references for image understanding (no `--image` flag exists in Claude Code CLI 2.x — flag-based approach removed during implementation)
- **PDF**: `pdf-parse` → extracted text → text block
- **CSV / TXT / JSON**: read as UTF-8 → text block
- **Excel (.xlsx, .xls)**: `xlsx` lib → first sheet as CSV → text block

**Prompt-injection containment.** Text blocks are wrapped in an explicit delimiter before concatenation into the prompt:

```
<user-attachment id="<uuid>" name="<filename>" mime="<mimeType>">
<content>
</user-attachment>
```

The system prompt gains one sentence telling Claude to treat content inside `<user-attachment>` as untrusted user data, never as instructions. The closing tag is validated not to appear in content (escape occurrences defensively). This prevents a malicious CSV/PDF from overriding spec-generation behavior.

### D5: Modal-level drag overlay, not zone-only
When a drag enters the modal's root element, a full-overlay `<div>` renders over the modal content with a pulsing border and "Drop to add context" message. This is the pattern used by Linear and GitHub Issues — the entire modal is a drop target, not a small zone.

The zone itself is always visible (when no attachments) or compact (when attachments exist), but the drag overlay makes the affordance clear regardless of where on the modal the user releases.

### D6: Resources section is append-only, ordered by `addedAt`
All attachments ever associated with a ticket persist in `ticket.attachments[]`. There is no "detach without delete" — removing always deletes from disk. The Resources section shows all non-deleted attachments sorted by `addedAt` descending.

## Risks / Trade-offs

- **`contenteditable` serialization complexity** → `RichAttachmentEditor` exposes a `getPlainText()` method that walks child nodes, replacing pill spans with `@[<filename>](<attachmentId>)` tokens (markdown-link-style, unambiguous even when two files share a name). The submit payload sends `{ instructions: string, attachmentIds: string[] }` — the server authoritatively dereferences by `attachmentId`, not by name-parsing. Mitigation: unit tests on the serializer cover collisions, empty editor, adjacent pills, and nested-tag paste edge cases.
- **`contenteditable` real-world pitfalls** → Beyond serialization, contenteditable is notoriously fiddly: IME composition (CJK input), paste sanitization (must strip HTML → plain text on paste), caret positioning across pill spans, browser-native undo stack corruption when programmatically inserting pills, Safari vs Chrome selection divergence. Mitigation scope: (1) always strip HTML on `paste` via `e.clipboardData.getData('text/plain')`; (2) guard `compositionstart`/`compositionend` so pill insertion does not fire mid-IME; (3) manage undo ourselves via a small command stack (insertPill / removePill / insertText) since native undo skips `contenteditable=false` spans unevenly. Expected component size ~400 LOC, not the 200 originally estimated — still well under a full TipTap/Lexical footprint.
- **Orphaned files on cancel** → Acceptable for v1. Future: a cleanup job that deletes attachment files with no matching `@reference` in any ticket. Not in scope here.
- **PDF extraction quality** → `pdf-parse` works well for text-based PDFs; scanned PDFs produce garbage. Mitigation: show extracted text length in chip subtitle so user can see if extraction failed.
- **`xlsx` dependency size** → ~1.5MB added to server bundle. Acceptable; it's already common in Node ecosystems.
- **Ticket delete does not cascade-delete attachments** → `ticket-store.ts` `DELETE /tickets/:id` route currently has no cleanup hook. Must add `attachmentManager.deleteAll(ticketId)` call. Risk of missed attachment cleanup if route is bypassed.

## Migration Plan

- `local-tickets.json` schema: `attachments` field is optional (`attachments?: Attachment[]`). Existing tickets without the field are treated as having no attachments. No migration script needed.
- New filesystem directories are created on first upload. No pre-creation needed.
- New server dependencies (`pdf-parse`, `xlsx`, `multer`) added to root `package.json`.

## Open Questions

- Should `ProposeSpecModal` create a temporary ticket ID for attachments before the spec is generated (since no ticket exists yet)? → Use a `pendingSpecId` (UUID) generated client-side on modal open; attachments are uploaded under this ID. On spec creation success, the server moves/renames the attachment dir to the real ticket ID. On cancel, the temp dir is cleaned up.
- Maximum attachment count per ticket? → No hard limit in v1; UX naturally discourages excess via the chip grid layout.
