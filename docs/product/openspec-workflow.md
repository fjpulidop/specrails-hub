# OpenSpec Workflow

OpenSpec is the structured change management system built into specrails. Every feature, fix, or refactor goes through a lifecycle of **artifacts** — from problem definition to archived implementation — so that AI agents always have the full context they need.

---

## What is a Change?

A **Change** is the unit of work in OpenSpec. It bundles together:

- A description of what needs to be done
- A set of **artifacts** (specs, task lists, implementation notes)
- Status tracking from start to archive

Changes live in your project directory under `.specrails/changes/`. The specrails-hub dashboard shows all changes for a project under the **Changes** route.

---

## The Change lifecycle

```
opsx:new
   │
   ▼
opsx:ff  (or opsx:continue step by step)
   │   Creates all artifacts:
   │     • problem-statement
   │     • spec
   │     • tasks
   │     • implementation-notes
   │
   ▼
opsx:apply
   │   Hub runs the Developer phase:
   │     Architect → Developer → Reviewer
   │
   ▼
opsx:verify
   │   Reviewer checks implementation vs artifacts
   │
   ▼
opsx:archive
      Change moved to .specrails/changes/archived/
```

---

## Commands reference

### `opsx:new` — Start a new Change

Interactively creates a new change. You provide a title and description; the agent creates the initial artifact structure.

```bash
specrails-hub /opsx:new
```

Or from the dashboard: click **New Change** in the project view.

---

### `opsx:ff` — Fast-forward artifact creation

Generates all artifacts in one go (skips the step-by-step flow). Best for well-defined tasks where you want to go straight to implementation.

```bash
specrails-hub /opsx:ff
```

Artifacts created:
1. **problem-statement.md** — what and why
2. **spec.md** — technical specification
3. **tasks.md** — numbered list of implementation tasks
4. **implementation-notes.md** — guidance for the developer agent

---

### `opsx:apply` — Implement the Change

Runs the implementation pipeline using the artifacts as context. The hub queues an Architect → Developer → Reviewer job and streams the output to the dashboard.

```bash
specrails-hub /opsx:apply
```

Monitor progress in the Dashboard tab. Each phase shows in real-time.

---

### `opsx:continue` — Step through artifact creation

Creates the next artifact in sequence, one at a time. Use when you want to review and adjust each artifact before proceeding.

```bash
specrails-hub /opsx:continue
```

Run it repeatedly until all artifacts exist, then proceed with `opsx:apply`.

---

### `opsx:verify` — Verify the implementation

Runs the Reviewer agent against the change artifacts. Checks that:
- All tasks in `tasks.md` are implemented
- The implementation matches `spec.md`
- No regressions were introduced

```bash
specrails-hub /opsx:verify
```

If verification fails, the Reviewer outputs a list of issues. Resolve them (either manually or by re-running `opsx:apply`), then verify again.

---

### `opsx:sync` — Sync delta specs to main specs

When a change modifies existing specs, `opsx:sync` propagates those changes to the main spec files without archiving the change.

```bash
specrails-hub /opsx:sync
```

---

### `opsx:archive` — Archive a completed Change

Moves the change to `.specrails/changes/archived/` and marks it as complete. Run this after `opsx:verify` passes.

```bash
specrails-hub /opsx:archive
```

---

## Use cases

### Feature implementation

```bash
# 1. Define the change
specrails-hub /opsx:new

# 2. Generate all artifacts at once
specrails-hub /opsx:ff

# 3. Implement
specrails-hub /opsx:apply

# 4. Verify and archive
specrails-hub /opsx:verify
specrails-hub /opsx:archive
```

### Bug fix

For a well-understood bug, go straight to fast-forward:

```bash
specrails-hub /opsx:ff
# Review the generated spec.md to make sure it describes the fix correctly
specrails-hub /opsx:apply
specrails-hub /opsx:verify
specrails-hub /opsx:archive
```

### Refactor with careful artifact review

Use `opsx:continue` to review each artifact before the next is created:

```bash
specrails-hub /opsx:new
specrails-hub /opsx:continue   # creates problem-statement.md — review it
specrails-hub /opsx:continue   # creates spec.md — review it
specrails-hub /opsx:continue   # creates tasks.md — review it
specrails-hub /opsx:continue   # creates implementation-notes.md
specrails-hub /opsx:apply
specrails-hub /opsx:verify
specrails-hub /opsx:archive
```

---

## Viewing change history

All changes — active and archived — are visible in the dashboard under the **Changes** tab of your project. Each entry shows:

- Title and description
- Current status (active, in review, archived)
- Creation date and last updated
- Links to each artifact

---

## Further reading

- [Workflows](workflows.md) — practical step-by-step guides
- [Features](features.md) — full dashboard feature reference
