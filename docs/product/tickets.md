# Ticket Panel

The **Tickets** section in specrails-hub provides a visual interface for the local ticket management system built into specrails-core. It supports three view modes, real-time sync with CLI agents, and full CRUD from the browser.

---

## Prerequisites

The Tickets panel requires:
- specrails-core installed in your project with `provider: local` in `.claude/backlog-config.json`
- `.specrails/local-tickets.json` present (created automatically during `/setup`)

If the file is missing, the panel shows an empty state with a prompt to run `/setup` in Claude Code.

---

## Opening the panel

The **Tickets** section appears on the project dashboard between **Commands** and **Rails**. It is expanded by default.

The section header shows the count of active tickets (todo + in progress). Pin the section using the pin icon to keep it expanded across page reloads.

---

## View modes

Toggle between three views using the buttons in the section header: **List**, **Grid**, and **Post-it**.

### List view (default)

A sortable table with columns: **Status**, **Title**, **Priority**, **Labels**, **Updated**.

- Click any row to open the ticket detail modal
- Sort by clicking column headers (status, priority, updated date)
- **Filter bar:** status buttons (All / Todo / In Progress / Done / Cancelled), label dropdown, and a search box (searches title and description, debounced 300 ms)
- Keyboard navigation: arrow keys move between rows, **Enter** opens the focused ticket
- Pagination: 20 tickets per page, **Load more** button at the bottom

### Grid view (Kanban)

A three-column kanban board: **Todo**, **In Progress**, **Done**.

- Drag cards between columns to change status
- Cards show title, ID, priority badge, and label chips
- Cancelled tickets appear in a separate row below the board (not droppable)
- Vertical reordering within a column is supported

### Post-it view

A responsive grid of sticky notes, color-coded by status:

| Status | Color |
|--------|-------|
| Todo | Gray |
| In Progress | Blue |
| Done | Green |
| Cancelled | Red/muted |

Each note shows the title and a priority indicator. Hover animates the note (straightens and lifts). Click to open the detail modal.

---

## Creating a ticket

Click the **+** button in the Tickets section header to open the Create Ticket modal.

| Field | Required | Notes |
|-------|----------|-------|
| Title | Yes | Short description of the work |
| Description | No | Markdown supported |
| Status | No | Default: `todo` |
| Priority | No | Default: `medium` |
| Labels | No | Type to add; autocompletes from existing labels |

Press **Enter** or click **Save** to create the ticket. The list updates immediately via WebSocket — no page reload needed.

Keyboard shortcut: **Escape** closes the modal without saving.

---

## Editing a ticket

Click any ticket (row, card, or post-it) to open the detail modal.

- **Title** — click to edit inline
- **Description** — click to enter edit mode; markdown is rendered by default
- **Status** — dropdown in the header
- **Priority** — selector in the header
- **Labels** — add or remove chips; autocompletes from all labels used in the project
- **Prerequisites** — read-only list of dependent ticket IDs

Click **Save** to write changes. The file is updated via the REST API with the file locking protocol, so concurrent CLI agent writes are safe.

---

## Deleting a ticket

Right-click any ticket (in any view) to open the context menu. Select **Delete ticket** and confirm the dialog.

You can also click **Delete** in the ticket detail modal footer.

---

## Context menu

Right-clicking a ticket in any view opens a context menu with:

- **Delete ticket** — with confirmation dialog
- **Change status →** submenu (Todo, In Progress, Done, Cancelled)
- **Set priority →** submenu (Critical, High, Medium, Low)

---

## Real-time sync

Changes made by CLI agents (e.g., `/sr:implement` updating a ticket to `in_progress`) appear in the hub automatically — no manual refresh.

Hub watches `.specrails/local-tickets.json` using chokidar with a 400 ms debounce. When the file changes:

1. Hub reads the updated file
2. Broadcasts a `ticket_updated` WebSocket message to connected clients
3. The Tickets panel re-fetches and highlights new or changed tickets with a brief glow effect

When the hub itself mutates a ticket (via the REST API), it tracks the revision to avoid echoing the change through the file watcher.

**Toast notifications** appear when:
- A new ticket is created by a CLI agent: _"1 new ticket added from product discovery"_
- A ticket is deleted

---

## Status visual indicators

| Status | Indicator |
|--------|-----------|
| Todo | Gray dot, muted text, dashed left border |
| In Progress | Blue pulsing dot, bold text, solid blue left border |
| Done | Green checkmark, subtle text, solid green left border |
| Cancelled | Red X, dimmed text, no border |

These are consistent across all three view modes.

---

## REST API

The Tickets panel is backed by a REST API under `/api/projects/:projectId/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets` | List tickets. Filters: `?status=todo`, `?label=area:frontend`, `?q=search+term` |
| GET | `/tickets/:id` | Get a single ticket by numeric ID |
| POST | `/tickets` | Create a ticket. Body: `{ title, description?, status?, priority?, labels? }` |
| PATCH | `/tickets/:id` | Update fields. Body: any subset of ticket fields |
| DELETE | `/tickets/:id` | Delete a ticket |
| GET | `/integration-contract` | Read the project's integration-contract.json, including ticketProvider config |

All mutating endpoints honor the advisory file lock and increment `revision`. A `409 Conflict` is returned if the lock cannot be acquired after retries.

---

## WebSocket events

| Message type | Trigger | Payload |
|-------------|---------|---------|
| `ticket_created` | New ticket POSTed via API | `{ projectId, ticket, timestamp }` |
| `ticket_updated` | Ticket PATCHed via API, or file changed externally | `{ projectId, ticket, timestamp }` |
| `ticket_deleted` | Ticket DELETEd via API | `{ projectId, ticketId, timestamp }` |

When `ticket.id === 0` in a `ticket_updated` message, it signals a full external change (the file watcher detected a batch update). The client performs a full re-fetch in this case.
