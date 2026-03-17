---
id: command-grid-sections
title: "CommandGrid: Discovery & Delivery Sections — Context Bundle"
date: 2026-03-17
---

# Context Bundle for Developer

This bundle provides everything needed to implement the `command-grid-sections` change without reading other documents.

---

## What you are building

Reorganize `client/src/components/CommandGrid.tsx` to:
1. Show two visually rich section headers — **Discovery** (cyan accent) and **Delivery** (purple accent) — replacing the plain `<h3>` tags.
2. Enforce explicit command ordering in each section via ordered arrays instead of Sets.
3. Add `propose-spec` to the Discovery section (currently it falls through to Others).
4. Override display names: `update-product-driven-backlog` → "Auto-propose Specs", `product-backlog` → "Auto-Select Specs".
5. Remove the dead `propose-feature` command from the Others section.

**Only one file changes:** `client/src/components/CommandGrid.tsx`

---

## Current file state (key excerpts)

```ts
// Line 71 — current wizard set (unchanged)
const WIZARD_COMMANDS = new Set(['implement', 'batch-implement'])

// Lines 118–125 inside CommandGrid component — to be replaced
const DISCOVERY_SLUGS = new Set(['product-backlog', 'update-product-driven-backlog'])
const DELIVERY_SLUGS  = new Set(['implement', 'batch-implement'])
const discovery = commands.filter((c) => DISCOVERY_SLUGS.has(c.slug))
const delivery  = commands.filter((c) => DELIVERY_SLUGS.has(c.slug))
const others    = commands
  .filter((c) => !DISCOVERY_SLUGS.has(c.slug) && !DELIVERY_SLUGS.has(c.slug))
  .sort((a, b) => a.name.localeCompare(b.name))

// Lines 129–133 — sections array (to be extended with subtitle/accent)
const sections: { label: string; commands: CommandInfo[]; collapsible?: boolean }[] = [
  { label: 'Discovery', commands: discovery },
  { label: 'Delivery',  commands: delivery },
  { label: 'Others',    commands: others, collapsible: true },
].filter((s) => s.commands.length > 0)

// Lines 141–154 in JSX — header render (to be replaced with SectionHeader)
{section.collapsible ? (
  <button type="button" onClick={() => setOthersOpen(!othersOpen)}
    className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 hover:text-foreground transition-colors cursor-pointer"
  >
    <ChevronRight className={cn('w-3 h-3 transition-transform', othersOpen && 'rotate-90')} />
    {section.label} ({section.commands.length})
  </button>
) : (
  <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
    {section.label}
  </h3>
)}

// Line 183 — card label (cmd.name must become displayName)
<p className="text-sm font-medium leading-tight truncate">{cmd.name}</p>
```

---

## Full diff specification

### Add after `FALLBACK_META` (around line 69), before `WIZARD_COMMANDS`:

```ts
const DISCOVERY_ORDER = ['propose-spec', 'update-product-driven-backlog', 'product-backlog'] as const
const DELIVERY_ORDER  = ['implement', 'batch-implement'] as const
const DISCOVERY_SET   = new Set<string>(DISCOVERY_ORDER)
const DELIVERY_SET    = new Set<string>(DELIVERY_ORDER)
const DISPLAY_NAMES: Record<string, string> = {
  'update-product-driven-backlog': 'Auto-propose Specs',
  'product-backlog': 'Auto-Select Specs',
}
const HIDDEN_SLUGS = new Set(['propose-feature'])
```

### Add to `COMMAND_META` (first entry, before `implement`):

```ts
'propose-spec': {
  icon: Sparkles,
  color: 'text-dracula-cyan',
  glow: 'hover:glow-cyan hover:border-dracula-cyan/40',
},
```

`Sparkles` is already imported — no new import needed.

### Add `SectionHeader` component (after module constants, before `CommandGridProps` interface):

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
  const dotColor =
    accent === 'cyan'    ? 'text-dracula-cyan'
    : accent === 'purple' ? 'text-dracula-purple'
    : 'text-muted-foreground'
  const labelColor = dotColor
  const ruleColor =
    accent === 'cyan'    ? 'border-dracula-cyan/25'
    : accent === 'purple' ? 'border-dracula-purple/25'
    : ''

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

