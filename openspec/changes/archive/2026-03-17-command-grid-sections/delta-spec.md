---
id: command-grid-sections
title: "CommandGrid: Discovery & Delivery Sections — Delta Spec"
date: 2026-03-17
---

# Delta Spec

This document describes the behavioral and visual contract changes for `CommandGrid`. It is the authoritative source for acceptance testing.

---

## Component: `CommandGrid`

### Module-level constants (new or changed)

| Constant | Before | After |
|----------|--------|-------|
| `DISCOVERY_SLUGS` | `Set(['product-backlog', 'update-product-driven-backlog'])` — inside component | Removed |
| `DELIVERY_SLUGS` | `Set(['implement', 'batch-implement'])` — inside component | Removed |
| `DISCOVERY_ORDER` | (did not exist) | `['propose-spec', 'update-product-driven-backlog', 'product-backlog']` — module scope |
| `DELIVERY_ORDER` | (did not exist) | `['implement', 'batch-implement']` — module scope |
| `DISPLAY_NAMES` | (did not exist) | `{ 'update-product-driven-backlog': 'Auto-propose Specs', 'product-backlog': 'Auto-Select Specs' }` — module scope |
| `HIDDEN_SLUGS` | (did not exist) | `Set(['propose-feature'])` — module scope |
| `WIZARD_COMMANDS` | `Set(['implement', 'batch-implement'])` | Unchanged |

### `COMMAND_META` additions

| Slug | Icon | Color | Glow |
|------|------|-------|------|
| `propose-spec` | `Sparkles` | `text-dracula-cyan` | `hover:glow-cyan hover:border-dracula-cyan/40` |

### Section ordering and content

| Section | Position | Commands (in order) | Accent | Collapsible |
|---------|----------|---------------------|--------|-------------|
| Discovery | 1st | `propose-spec`, `update-product-driven-backlog`, `product-backlog` | cyan | No |
| Delivery | 2nd | `implement`, `batch-implement` | purple | No |
| Others | 3rd | All remaining visible commands, alphabetical | muted | Yes |

Sections with zero commands are suppressed (unchanged behavior).

### Display name resolution

When rendering a command card's visible label, the resolved display name is:
```
displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name
```

| Slug | Resolved display name |
|------|-----------------------|
| `update-product-driven-backlog` | "Auto-propose Specs" |
| `product-backlog` | "Auto-Select Specs" |
| All other slugs | `cmd.name` (server-provided) |

The display name override applies to:
- Command card label (`<p className="text-sm font-medium">`)
- Toast loading/success messages

The display name override does NOT apply to:
- Tooltip command identifier (`/sr:{cmd.slug}` — always uses the slug)

### Hidden commands

Any command whose `slug` appears in `HIDDEN_SLUGS` is filtered out before any section computation. Such commands do not appear in Discovery, Delivery, or Others.

| Slug | Effect |
|------|--------|
| `propose-feature` | Never rendered |

### Section header visual contract

**Discovery and Delivery (non-collapsible):**
```
● DISCOVERY                  ← accent dot (text-[8px]) + label (text-[10px] semibold uppercase tracking-widest)
  Explore & define your product  ← subtitle (text-[11px] text-muted-foreground/70, left-padded pl-3.5)
──────────────────────────────   ← <hr> border-t border-dracula-cyan/25 (Discovery) or border-dracula-purple/25 (Delivery)
```

Colors:
- Discovery dot + label: `text-dracula-cyan`
- Delivery dot + label: `text-dracula-purple`
- Subtitles: `text-muted-foreground/70`

**Others (collapsible):** Unchanged from current behavior — `ChevronRight` + `Others (N)` button, `text-[10px] uppercase text-muted-foreground`.

### Acceptance Criteria

1. Discovery section is the first visible section; Delivery is second; Others is third.
2. Discovery section header shows `●`, "DISCOVERY" in `text-dracula-cyan`, subtitle "Explore & define your product", and a `border-dracula-cyan/25` horizontal rule.
3. Delivery section header shows `●`, "DELIVERY" in `text-dracula-purple`, subtitle "Build & ship features", and a `border-dracula-purple/25` horizontal rule.
4. Discovery commands appear in order: `propose-spec` card, then `update-product-driven-backlog` card, then `product-backlog` card — provided the server returns those commands.
5. Delivery commands appear in order: `implement` card, then `batch-implement` card.
6. The `update-product-driven-backlog` card displays the label "Auto-propose Specs".
7. The `product-backlog` card displays the label "Auto-Select Specs".
8. The `propose-feature` command does not appear anywhere in the rendered UI.
9. Tooltip for any command shows `/sr:{slug}` (the real slug, not the display name override).
10. Others section is unchanged: collapsible with count, alphabetically sorted.
11. No TypeScript errors (`cd client && npx tsc --noEmit` passes).
12. No console errors during normal rendering.
