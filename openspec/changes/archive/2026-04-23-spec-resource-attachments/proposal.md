## Why

Spec creation and AI editing today accept only plain text instructions, leaving users unable to provide visual or structured context (mockups, briefs, data files) that directly informs what Claude generates. Adding file attachments as first-class context closes the gap between the artifacts users already have and the specs Claude produces.

## What Changes

- Users can attach files (images, PDFs, CSVs, Excel, JSON, TXT) via drag & drop, paste, or file browser in both the ProposeSpecModal and the TicketDetailModal AI Edit panel
- Dropped/selected files are immediately saved to a per-ticket attachment directory on the local filesystem
- A `RichAttachmentEditor` replaces the plain textarea for instructions — files appear as inline `@filename` pills inside the editor text
- Attached files are passed to the Claude CLI at spawn time (images as `--image <path>` flags; text-extractable files embedded in the prompt)
- A persistent **Resources** section on TicketDetailModal lists all attachments ever used for a ticket, with one-click preview/open
- Removing an attachment (via pill delete or Resources list) deletes the local file and removes the `@reference` from the editor
- The `Ticket` schema gains an `attachments` field to persist attachment metadata across sessions

## Capabilities

### New Capabilities

- `ticket-attachments`: Per-ticket file attachment system — filesystem storage, metadata on the Ticket model, CRUD API endpoints, and content extraction pipeline feeding files into Claude CLI spawns
- `rich-attachment-editor`: Premium `contenteditable`-based instruction editor with inline `@filename` pills, drag & drop overlay, paste detection, and file browser; used in ProposeSpecModal and TicketDetailModal

### Modified Capabilities

- `project-agent-models`: No requirement changes — unrelated

## Impact

- **Server**: new `AttachmentManager` module; new REST endpoints under `/projects/:id/tickets/:ticketId/attachments`; `generate-spec` and `ai-edit` routes extended to accept `attachmentIds[]` and inject file content into Claude CLI spawn
- **Client**: new `RichAttachmentEditor` and `AttachmentsSection` components; `ProposeSpecModal` and `TicketDetailModal` updated
- **Schema**: `Ticket` interface gains `attachments?: Attachment[]`; `local-tickets.json` is backwards-compatible (field is optional)
- **Dependencies (server)**: `pdf-parse` (PDF text extraction), `xlsx` (Excel → CSV conversion), `multer` (multipart upload handling)
- **Filesystem**: new directory `~/.specrails/projects/<slug>/attachments/<ticketId>/` created on first upload, cleaned up on ticket delete
