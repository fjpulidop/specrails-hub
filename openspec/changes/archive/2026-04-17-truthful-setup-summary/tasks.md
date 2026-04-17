## 1. Server: SetupSummary shape

- [x] 1.1 Replace `SetupSummary` interface in `server/setup-manager.ts` with `{ agents: number; specrailsCommands: number; opsxCommands: number; personas: number; legacySrRemoved: number; tier: 'quick' | 'full' }`
- [x] 1.2 Rewrite `computeSummary(projectPath)` to count `.claude/commands/specrails/*.md` → `specrailsCommands`, `.claude/commands/opsx/*.md` → `opsxCommands`, and drop the combined `commands` field
- [x] 1.3 Thread the active install tier into the summary so `computeSummary` (or its call site) populates `tier` from the install config; do not infer tier from disk state
- [x] 1.4 Export an `EMPTY_SUMMARY` (or equivalent) constant with all numeric fields at `0` and `tier: 'quick'` for use as a defensive default on malformed payloads

## 2. Server: /sr: legacy sweep

- [x] 2.1 Add a helper `sweepLegacySrCommands(projectPath): number` in `server/setup-manager.ts` that counts `.md` files in `.claude/commands/sr/`, deletes the directory recursively with `fs.rmSync(..., { recursive: true, force: true })`, and returns the pre-deletion count
- [x] 2.2 Wrap the sweep in try/catch: on failure, log at `info` level with the caught error and return `0`, so a permission issue never aborts the install
- [x] 2.3 Call `sweepLegacySrCommands` after `install.sh` returns successfully and before `computeSummary` runs at every existing summary emission site in `SetupManager` (both the install-only and install+enrich paths)
- [x] 2.4 Pass the sweep's return value into the summary payload as `legacySrRemoved`
- [x] 2.5 Ensure the sweep runs exactly once per install run — do not call it from `computeSummary` itself (keeps `computeSummary` side-effect-free)

## 3. Server: tests

- [x] 3.1 Update `server/setup-manager.test.ts` fixtures to the new summary shape everywhere they previously asserted on `summary.commands`
- [x] 3.2 Add a unit test: `computeSummary` on a tree with only `.claude/commands/specrails/*.md` returns `specrailsCommands > 0` and `opsxCommands === 0`
- [x] 3.3 Add a unit test: `computeSummary` on a tree with both namespaces returns both counts, with `commands` field absent
- [x] 3.4 Add a unit test: `sweepLegacySrCommands` on a tree with `sr/a.md` and `sr/b.md` returns `2` and removes the directory
- [x] 3.5 Add a unit test: `sweepLegacySrCommands` with no `sr/` directory returns `0` and does not throw
- [x] 3.6 Add a unit test: `sweepLegacySrCommands` with a permission error returns `0` and does not throw (mock `fs.rmSync` to throw)

## 4. Client: SetupSummary type

- [x] 4.1 Update the `SetupSummary` type in `client/src/components/SetupWizard.tsx` to mirror the server shape from task 1.1
- [x] 4.2 Update every `setWizardStep({ step: 'complete', summary: data.summary ?? { ... } })` fallback literal in `SetupWizard.tsx` (lines 608, 619, 650 in current state) to the new shape with `tier: 'quick'`

## 5. Client: CompleteStep rendering

- [x] 5.1 Remove the mislabeled `Spec` tile from `CompleteStep` (currently lines 382–385)
- [x] 5.2 Replace the single commands tile with two tiles: `/specrails:*` bound to `summary.specrailsCommands` and `/opsx:*` bound to `summary.opsxCommands`
- [x] 5.3 Gate the `Personas` tile on `summary.tier === 'full' && summary.personas > 0`
- [x] 5.4 Adjust the grid's Tailwind classes so the tile count is correct for both quick (3 tiles) and full (3 or 4 tiles) cases
- [x] 5.5 Change the intro paragraph (currently "Your specialized agents, personas, and commands are ready to use") so that on quick tier it reads "Your specialized agents and commands are ready to use." and on full tier it keeps the original phrasing
- [x] 5.6 Below the grid, render a single-line notice "Removed N legacy `/sr:*` command(s)" when `summary.legacySrRemoved > 0`; render nothing when the count is `0`
- [x] 5.7 Style the legacy notice consistently with existing muted-foreground text (match the docs link styling below it)

## 6. Client: tests

- [x] 6.1 Update `client/src/components/__tests__/SetupWizard.test.tsx` fixtures to use the new `SetupSummary` shape
- [x] 6.2 Add a test: `CompleteStep` with `tier: 'quick'` renders three tiles and does not render a `Personas` tile
- [x] 6.3 Add a test: `CompleteStep` with `tier: 'full'` and `personas: 3` renders four tiles including `Personas`
- [x] 6.4 Add a test: `CompleteStep` with `tier: 'full'` and `personas: 0` renders three tiles and no `Personas` tile
- [x] 6.5 Add a test: `CompleteStep` with `legacySrRemoved: 2` renders the legacy-cleanup notice with the count `2`
- [x] 6.6 Add a test: `CompleteStep` with `legacySrRemoved: 0` does not render a legacy-cleanup notice
- [x] 6.7 Add a test: `CompleteStep` never renders a tile labelled `Spec`

## 7. Verification

- [x] 7.1 Run `npm run typecheck` from repo root — no TypeScript errors on server or client (verified 2026-04-18)
- [x] 7.2 Run `npm test` — all vitest suites pass including the new cases (1119/1119 passed, up from 1114; the 2 pre-existing failures in cli/specrails-hub.test.ts are unrelated to this change and were failing before)
- [x] 7.3 Manual smoke: `npm run dev`, complete a quick install against a test project, confirm completion screen matches the quick-tier spec scenarios — verified locally by user 2026-04-17
- [x] 7.4 Manual smoke: pre-seed `.claude/commands/sr/` with two throwaway files in a test project, re-run setup, confirm they are removed and the legacy notice renders with count `2` — verified locally by user 2026-04-17
