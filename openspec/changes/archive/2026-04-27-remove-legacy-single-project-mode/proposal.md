## Why

The server and client carry a parallel "legacy" single-project execution mode (activated via `--legacy` / `SPECRAILS_LEGACY=1`) that predates hub mode. Hub mode has been the default for a long time, the desktop sidecar always runs hub, and the user no longer relies on legacy mode in any project. The dual-mode branching (~750 LOC across server, client, and tests) duplicates routing surface, slows web startup with an unnecessary `/api/hub/state` probe, and creates ongoing divergence risk between `/api/jobs` (legacy) and `/api/projects/:id/jobs` (hub).

## What Changes

- **BREAKING** Remove `--legacy` CLI flag and `SPECRAILS_LEGACY=1` environment variable from the server entry point. Hub is the only mode.
- **BREAKING** Remove the entire single-project branch in `server/index.ts` (~365 LOC): legacy DB initialisation in `cwd/data/jobs.sqlite`, top-level `QueueManager`/`ChatManager`/`ProposalManager` instances, legacy WebSocket `init` message, `/hooks` mount, and the inline `/api/spawn`, `/api/state`, `/api/jobs/*`, `/api/queue/*`, `/api/config`, `/api/issues`, `/api/chat/*`, `/api/propose/*` route handlers.
- Remove `_legacyDb`, `resolveProjectName`, and the `--project` CLI argument (only meaningful for legacy mode).
- `GET /api/health` always returns `mode: "hub"`. Field kept for CLI status backward compatibility.
- Remove client-side hub-mode detection (`useHubMode`, the `/api/hub/state` probe). `App.tsx` mounts `HubProvider` directly, eliminating one network round-trip on web startup. Tauri behaviour unchanged.
- Remove `RootLayout.tsx`, `Navbar.tsx`, `LegacyOsNotifications`, `LegacyKeyboardShortcuts`, and the legacy branch in `App.tsx`.
- Simplify `lib/api.ts`: `getApiBase()` always returns `/api/projects/<id>`. Drop the `_isHubMode` flag and `setHubMode` helper.
- Remove legacy-specific tests (`RootLayout.test.tsx`, `Navbar.test.tsx`, legacy cases in `server/index.test.ts` and `cli/specrails-hub.test.ts`).
- Update `CLAUDE.md`, `client.md`, and any user-facing docs to drop references to legacy / single-project mode.

## Capabilities

### New Capabilities
- `hub-only-server-mode`: Establishes hub mode as the sole execution mode for the server and client. Documents the removal of the `--legacy` flag, the always-on `ProjectRegistry`-backed routing surface, and the simplified client bootstrap that no longer probes `/api/hub/state`.

### Modified Capabilities
<!-- None — legacy single-project mode never had its own spec, so this is purely an additive capability that codifies hub-only behaviour. -->

## Impact

**Code:**
- `server/index.ts` — drop ~365 LOC `else` branch, mode flag, helpers, `_legacyDb` lifecycle
- `server/index.test.ts` — remove ~5 legacy-mode test cases
- `client/src/App.tsx` — drop `useHubMode`, `IS_TAURI` fallback, legacy render branch, `Legacy*` wrappers
- `client/src/components/RootLayout.tsx` — delete
- `client/src/components/Navbar.tsx` — delete (only used by RootLayout)
- `client/src/components/__tests__/RootLayout.test.tsx` — delete
- `client/src/components/__tests__/Navbar.test.tsx` — delete
- `client/src/lib/api.ts` — simplify `getApiBase`, drop `_isHubMode` / `setHubMode`
- `cli/specrails-hub.test.ts` — remove legacy-mode status case

**APIs:**
- Removed (in legacy mode only — never reachable in hub): `POST /hooks/events` (root), `POST /api/spawn`, `GET /api/state`, `GET /api/jobs`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id`, `DELETE /api/jobs`, `GET /api/queue`, `POST /api/queue/pause`, `POST /api/queue/resume`, `PUT /api/queue/reorder`, `GET /api/stats`, `GET /api/analytics`, `GET /api/config`, `POST /api/config`, `GET /api/issues`, `GET|POST|DELETE|PATCH /api/chat/*`, `GET|POST|DELETE /api/propose/*`. Hub equivalents under `/api/projects/:projectId/*` are unchanged.
- `GET /api/health` keeps its shape; `mode` field becomes constant `"hub"`.
- `GET /api/hub/state` no longer needed by the web client for mode detection but is retained for the hub-state contract.

**Dependencies:** None.

**User-visible:** None for hub users (the only supported flow). Anyone passing `--legacy` or `SPECRAILS_LEGACY=1` will see the flag silently ignored and the server start in hub mode using `~/.specrails/hub.sqlite` instead of `cwd/data/jobs.sqlite`.

**Coverage gates:** CI enforces 80% server / 70% global coverage. Removing legacy code removes both numerator and denominator; verify `npm test -- --coverage` stays above thresholds before merging.
