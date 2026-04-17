---
agent: developer
feature: truthful-setup-summary
tags: [setup-wizard, setup-manager, websocket, summary, legacy-cleanup]
date: 2026-04-18
---

# truthful-setup-summary

Fixed the post-install completion screen so it truthfully reports what specrails-core installed.

## Changes made

### server/setup-manager.ts
- Replaced `SetupSummary` interface: removed `commands: number`, added `specrailsCommands`, `opsxCommands`, `legacySrRemoved`, `tier`
- Added `EMPTY_SUMMARY` export constant (all zeros, tier: 'quick')
- Rewrote `computeSummary(projectPath, tier)` — now takes tier as parameter, counts specrails/ and opsx/ separately, ignores sr/
- Added `sweepLegacySrCommands(projectPath): number` — deletes .claude/commands/sr/ before summary, returns file count. Wrapped in try/catch; logs at info level on failure.
- Updated three `computeSummary` call sites: startQuickInstall, startInstall, _spawnSetup (enrich) — each runs sweep then merges legacySrRemoved
- Both functions exported for direct testing

### server/types.ts
- Added `SetupSummaryPayload` interface matching the new shape
- Updated `SetupInstallDoneMessage` and `SetupCompleteMessage` to use it

### client/src/components/SetupWizard.tsx
- Updated `SetupSummary` interface to match server shape
- Added `EMPTY_SUMMARY` constant as defensive default for malformed WS messages
- Replaced three `{ agents: 0, personas: 0, commands: 0 }` fallbacks with `{ ...EMPTY_SUMMARY }`
- Rewrote `CompleteStep`: 3 or 4 tiles based on tier/personas, no more "Spec" label, tier-conditional paragraph, legacy cleanup notice

### server/setup-manager.test.ts + client/src/components/__tests__/SetupWizard.test.tsx
- Updated all existing fixtures to new shape
- Added new unit tests for computeSummary, sweepLegacySrCommands, and CompleteStep rendering scenarios

## Surprising findings
- `server/types.ts` had inline summary type definitions for `SetupInstallDoneMessage` and `SetupCompleteMessage` that were separate from `SetupSummary` in setup-manager.ts — these needed to be updated too (the TypeScript errors revealed this). Created `SetupSummaryPayload` as a shared type.
- The pre-existing test failures in `cli/specrails-hub.test.ts` (port-busy and stop-subcommand tests) were present before and after this change — not introduced by this work.
