---
id: command-grid-sections
title: "CommandGrid: Discovery & Delivery Sections — Tasks"
date: 2026-03-17
---

# Task Breakdown

All tasks are `[client]` and apply exclusively to `client/src/components/CommandGrid.tsx`.
Execute sequentially — each task builds on the previous.

---

## Task 1 [client] — Replace slug Sets with ordered arrays and add HIDDEN_SLUGS

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

Remove the two `const` declarations inside the component body:
```ts
const DISCOVERY_SLUGS = new Set(['product-backlog', 'update-product-driven-backlog'])
const DELIVERY_SLUGS = new Set(['implement', 'batch-implement'])
```

Add the following constants at module scope, directly after `FALLBACK_META`:
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

**Acceptance criteria:**
- `DISCOVERY_SLUGS` and `DELIVERY_SLUGS` no longer exist anywhere in the file.
- `DISCOVERY_ORDER`, `DELIVERY_ORDER`, `DISCOVERY_SET`, `DELIVERY_SET`, `DISPLAY_NAMES`, and `HIDDEN_SLUGS` are all defined at module scope.
- TypeScript compiles without errors.

---

## Task 2 [client] — Add `propose-spec` to `COMMAND_META`

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

Add an entry for `'propose-spec'` to the `COMMAND_META` record. Place it first in the map (before `implement`) for readability:

```ts
'propose-spec': {
  icon: Sparkles,
  color: 'text-dracula-cyan',
  glow: 'hover:glow-cyan hover:border-dracula-cyan/40',
},
```

`Sparkles` is already imported from `lucide-react` (line 9 of the current file). No new imports are needed.

**Acceptance criteria:**
- `COMMAND_META['propose-spec']` is defined with `Sparkles` icon, `text-dracula-cyan` color, and `hover:glow-cyan hover:border-dracula-cyan/40` glow.
- No duplicate `Sparkles` import.
- TypeScript compiles without errors.

---

## Task 3 [client] — Update command derivation to use ordered arrays and hidden filter

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

Replace the three derivation lines inside the component:
```ts
// OLD
const discovery = commands.filter((c) => DISCOVERY_SLUGS.has(c.slug))
const delivery = commands.filter((c) => DELIVERY_SLUGS.has(c.slug))
const others = commands
  .filter((c) => !DISCOVERY_SLUGS.has(c.slug) && !DELIVERY_SLUGS.has(c.slug))
  .sort((a, b) => a.name.localeCompare(b.name))
```

With:
```ts
// NEW
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

**Acceptance criteria:**
- `propose-feature` never appears in any section.
- Discovery commands are returned in the exact order: `propose-spec`, `update-product-driven-backlog`, `product-backlog` (only for slugs present in the server response).
- Delivery commands are returned in the exact order: `implement`, `batch-implement`.
- Others section contains no Discovery or Delivery slugs and no hidden slugs.
- TypeScript compiles without errors.

---

## Task 4 [client] — Apply `DISPLAY_NAMES` override in card render and toast

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

Inside the `.map((cmd) => { ... })` render block, resolve the display name before the JSX:

```ts
const displayName = DISPLAY_NAMES[cmd.slug] ?? cmd.name
```

Replace all uses of `cmd.name` in the card JSX with `displayName`:
- The card label: `<p className="text-sm font-medium leading-tight truncate">{displayName}</p>`
- The toast calls inside `handleCommandClick`:
  ```ts
  toast.promise(spawnCommand(cmd.slug), {
    loading: `Queuing ${displayName}...`,
    success: `${displayName} queued`,
    error: (err: Error) => err.message,
  })
  ```

Do NOT replace `cmd.slug` in the tooltip: `/sr:{cmd.slug}` must remain unchanged.

**Acceptance criteria:**
- `update-product-driven-backlog` card label reads "Auto-propose Specs".
- `product-backlog` card label reads "Auto-Select Specs".
- Toast messages use the overridden display name.
- Tooltip still shows `/sr:update-product-driven-backlog` and `/sr:product-backlog`.
- TypeScript compiles without errors.

---

## Task 5 [client] — Create `SectionHeader` sub-component

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

Add a `SectionHeader` function component inside the file, between the module-level constants and the `CommandGridProps` interface. It is not exported.

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
    accent === 'cyan' ? 'text-dracula-cyan'
    : accent === 'purple' ? 'text-dracula-purple'
    : 'text-muted-foreground'
  const labelColor =
    accent === 'cyan' ? 'text-dracula-cyan'
    : accent === 'purple' ? 'text-dracula-purple'
    : 'text-muted-foreground'
  const ruleColor =
    accent === 'cyan' ? 'border-dracula-cyan/25'
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
        <p className={cn('text-[11px] text-muted-foreground/70 mb-2 pl-3.5')}>{subtitle}</p>
      )}
      {ruleColor && <hr className={cn('border-t mb-3', ruleColor)} />}
    </div>
  )
}
```

**Acceptance criteria:**
- `SectionHeader` is defined and TypeScript-valid.
- It is not exported.
- It renders the collapsible Others button when `collapsible={true}`.
- It renders the accent dot + label + subtitle + rule for Discovery and Delivery.
- TypeScript compiles without errors.

---

## Task 6 [client] — Update `sections` descriptor and replace headers in JSX

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

**Step A:** Extend the `sections` array type and entries:

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

**Step B:** In the JSX render loop, replace the existing header block:

```tsx
// REMOVE this block:
{section.collapsible ? (
  <button ... >
    <ChevronRight ... />
    {section.label} ({section.commands.length})
  </button>
) : (
  <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
    {section.label}
  </h3>
)}
```

With:

```tsx
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

**Acceptance criteria:**
- Discovery renders with `●`, cyan label, subtitle "Explore & define your product", and a cyan rule.
- Delivery renders with `●`, purple label, subtitle "Build & ship features", and a purple rule.
- Others collapses and expands correctly as before.
- The old `<h3>` and the old Others `<button>` are removed from the JSX.
- TypeScript compiles without errors.

---

## Task 7 [client] — Verify and clean up imports

**File:** `client/src/components/CommandGrid.tsx`

**What to do:**

After all prior tasks are complete, verify the lucide-react import list. The current imports include icons that may no longer be directly referenced in the component JSX (they are still referenced via `COMMAND_META`). Confirm `Sparkles` is imported (it is already present at line 9).

Also verify no unused imports were introduced. Run:
```bash
cd /Users/javi/repos/specrails-manager/client && npx tsc --noEmit
```

Fix any TypeScript errors that surface (likely none if the prior tasks were executed correctly).

**Acceptance criteria:**
- `npx tsc --noEmit` exits with code 0.
- No unused import warnings that would fail CI.
- The file compiles and renders in the browser without console errors.
