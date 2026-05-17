# Creating specs

A **spec** in specrails-hub is a description of work you want done — what the AI agents will read and act on. This guide walks through every way you can create, refine, compare, and organise them.

## Creating a spec

Open the Dashboard and click **+ Add Spec**. You'll be asked to pick a mode:

### Quick mode

For when you already know what you want. Type a one-line title; Claude generates the full spec in a single turn.

**Options:**

- **Model** — defaults to the project's chosen model. Override per spec.
- **Enrich with Contract Layer** — appends a structured five-section block to the description:
  - Naming Contract — exact identifiers to reuse
  - Data Shapes — JSON-ish payloads
  - State Machine — transitions
  - Invariants — must-hold properties
  - File Touch List — files the implementation will edit

  Useful for anti-reinvention: the downstream agents won't have to guess names or shapes. Per-project last-toggle is remembered.

While the spec is being generated, a long-lived toast in the bottom-right shows the live cost, turn count, **Cancel**, and **View** (jumps to the spec when done).

### Explore mode

For when the spec needs shaping. You converse with Claude; a live draft updates each turn.

**Context preset slider:**

| Preset | What Claude sees | When to use |
|--------|------------------|-------------|
| Minimal | Your message only | Fastest, cheapest. Greenfield ideas. |
| Light | + a small slice of the project | Quick scope questions. |
| Standard | + a medium slice | Most everyday work. |
| Rich | + medium slice (different selection) | Cross-cutting changes. |
| Max | + medium slice + Contract Layer | Production-quality specs. |
| Hub | + medium slice + MCPs + Contract Layer | When you have semantic-code-nav plugins installed and want them online. |

Click **Fine-tune** to adjust the underlying flags manually. The decision is per-conversation (saved on `chat_conversations.context_scope`) — it doesn't bleed into other Explore sessions.

**Buttons in the shell:**

- **Save as Draft** — persists the conversation as a draft ticket so you can come back later. Available once you've sent at least one user turn. The draft carries `origin_conversation_id` pointing back at this conversation so you can resume from the dashboard.
- **Commit** — promotes the live draft to a real spec with status `todo`. The conversation stays in history.
- **Minimize** — parks the conversation as a toast chip; click the chip later to restore.
- **Discard** — destructive, asks for confirmation.

## Drafts

A draft is an in-progress Explore conversation saved as a ticket with status `draft`. Drafts behave like normal tickets but:

- Carry a `Draft` pill where the priority pill would be.
- Live in the Backlog/Todo column with a subtly tinted border.
- Have a **Continue Explore** action in the detail modal that re-opens the conversation with full chat history.

Drafts are never auto-deleted. You either discard them explicitly or commit them.

> Pro tip: when you're not sure if a spec is worth doing, save it as a draft and let it sit. The next morning, open the draft, glance at the description, and decide.

## Compare two specs side by side

Open any spec modal. Then either:

- **Drag the modal header** to the left or right edge of the screen — once you cross 20% of the viewport, it snaps to a half-screen panel and a picker of your other todo specs appears on the opposite side.
- **Click "Compare"** in the modal toolbar (top right) — same result, no drag.

```
Drag left:                          Drag right:
┌────────┬─────────┐                ┌─────────┬────────┐
│ Spec A │ Picker  │                │ Picker  │ Spec A │
│        │ ┌─────┐ │                │ ┌─────┐ │        │
│        │ │ #2  │ │                │ │ #2  │ │        │
│        │ │ #5  │ │                │ │ #5  │ │        │
│        │ └─────┘ │                │ └─────┘ │        │
└────────┴─────────┘                └─────────┴────────┘
```

Click a picker card and that side becomes a second detail modal — now you have two specs open side by side, fully interactive.

**Resize the split** by dragging the vertical divider, or use arrow keys / Home / End / 0 (focusable separator). Ratio is clamped between 25 % and 75 %.

**Exit rules:**

- Backdrop click → close both.
- `×` on the *original* (origin) side → close both.
- `×` on the *other* side → return that side to the picker.
- Open a third spec from a link inside either panel (e.g. clicking an epic chip in the SMASH sidebar, or **Continue Explore** on a draft) → split-view collapses and the third spec opens centred.

