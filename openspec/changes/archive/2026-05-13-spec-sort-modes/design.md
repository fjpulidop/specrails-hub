## Context

`DashboardPage.tsx` builds `specTickets` (active) and `doneSpecTickets` from the project's ticket list, then `SpecsBoard.tsx` renders them with a `@dnd-kit` `SortableContext`. The active list is reordered via drag and persisted to `localStorage['specrails-hub:spec-order:<projectId>']` as an explicit `id[]`. Tickets returned by the API but absent from the persisted array are appended in API order.

No sort control exists today. Users with 30+ specs ask for a fast way to bring `critical`/`high` to the top or to scan by ticket number.

## Goals / Non-Goals

**Goals:**
- Introduce three sort modes — `Default`, `Ticket #`, `Priority` — with separate direction (asc/desc) applying to the latter two.
- Same mode applied to the active and Done sections.
- Drag-to-reorder while in a non-default mode flips the mode to `Default` and persists the new order under the existing `spec-order` key. No new mutation surface.
- Persist `(mode, direction)` per project in `localStorage`. Survives reload and project switch.
- Bucket-based priority with stable id-asc tiebreaker.

**Non-Goals:**
- Sorting Rails (kept manual).
- Server-side sort or schema changes.
- Multi-key sort (e.g., priority then date).
- Per-user vs per-machine sync (same localStorage scoping as label filter and spec-order).
- Saving the manual order under a name (no presets).

## Decisions

### Where ordering lives

Keep the ordering pipeline in `DashboardPage.tsx`. `SpecsBoard` continues to receive a pre-ordered `tickets` array (it already does — see the `SpecsBoardProps` comment). The new sort control lives in `SpecsBoard` for layout reasons, but emits `(mode, direction)` upwards via a callback so `DashboardPage` owns the sort logic and the localStorage writes.

**Alternative considered**: own the sort state inside `SpecsBoard`. Rejected because `doneSpecTickets` is also derived in `DashboardPage` and we want a single comparator.

### Comparator

```ts
// mode = 'ticket-id'
desc: b.id - a.id
asc:  a.id - b.id

// mode = 'priority'
const bucket = (p: Priority | null): number =>
  p === 'critical' ? 4 : p === 'high' ? 3 : p === 'medium' ? 2 : p === 'low' ? 1 : 0
desc: bucket(b.priority) - bucket(a.priority)  ||  a.id - b.id
asc:  bucket(a.priority) - bucket(b.priority)  ||  a.id - b.id
```

Tiebreaker is `id` ascending in both directions — keeps neighbours stable when toggling direction repeatedly.

### Drag while sorted → flip-to-default

The chosen UX (option 1b in exploration) is: drag is always enabled; if the user drags while `mode !== 'default'`, the drag-end handler:
1. Computes the resulting `id[]` from the **currently visible** order with the move applied (i.e. uses the sorted array as the base, not the persisted custom order).
2. Sets `mode='default'` and clears `direction`.
3. Persists the new id list to `specrails-hub:spec-order:<projectId>` and the mode change to `specrails-hub:spec-sort-mode:<projectId>`.

This means the act of dragging "captures" the current visual order as the new custom order. The user sees no jump — the dropped card stays where they dropped it.

**Alternative considered**: disable drag handles while non-default. Cleaner mental model but loses the natural "grab from sorted view, drop, keep" workflow we discussed.

### Persistence keys

Per-project, mirroring the existing `spec-order` and label-filter patterns:

- `specrails-hub:spec-sort-mode:<projectId>` → `'default' | 'ticket-id' | 'priority'`
- `specrails-hub:spec-sort-dir:<projectId>` → `'asc' | 'desc'`

When mode is `default`, direction is irrelevant — UI hides the arrow, but the stored value is preserved so toggling back to a sorted mode restores the user's last direction.

Cleared with the rest of project-scoped data when a project is removed (best-effort cleanup; orphan keys do not break anything).

### UI control

`SpecSortControl` is a two-element compound:

```
[ ↕ Default ▾ ]  [ ↑ ]
   chip            arrow
```

- Chip: dropdown menu (Radix `DropdownMenu`) with three items. Selecting a non-default mode shows the arrow.
- Arrow: button toggling asc/desc. Hidden when mode is `default`.
- Both have themed semantic tokens (`accent-secondary` for the chip background) — no brand colours.
- Tooltip on chip shows the current selection; tooltip on arrow shows "Ascending" / "Descending".

Layout in `SpecsBoard` header: `<icon> Spec [count] <label-strip> [sort-control] [+ Add]`. The label strip's `flex-1` shrinks to make room.

### Done-section ordering

`doneSpecTickets` already exists in `DashboardPage`. Apply the same comparator. No new toggle — the user gets one sort applied to both lists, matching their mental model.

### Done-section in Default mode

Today `doneSpecTickets` is filtered from `allSpecTickets` with no explicit order — it inherits API order. Keep that behaviour for `mode='default'`. Only `ticket-id` and `priority` reorder the Done section.

## Risks / Trade-offs

- **Drag-flips-mode might surprise** → The chip clearly shows the active mode; once it flips back to `Default` the user sees the chip change. Add a one-shot toast first time it happens? Out of scope for v1.
- **Tiebreaker by id-asc means `priority desc` puts equal-priority specs in id-asc order** → The alternative (id desc as tiebreaker for desc direction) is more "intuitive" per row but causes neighbouring cards to swap places when only the direction toggles. Stable id-asc is the safer default.
- **localStorage scoping** → If a user wipes browser storage they lose mode + custom order at once. Consistent with how label filter and spec-order behave today.
- **No migration** → Existing users land in `mode='default'` (no key present), which renders identically to today.

## Migration Plan

No data migration. The feature is purely client-side and additive. Rollback = revert the client commits.

## Open Questions

None blocking. Possible v2 work (out of scope): a "reset to API order" affordance in the chip dropdown, secondary sort key, surfacing the active sort in URL query params.
