---
id: command-grid-sections
title: "CommandGrid: Discovery & Delivery Sections — Technical Design"
date: 2026-03-17
---

# Technical Design

## Scope

Single file: `client/src/components/CommandGrid.tsx`

No server changes. No new files. No changes to `types.ts`, `DashboardPage.tsx`, or any hook.

---

## Current State Analysis

Reading `CommandGrid.tsx` (218 lines) reveals the following relevant structures:

```ts
// Line 71
const WIZARD_COMMANDS = new Set(['implement', 'batch-implement'])

// Lines 118–125 (inside component body — will move to module scope)
const DISCOVERY_SLUGS = new Set(['product-backlog', 'update-product-driven-backlog'])
const DELIVERY_SLUGS  = new Set(['implement', 'batch-implement'])
const discovery = commands.filter((c) => DISCOVERY_SLUGS.has(c.slug))
const delivery  = commands.filter((c) => DELIVERY_SLUGS.has(c.slug))
const others    = commands
  .filter((c) => !DISCOVERY_SLUGS.has(c.slug) && !DELIVERY_SLUGS.has(c.slug))
  .sort((a, b) => a.name.localeCompare(b.name))
```

Section headers (lines 141–154):
- Others: `<button>` with `ChevronRight` icon + `text-[10px] uppercase` label
- Discovery / Delivery: `<h3>` with `text-[10px] uppercase`

The `sections` array (lines 129–133) drives rendering. Each section holds a flat `commands: CommandInfo[]` array.

`CommandInfo` shape (from `types.ts`):
```ts
interface CommandInfo {
  id: string
  name: string        // display name from server (raw command name)
  description: string
  slug: string        // kebab-case command identifier
}
```

---

## Proposed Changes

### 1. Promote constants to module scope

Move `DISCOVERY_SLUGS` and `DELIVERY_SLUGS` out of the component body to module scope, and replace them with ordered arrays. Add `DISPLAY_NAMES` and `HIDDEN_SLUGS` at the same level as `COMMAND_META`.

```ts
// Ordered arrays replace unordered Sets
const DISCOVERY_ORDER = ['propose-spec', 'update-product-driven-backlog', 'product-backlog'] as const
const DELIVERY_ORDER  = ['implement', 'batch-implement'] as const

// Human-readable overrides for slugs whose server names are unintuitive
const DISPLAY_NAMES: Record<string, string> = {
  'update-product-driven-backlog': 'Auto-propose Specs',
  'product-backlog': 'Auto-Select Specs',
}

// Slugs that should never appear in any section
const HIDDEN_SLUGS = new Set(['propose-feature'])
```

Derive Sets from the arrays for O(1) membership checks used in the `others` filter:

```ts
const DISCOVERY_SET = new Set(DISCOVERY_ORDER)
const DELIVERY_SET  = new Set(DELIVERY_ORDER)
```

### 2. Add `propose-spec` to `WIZARD_COMMANDS`

`propose-spec` opens the `FeatureProposalModal` (which is already handled in `DashboardPage` via the `onOpenWizard` callback). Verify whether `propose-spec` should trigger `onOpenWizard` or `spawnCommand`. Based on the Dashboard, clicking "Propose a Feature" opens `FeatureProposalModal`. The `onOpenWizard` handler in `DashboardPage` opens `ImplementWizard` or `BatchImplementWizard` by slug, not `FeatureProposalModal`. Therefore, `propose-spec` should use `spawnCommand` (not wizard) unless `DashboardPage` is extended.

**Decision:** Do NOT add `propose-spec` to `WIZARD_COMMANDS`. It will use `spawnCommand` and display an `ArrowRight` action hint from `FALLBACK_META`. This keeps the change isolated to `CommandGrid.tsx` only. If a dedicated wizard is desired later, that is a separate feature.

Add `propose-spec` to `COMMAND_META`:

```ts
'propose-spec': {
  icon: Sparkles,
  color: 'text-dracula-cyan',
  glow: 'hover:glow-cyan hover:border-dracula-cyan/40',
},
```

### 3. Updated command derivation inside component

```ts
// Filter out hidden slugs first
const visibleCommands = commands.filter((c) => !HIDDEN_SLUGS.has(c.slug))

// Ordered arrays: preserve explicit order, include only commands present in the fetched list
const discoveryBySlug = new Map(visibleCommands.map((c) => [c.slug, c]))
const deliveryBySlug  = new Map(visibleCommands.map((c) => [c.slug, c]))

const discovery = DISCOVERY_ORDER
  .map((slug) => discoveryBySlug.get(slug))
  .filter((c): c is CommandInfo => c !== undefined)

const delivery = DELIVERY_ORDER
  .map((slug) => deliveryBySlug.get(slug))
  .filter((c): c is CommandInfo => c !== undefined)

const others = visibleCommands
  .filter((c) => !DISCOVERY_SET.has(c.slug) && !DELIVERY_SET.has(c.slug))
  .sort((a, b) => a.name.localeCompare(b.name))
```