### Inside `CommandGrid` component — replace derivation block:

```ts
// Replace old DISCOVERY_SLUGS / DELIVERY_SLUGS lines with:
const visibleCommands = commands.filter((c) => !HIDDEN_SLUGS.has(c.slug))
const bySlug = new Map(visibleCommands.map((c) => [c.slug, c]))
const discovery = DISCOVERY_ORDER
  .map((s) => bySlug.get(s))
  .filter((c): c is CommandInfo => c !== undefined)
const delivery = DELIVERY_ORDER
  .map((s) => bySlug.get(s))
  .filter((c): c is CommandInfo => c !== undefined)
const others = visibleCommands
  .filter((c) => !DISCOVERY_SET.has(c.slug) && !DELIVERY_SET.has(c.slug))
  .sort((a, b) => a.name.localeCompare(b.name))
```

### Replace `sections` array:

```ts
const sections: {
  label: string
  subtitle?: string
  accent?: 'cyan' | 'purple' | 'muted'
  commands: CommandInfo[]
  collapsible?: boolean
}[] = [
  { label: 'Discovery', subtitle: 'Explore & define your product', accent: 'cyan',   commands: discovery },
  { label: 'Delivery',  subtitle: 'Build & ship features',         accent: 'purple', commands: delivery },
  { label: 'Others',                                                                  commands: others, collapsible: true },
].filter((s) => s.commands.length > 0)
```

### Inside the `.map()` render block — add display name resolution:

Add before the JSX return in the `section.commands.map()` callback:
```ts
const displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name
```

Replace `cmd.name` in the card label:
```tsx
<p className="text-sm font-medium leading-tight truncate">{displayName}</p>
```

Update toast calls in `handleCommandClick`:
```ts
toast.promise(spawnCommand(cmd.slug), {
  loading: `Queuing ${displayName}...`,
  success: `${displayName} queued`,
  error: (err: Error) => err.message,
})
```

Note: `displayName` must be available in `handleCommandClick`. Since `handleCommandClick` receives `cmd: CommandInfo`, resolve `displayName` inside the function:
```ts
async function handleCommandClick(cmd: CommandInfo) {
  const displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name
  if (WIZARD_COMMANDS.has(cmd.slug)) {
    onOpenWizard(cmd.slug)
    return
  }
  try {
    toast.promise(spawnCommand(cmd.slug), {
      loading: `Queuing ${displayName}...`,
      success: `${displayName} queued`,
      error: (err: Error) => err.message,
    })
  } catch { /* handled by toast.promise */ }
}
```

### Replace header JSX block with `SectionHeader`:

```tsx
// Replace the if/else h3 + button block with:
<SectionHeader
  label={section.label}
  subtitle={section.subtitle}
  accent={section.accent}
  collapsible={section.collapsible}
  open={othersOpen}
  count={section.commands.length}
  onToggle={() => setOthersOpen(!othersOpen)}
/>
```

---

## Conventions to follow

- All client code uses `getApiBase()` for API calls (not modified in this task).
- No module-level state — `othersOpen` useState remains in the component.
- `cn()` from `lib/utils` for conditional class joins — already imported.
- TypeScript strict mode: use type guards (`.filter((c): c is CommandInfo => ...)`) for array operations.
- Do not export `SectionHeader`.

---

## Verification commands

```bash
# TypeScript check
cd /Users/javi/repos/specrails-manager/client && npx tsc --noEmit

# Full dev build
cd /Users/javi/repos/specrails-manager && npm run dev
```

---

## Compatibility

No contract surface changes. All modifications are internal to a single client component. No API endpoints, command slugs, or WebSocket protocol are changed. No other component imports from `CommandGrid.tsx` besides `DashboardPage.tsx`, which is unaffected (its `onOpenWizard` prop contract is unchanged).
