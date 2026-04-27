## Context

Hub mode and legacy single-project mode currently coexist in `server/index.ts` as mutually exclusive branches gated by `isHubMode = !process.argv.includes('--legacy') && process.env.SPECRAILS_LEGACY !== '1'`. Hub mode delegates to `ProjectRegistry`, `hub-router`, and `project-router`; legacy mode wires its own `QueueManager`, `ChatManager`, `ProposalManager`, `db`, and inline route handlers against `cwd/data/jobs.sqlite`. The same divide exists in the React client: `App.tsx` probes `GET /api/hub/state` to decide between `<HubProvider><HubApp/></HubProvider>` and a legacy `<RootLayout/>` with its own `Navbar`, `LegacyOsNotifications`, and `LegacyKeyboardShortcuts` wrappers. `lib/api.ts` keeps a module-level `_isHubMode` flag so `getApiBase()` can return `/api` (legacy) or `/api/projects/<id>` (hub).

The Tauri desktop sidecar always launches in hub mode, the user no longer uses legacy in any project, and the dual surface duplicates roughly 750 LOC across server, client, and tests. Removing it has no functional impact on the supported flow.

## Goals / Non-Goals

**Goals:**
- Hub mode is the only execution mode for both server and client.
- Net deletion of dead code paths without altering hub behaviour.
- Faster web-client bootstrap by removing the synchronous `/api/hub/state` probe.
- Coverage gates (80% server / 70% global) remain green.
- CLI status output continues to work against the simplified `/api/health` payload.

**Non-Goals:**
- Refactoring or unifying hub-mode internals (`ProjectRegistry`, routers, managers stay as-is).
- Touching the `legacy` markers in `setup-manager.ts`, `profile-manager.ts`, `profiles-router.ts`, `queue-manager.ts`, or `rails-router.ts` — those refer to legacy specrails-core installations or legacy profile fallback, not single-project server mode.
- Removing or changing `ProposalManager`; it is shared with hub mode via `project-router.ts`.
- Renaming the `mode` field in `/api/health` (kept as constant `"hub"` for CLI compatibility).
- Changes to the `GET /api/hub/state` endpoint contract — it stays for hub-state delivery.

## Decisions

### Decision: Delete the legacy branch wholesale instead of feature-flagging it

Legacy mode is unreachable for the user and the desktop sidecar. A flag would only defer the cleanup. Wholesale deletion gives the LOC win and removes the divergence risk between `/api/jobs` and `/api/projects/:id/jobs`. Alternatives considered: (a) keep behind `SPECRAILS_LEGACY=1` for a deprecation cycle — rejected, no consumers; (b) extract legacy mode into a separate package — rejected, no demand and would multiply maintenance.

### Decision: Keep `mode` field in `/api/health` as a constant

`cli/specrails-hub.ts` reads `health.mode` to render status. Removing the field is a breaking CLI change for cached binaries; keeping it constant is free. Alternative: drop the field and update CLI in the same change — rejected, increases blast radius without benefit.

### Decision: Remove client-side `useHubMode()` and `IS_TAURI` fallback

With hub being the only mode, the `/api/hub/state` probe in `App.tsx` (lines 52–81) is dead detection. Deleting it removes one network round-trip on web startup and simplifies the boot sequence to `<HubProvider><HubApp/></HubProvider>` unconditionally. The `IS_TAURI` constant becomes unused and is removed as well.

### Decision: Simplify `getApiBase()` to require an active project ID

After removal, `getApiBase()` always returns `/api/projects/<activeProjectId>`. When no project is active, callers must not invoke API methods (current code already gates on `activeProject` being non-null in render paths). The `_isHubMode` module-level flag, `setHubMode()`, and the `setApiContext(isHub, projectId)` two-arg shape collapse to a single setter `setActiveProjectId(projectId: string | null)`. Throwing from `getApiBase()` when no project is set surfaces accidental calls at runtime; alternative of returning `/api` was rejected because that path no longer exists server-side and would hide bugs.

### Decision: Delete `RootLayout.tsx` and `Navbar.tsx`

`RootLayout.tsx` is imported only by the legacy branch in `App.tsx`. `Navbar.tsx` is imported only by `RootLayout.tsx` (verified via grep). `ProjectLayout.tsx` uses `ProjectNavbar` instead. Both files plus their `__tests__/RootLayout.test.tsx` and `__tests__/Navbar.test.tsx` get deleted. `usePipeline`, `useChat`, `ChatPanel`, and `StatusBar` are retained — they are still used by `ProjectLayout`.

### Decision: Remove `--project` CLI argument and `resolveProjectName()`

These only matter for legacy mode (to pick a single project name from cwd). Hub uses `ProjectRegistry` slugs derived from registered project paths. `--port` and `--parent-pid` are retained.

## Risks / Trade-offs

- **Coverage drop** → Run `npm test -- --coverage` before merging. Hub-mode tests should already cover equivalent routes via `project-router.test.ts` / `hub-router.test.ts`. If coverage falls below thresholds, add hub-side tests for any uncovered manager methods rather than restoring legacy tests.
- **CLI bridge regression** → `cli/specrails-hub.ts` parses `/api/health.mode`. Verified it accepts `'hub'`. The legacy-status test case in `cli/specrails-hub.test.ts` (line 257) is removed; hub status case is retained.
- **Hidden consumer of `--legacy` or `SPECRAILS_LEGACY=1`** → Grep `scripts/`, `.github/workflows/`, `src-tauri/`, `Tauri.toml`, and `package.json` before merging. None expected.
- **Web users with bookmarked legacy URLs** (e.g., `http://localhost:4200/jobs/<id>` rendered by RootLayout) → After change, those URLs route through hub `<HubApp/>` which already serves `/jobs/:id` via `ProjectLayout`. No bookmarks break.
- **`getApiBase()` throwing on no active project** → Render paths gate on `activeProject` already; if a stray call slips through, the throw surfaces it immediately in dev. Acceptable trade-off for catching bugs.

## Migration Plan

1. Land server-side changes first: delete legacy branch, helpers, and tests; ensure `npm test` passes.
2. Land client-side changes: delete `useHubMode`, legacy render branch, `RootLayout`, `Navbar`, simplify `getApiBase`. Update `client/src/App.tsx` so `<HubProvider>` mounts unconditionally.
3. Update `CLAUDE.md` (root + `client/CLAUDE.md` if applicable) and `.claude/rules/client.md` to drop legacy-mode references.
4. Run `npm run typecheck && npm test -- --coverage` and confirm gates.
5. No data migration required (`~/.specrails/hub.sqlite` and per-project DBs already exist for hub users; legacy `cwd/data/jobs.sqlite` is left untouched on disk).

**Rollback:** Revert the merge commit. No persistent state changes.

## Open Questions

- Should `setApiContext` keep the two-arg shape (`isHub`, `projectId`) for any external test that imports it, or collapse to a single setter? Grep shows internal usage only — collapse is safe. Will collapse during implementation.