Note: both Maps are derived from `visibleCommands` so a single Map would suffice. Simplify to one Map in implementation:

```ts
const bySlug = new Map(visibleCommands.map((c) => [c.slug, c]))
const discovery = DISCOVERY_ORDER.map((s) => bySlug.get(s)).filter((c): c is CommandInfo => c !== undefined)
const delivery  = DELIVERY_ORDER.map((s) => bySlug.get(s)).filter((c): c is CommandInfo => c !== undefined)
```

### 4. Apply `DISPLAY_NAMES` override at render time

In the card render, replace `cmd.name` with:

```ts
const displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name
```

This is applied only to the visible label (`<p className="text-sm font-medium">`). The tooltip continues to show `/sr:{cmd.slug}`, which is the real command name — satisfying the acceptance criterion that tooltips show the real command name.

The toast message in `spawnCommand` uses `cmd.name` (from `CommandInfo`), which is the server-provided name. For user-facing feedback, use `displayName` instead — pass it into `handleCommandClick` or derive it inline.

**Recommendation:** Pass `displayName` to `handleCommandClick` so the toast reads "Auto-propose Specs queued" instead of "Update Product Driven Backlog queued".

### 5. Redesigned section headers

Replace the plain `<h3>` (and the Others `<button>` header) with a new inline `SectionHeader` sub-component defined at the top of the file:

```tsx
interface SectionHeaderProps {
  label: string
  subtitle?: string
  accent?: 'cyan' | 'purple' | 'muted'
  collapsible?: boolean
  open?: boolean
  count?: number
  onToggle?: () => void
}

function SectionHeader({ label, subtitle, accent = 'muted', collapsible, open, count, onToggle }: SectionHeaderProps) {
  const dotColor = accent === 'cyan' ? 'text-dracula-cyan' : accent === 'purple' ? 'text-dracula-purple' : 'text-muted-foreground'
  const labelColor = accent === 'cyan' ? 'text-dracula-cyan' : accent === 'purple' ? 'text-dracula-purple' : 'text-muted-foreground'
  const ruleColor = accent === 'cyan' ? 'border-dracula-cyan/25' : accent === 'purple' ? 'border-dracula-purple/25' : ''

  if (collapsible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground transition-colors cursor-pointer"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        {label} ({count})
      </button>
    )
  }

  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-1.5 mb-0.5">
        <span className={cn('text-[8px]', dotColor)}>●</span>
        <span className={cn('text-[10px] font-semibold uppercase tracking-widest', labelColor)}>{label}</span>
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground/70 mb-2 pl-3.5">{subtitle}</p>
      )}
      {ruleColor && <hr className={cn('border-t mb-3', ruleColor)} />}
    </div>
  )
}
```

### 6. Updated `sections` configuration

Extend the sections descriptor type to carry accent and subtitle metadata:

```ts
const sections: {
  label: string
  subtitle?: string
  accent?: 'cyan' | 'purple' | 'muted'
  commands: CommandInfo[]
  collapsible?: boolean
}[] = [
  { label: 'Discovery', subtitle: 'Explore & define your product', accent: 'cyan', commands: discovery },
  { label: 'Delivery',  subtitle: 'Build & ship features',        accent: 'purple', commands: delivery },
  { label: 'Others', commands: others, collapsible: true },
].filter((s) => s.commands.length > 0)
```

---

## Design Decisions

### Why ordered arrays instead of Sets

Sets give no ordering guarantee. By switching to `DISCOVERY_ORDER` and `DELIVERY_ORDER` arrays and using `.map()` to reconstruct the command list in explicit order, we get deterministic rendering regardless of server response order. The Set-based membership check for the `others` filter is derived from the arrays, keeping the single source of truth.

### Why `DISPLAY_NAMES` lives in the component file

The display names are purely a UI-layer concern — they exist because the command slugs are technical identifiers that don't read well in a UI. They are not part of the server contract or the `CommandInfo` type. Keeping them in `CommandGrid.tsx` alongside `COMMAND_META` ensures all visual customizations for commands are co-located.

### Why `propose-spec` uses `spawnCommand` not a wizard

`DashboardPage.tsx` wires `onOpenWizard` only to `ImplementWizard` and `BatchImplementWizard`. Adding `propose-spec` to `WIZARD_COMMANDS` would silently swallow the click (no matching wizard case). A dedicated `ProposeSpecWizard` is out of scope for this issue.

### Why `SectionHeader` is a local sub-component, not a shared component

These headers are semantically specific to the command grid's two named sections. Exporting to a shared component directory would invite misuse across the app. If more sections with this visual pattern appear elsewhere, extract at that point.

---

## Affected Files

| File | Type of Change |
|------|---------------|
| `client/src/components/CommandGrid.tsx` | Modify |

No other files are modified.