**URL persistence:** the comparison is encoded in the URL as `?compare=<id>&compareSide=<side>&compareOrigin=<id>`, so a page refresh restores the split.

**Viewport:** disabled below 900 px. If you shrink the window while in split, the hub collapses cleanly to a centred modal.

## SMASH a big spec

Got an epic that's clearly too big? Open it and click **SMASH** in the toolbar. Claude decomposes it into a family of sub-specs with one click. Each child:

- Gets `parent_epic_id` pointing back at the epic.
- Carries an execution order (the SMASH agent decides the right order).
- Carries a `short_summary` (≤ 120 chars) surfaced on its postit card.

Inside the epic's modal you'll see an **Epic Family Sidebar** listing all children. Inside each child's modal, an **Epic Breadcrumb** lets you jump back to the parent.

## Continue Editing — refine an existing spec

For any spec with status `draft`, `todo`, or `backlog`, the detail modal shows a **Continue Editing** button. Click it and:

1. The spec opens in a fresh Explore shell with the draft pane pre-seeded with the current title, description, priority, labels, and acceptance criteria.
2. If the spec was originally an Explore draft (i.e. has `origin_conversation_id`), the original conversation is resumed — you see the chat history.
3. You type the first refinement. Claude updates the live draft.
4. The Review step shows a real diff against the current spec before commit.
5. On commit, the spec is PATCH-ed (no new ticket created).

Continue Editing works from the dashboard or from inside a split-view comparison — if you trigger it from a split-view panel, the comparison collapses automatically because the shell needs the full screen.

## Status visuals

Every spec card shows a status indicator consistent across all view modes:

| Status | Indicator | Border |
|--------|-----------|--------|
| `draft` | Accent-secondary dot, `Draft` pill | Subtle accent-secondary tint, dashed on postit |
| `todo` | Gray dot, muted text | Dashed left border |
| `in_progress` | Blue pulsing dot, bold text | Solid blue left border |
| `done` | Green checkmark, dimmed text | Solid green left border |
| `cancelled` | Red X, dimmed text | No border |

## Filtering and sorting

Above the SpecsBoard:

- **Status chips** — multi-select. Hide done/cancelled by default.
- **Label dropdown** — multi-select across all labels used in the project.
- **Priority chips** — Critical / High / Medium / Low.
- **Search** — debounced 300 ms, searches title + description.
- **Sort** — Default / Priority / Status / Updated / Created (with asc/desc).

Filters are URL-synced — refresh restores them.

## Right-click context menu

Right-click any spec card (in any view mode):

- **Delete ticket** — with confirmation.
- **Change status → Todo / In Progress / Done / Cancelled**
- **Set priority → Critical / High / Medium / Low**

## Three view modes (and a fourth tier)

The Dashboard's SpecsBoard auto-picks a tier from the splitter width:

- **`row`** (< 600 px) — compact one-line rows.
- **`card`** (600–900 px) — standard cards.
- **`postit`** (> 900 px, default) — postit-style cards with short summaries.

In other places (the split-view picker, legacy `TicketsSection`), you can manually pick List / Grid (kanban with drag-and-drop) / Post-it.

## What happens behind the scenes

You don't need this to use the feature, but it's nice to know:

- Specs live in `<project>/.specrails/local-tickets.json` (JSON store).
- A file watcher catches external edits (e.g. when a Claude agent updates a spec to `in_progress`) and broadcasts a WebSocket event. The board updates instantly.
- Every Claude CLI invocation that creates or refines a spec is recorded in your analytics under one of these surfaces:
  - `quick-spec` — Quick mode generation
  - `explore-spec` — every Explore conversation turn + Contract Refine runner
  - `ai-edit` — Continue Editing
- Drafts are linked to their conversation via `origin_conversation_id`. Deleting a draft cascades to its conversation when no other ticket references it; deleting a conversation clears the field on any linked tickets.

## Where to go next

- [Running pipelines](running-pipelines.md) — drag those specs onto rails and launch the implementation pipeline.
- [Tracking cost](tracking-cost.md) — see what each spec is costing you.
- [Customising the hub](customizing.md) — set a daily budget so you can stop worrying.
