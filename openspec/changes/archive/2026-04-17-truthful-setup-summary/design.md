## Context

The setup wizard's completion screen (`CompleteStep` in `client/src/components/SetupWizard.tsx`) renders a three-tile grid — `Agents`, `Personas`, `Spec` — whose values come from `SetupSummary` produced by `computeSummary()` in `server/setup-manager.ts`.

Current state:
- `computeSummary()` returns `{ agents, personas, commands }`, where `commands` is the sum of files under `.claude/commands/sr/` and `.claude/commands/specrails/`, and ignores `.claude/commands/opsx/`.
- `/sr:` is a deprecated slash-command prefix; `/specrails:` is the canonical prefix; `/opsx:` is a separate product that ships alongside specrails via `specrails-core`'s `install.sh`.
- Many commands exist under both `sr/` and `specrails/` (the same feature, two prefixes), so the summed count double-counts migrated commands.
- Personas files are only project-specific after the `full` tier's `/specrails:enrich` phase runs. On `quick` tier the files that exist in `.claude/agents/personas/` are copied boilerplate that was never tailored to the project.
- The tile labelled `Spec` in the UI is wired to `summary.commands`. The copy in the paragraph above the grid says "agents, personas, and commands"; the tile label is a leftover typo.

The screen therefore lies on three axes: wrong label (`Spec`), inflated/incomplete count (`commands` ≠ what the user can actually type), and premature claim (`Personas` before enrich has run).

The install pipeline (`install.sh`, `deployTemplates`, `specrails-core`) is out of scope. The change is confined to what the server reports and what the UI renders, plus a small filesystem sweep for the deprecated `/sr:*` prefix.

## Goals / Non-Goals

**Goals:**
- The completion screen matches what is on disk, under labels the user will actually type.
- `/sr:*` is removed from disk during install and the UI announces the sweep.
- `/specrails:*` and `/opsx:*` are surfaced as the two command namespaces the user should learn.
- Personas tile appears only when personas were actually generated (i.e., full tier post-enrich).
- Zero behavioral changes to `install.sh`, `deployTemplates`, the wizard's step machine, or the install-config YAML format.

**Non-Goals:**
- Changing what `specrails-core` copies onto disk.
- Displaying versions of `specrails-core` / `opsx` (deferred — no reliable source on disk today, not worth the detour).
- Adding a persistent "what was installed" view on the project landing page.
- Cleaning up `sr/` in repositories that are not being set up / reinstalled right now (the sweep only runs through `SetupManager`, not as a standalone migration).
- Refactoring `computeSummary()` into a shared module or moving it to a worker.

## Decisions

### Decision 1: Replace `commands: number` with `specrailsCommands: number` + `opsxCommands: number`

The existing `SetupSummary.commands` field is removed. Two explicit fields take its place: `specrailsCommands` (count of `.md` files under `.claude/commands/specrails/`) and `opsxCommands` (count of `.md` files under `.claude/commands/opsx/`). The `.claude/commands/sr/` directory is **not** counted — it is deleted before `computeSummary()` runs (see Decision 3).

**Why:** The two namespaces are different products and the UI needs to render them under different labels. A single `commands` field cannot carry that information without either a nested object or a pair of numbers; a flat pair is the cheaper option and matches how the UI consumes it.

**Alternatives considered:**
- *Keep `commands` and add `opsxCommands`*: ambiguous (`commands` would still include `specrails/`; readers have to know to subtract). Rejected.
- *Return `commands: { specrails: number; opsx: number }`*: structurally fine but gratuitously nested for two leaves. Rejected for simplicity.
- *Return lists of filenames instead of counts*: nice-to-have (the paragraph could name specific commands), but the UI only renders counts today and the proposal explicitly rescoped away from that. Rejected.

### Decision 2: Add `tier: 'quick' | 'full'` to `SetupSummary`

The server already knows the tier — it is part of the install config YAML and is threaded through every step of `SetupManager`. We add it to the summary payload so the UI can gate the personas tile without a separate lookup.

**Why:** The alternative — the UI remembering the tier from its own wizard state — works but couples two different state machines (install pipeline vs UI step machine) across a WS boundary. If the summary already carries tier, the UI doesn't have to correlate.

**Trade-off:** Tier is already in the client wizard state. Passing it redundantly costs one string field on the WS message; the cost is negligible and it keeps the summary self-describing.

### Decision 3: Delete `.claude/commands/sr/` during install, report the count

After `install.sh` returns successfully and before `computeSummary()` reads the final tree, `SetupManager` deletes `.claude/commands/sr/` if it exists, recording how many `.md` files were removed. The number is surfaced as `legacySrRemoved`. Deletion uses Node's `fs.rmSync(..., { recursive: true, force: true })`.

**Why here, not in `install.sh`:** `install.sh` lives in `specrails-core` and is explicitly out of scope. The hub owns the user's finished-install experience; it's the right place for deprecation housekeeping that the hub, not the upstream installer, is making claims about.

**Why delete rather than hide:** The user said "if `/sr:` is detected, remove it" — deletion is the product decision, not just a display choice. A hidden-but-present `/sr:` directory still pollutes `/-prefix-autocomplete` and creates two ways to do the same thing.

**Risk:** A user could have hand-edited a `/sr:` command they wanted to keep. We judge this low-probability (the prefix is deprecated upstream) and the fix (copy the file to `.claude/commands/specrails/` before reinstalling) is straightforward. Mitigation: log the sweep at `info` level with the list of deleted filenames, so the user can recover from `.claude/` history if needed.

**Alternative considered:** Rename the directory instead of deleting — keeps content recoverable. Rejected: the recovery path via git + logs is already good enough and rename leaves a stale directory on disk that still shows up in autocomplete.

### Decision 4: `CompleteStep` renders four-tile layout, personas-gated

The UI renders up to four tiles, flowing based on tier:

```
Quick tier:              Full tier (post-enrich):
┌─────┬───────┬───────┐  ┌─────┬───────┬───────┬───────┐
│  N  │   N   │   N   │  │  N  │   N   │   N   │   N   │
│Agnt │/specr │/opsx  │  │Agnt │/specr │/opsx  │Prsna  │
└─────┴───────┴───────┘  └─────┴───────┴───────┴───────┘
```

If `legacySrRemoved > 0`, a one-line notice renders below the grid: "Removed N legacy `/sr:*` command(s)". No notice when the count is 0 (clean installs shouldn't show a notice about something that didn't happen).

The paragraph above the grid (currently "Your specialized agents, personas, and commands are ready to use") is rewritten to avoid mentioning personas on quick tier: "Your specialized agents and commands are ready to use." On full tier it keeps the current "agents, personas, and commands" phrasing.

**Why:** Two-tile layouts look under-filled; four-tile full-tier layouts are symmetric; the grid already uses a responsive column count. Hiding rather than greying-out the personas tile matches "don't show numbers for things that aren't there".

### Decision 5: No compatibility shim for the old `commands` field

The `setup.complete` WS message payload carries a nested `summary` object. We overwrite its shape. Both sides of the WS boundary are updated atomically in the same change.

**Why:** There is a single producer (`SetupManager`) and a single consumer (`SetupWizard`). They ship together in the same process. A compatibility field would be dead weight immediately.

## Risks / Trade-offs

- **[Risk] `SetupSummary` shape change breaks cached client state** → The wizard summary is never persisted client-side; it lives only in ephemeral wizard state for the duration of the install. A stale cached build of the client would still receive the new shape, but the fallback default (which is what renders when `summary` is missing or malformed) is updated in the same commit. No persistence risk.
- **[Risk] User has pinned `/sr:` commands in external docs / muscle memory** → Out of scope for this change. The deprecation of `/sr:` is an upstream decision; this change only reflects it. Mitigation: the announcement tile tells the user the sweep happened so they know to switch prefix.
- **[Trade-off] `legacySrRemoved` counts files, not uniquely-meaningful commands** → Fine. The user doesn't need a deduped count; they need confirmation that the sweep ran.
- **[Trade-off] `tier` on the summary duplicates what the wizard state already knows** → Accepted in Decision 2. Summary stays self-describing.

## Migration Plan

- Single deploy. Server and client ship together.
- No database migration — summary is transient.
- No `.claude/` migration beyond the first install run that invokes the new `SetupManager`. Existing projects with populated `.claude/commands/sr/` will have that directory swept the next time they re-run the wizard; projects that never re-run are untouched.
- Rollback: revert the change. `/sr:` directories swept on a future install cannot be restored from this code path, but are recoverable via git history of the target repository.

## Open Questions

None blocking. Two nice-to-haves deferred:

1. Should the sweep be exposed as a standalone CLI command (e.g., `specrails-hub sweep-legacy`) for projects that want to clean up without running a full reinstall? Out of scope.
2. Should `opsxCommands = 0` collapse the tile the way `personas = 0` does on quick tier? Not today — `/opsx:*` is always installed by `install.sh`, so a zero count there would itself be a bug worth surfacing, not hiding.
