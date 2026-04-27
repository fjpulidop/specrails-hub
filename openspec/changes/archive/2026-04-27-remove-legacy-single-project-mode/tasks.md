## 1. Pre-flight verification

- [x] 1.1 Grep `scripts/`, `.github/workflows/`, `src-tauri/`, `Tauri.toml`, root `package.json`, and any local launcher scripts for `--legacy` or `SPECRAILS_LEGACY` and confirm zero hits
- [x] 1.2 Capture baseline coverage with `npm test -- --coverage` and record server / global percentages

## 2. Server entry point cleanup

- [x] 2.1 In `server/index.ts`, remove the `isHubMode` flag (line 73) and the `--legacy` / `SPECRAILS_LEGACY` parsing
- [x] 2.2 Remove `resolveProjectName()` (lines 75-88) and the `--project` CLI argument parsing in the args loop (lines 95-101); keep `--port` and `--parent-pid` handling
- [x] 2.3 Remove the `_legacyDb` module-level variable (line 217) and its `close()` call in `shutdown()` (lines 759-761)
- [x] 2.4 Replace `mode: isHubMode ? 'hub' : 'legacy'` in `/api/health` (line 283) with the constant `mode: 'hub'`
- [x] 2.5 Remove the `if (isHubMode)` wrapper while preserving its body verbatim — `ProjectRegistry` setup, `/otlp` mount, telemetry compaction, `/api/hub` mount, `/api/projects` mount, hooks 410 fallback, and the hub WebSocket `connection` handler all stay as-is
- [x] 2.6 Delete the entire `else` branch (single-project mode, lines 368-731) including legacy DB init, top-level `QueueManager` / `ChatManager` / `ProposalManager` instantiation, legacy WS init message, `/hooks` router mount, `/api/spawn`, `/api/state`, `/api/jobs/*`, `/api/queue/*`, `/api/stats`, `/api/analytics`, `/api/config`, `/api/issues`, `/api/chat/*`, and `/api/propose/*` route handlers
- [x] 2.7 Update the startup log message at line 766 to drop the `mode` interpolation; log `specrails web manager running on http://127.0.0.1:${port}`
- [x] 2.8 Remove the legacy-mode comment "Hub mode only: legacy mode has no per-project routing..." above the `/otlp` mount (now meaningless)
- [x] 2.9 Run `npx tsc --noEmit` and resolve any unused-import errors (likely `initDb`, `listJobs`, `getJob`, `getJobEvents`, `getStats`, `purgeJobs`, `createConversation`, `listConversations`, `getConversation`, `deleteConversation`, `updateConversation`, `addMessage`, `getMessages`, `createProposal`, `getProposal`, `listProposals`, `deleteProposal`, `ChatManager`, `ProposalManager`, `getConfig`, `fetchIssues`, `getAnalytics`, `resolveCommand`, `uuidv4`, `createHooksRouter`, `getPhaseStates`, `getPhaseDefinitions`, `ChatConversationRow`, `ClaudeNotFoundError`, `JobNotFoundError`, `JobAlreadyTerminalError`)

## 3. Server tests cleanup

- [x] 3.1 In `server/index.test.ts`, remove the `mode: 'legacy'` expectation case (around line 242) and the `'returns mode=legacy in legacy (single-project) setup'` test (lines 566-573)
- [x] 3.2 Update the `expect(['hub', 'legacy']).toContain(res.body.mode)` assertion (line 563) to `expect(res.body.mode).toBe('hub')`
- [x] 3.3 Remove the `'returns projects=1 in legacy mode'` test (line 573 onwards) or convert it to assert hub project counts against `ProjectRegistry`
- [x] 3.4 Run `npx vitest run server/index.test.ts` and confirm green

## 4. CLI test cleanup

- [x] 4.1 In `cli/specrails-hub.test.ts`, remove the `'prints running status for legacy mode with state'` test (line 257)
- [x] 4.2 Verify the hub-mode status test still passes with `npx vitest run cli/specrails-hub.test.ts`

## 5. Client app shell

- [x] 5.1 In `client/src/App.tsx`, remove the `IS_TAURI` constant and the entire `useHubMode()` hook (lines 47-81)
- [x] 5.2 Remove the `LegacyOsNotifications` component (lines 321-324) and `LegacyKeyboardShortcuts` component (lines 328-332)
- [x] 5.3 Remove the `import { RootLayout } from './components/RootLayout'` line (line 5)
- [x] 5.4 In the default `App` export, replace the `{isHub ? (...) : (...)}` ternary (lines 359-395) with the unconditional hub branch: `<HubProvider><TitleBar/><SpecGenTrackerProvider><SidebarPinProvider><TerminalsProviderWithHub><HubApp/></TerminalsProviderWithHub></SidebarPinProvider></SpecGenTrackerProvider></HubProvider>`
- [x] 5.5 Remove the now-unused `isHub` variable and the `useHubMode()` call from the `App` function body
- [x] 5.6 Drop unused imports surfaced by tsc (likely `Routes`, `Route`, `Navigate`, `Suspense`, `DocsPage`, `JobDetailPage`, `JobsPage`, `AnalyticsPage`, `ActivityFeedPage`, `AgentsPage`, `DashboardPage`, `SettingsPage`, `RootLayout`, `CommandPalette` if they were used only by the legacy branch — verify each import is still referenced before removing)

## 6. Delete dead client files

- [ ] 6.1 Delete `client/src/components/RootLayout.tsx` (BLOCKED: sandbox denies `rm` — user must run manually; file is dead code, no consumers in production)
- [ ] 6.2 Delete `client/src/components/Navbar.tsx` (BLOCKED: same as 6.1)
- [ ] 6.3 Delete `client/src/components/__tests__/RootLayout.test.tsx` (BLOCKED: same as 6.1)
- [ ] 6.4 Delete `client/src/components/__tests__/Navbar.test.tsx` (BLOCKED: same as 6.1)
- [x] 6.5 Verified with grep: no production file imports `RootLayout` or `./components/Navbar` outside the dead component files themselves (App.tsx import already removed)

## 7. Simplify API base helper

- [x] 7.1 In `client/src/lib/api.ts`, remove the module-level `_isHubMode` variable and the `setHubMode()` exported function
- [x] 7.2 Replace `setApiContext(isHub: boolean, projectId: string | null)` with `setActiveProjectId(projectId: string | null)`; keep the function name `setApiContext` only if external callers depend on it — otherwise rename and update callers
- [x] 7.3 Update `getApiBase()` to return `${API_ORIGIN}/api/projects/${_activeProjectId}` when set, and to throw `Error('No active project set — call setApiContext first')` when not
- [x] 7.4 Update `client/src/hooks/useHub.tsx` (or wherever `setApiContext` / `setHubMode` are called) to use the new single-arg setter
- [x] 7.5 Update `client/src/lib/__tests__/api.test.ts` to drop legacy-mode assertions and to cover both the active-project path and the throw-when-unset path
- [x] 7.6 Run `cd client && npx tsc --noEmit` and `npx vitest run client/src/lib/__tests__/api.test.ts`

## 8. Documentation

- [x] 8.1 In `CLAUDE.md`, remove the parenthetical "Use `--legacy` flag for single-project mode." in the "Hub mode (default)" section and any other `--legacy` mentions in the same file
- [ ] 8.2 In `.claude/rules/client.md`, remove the bullet describing `App.tsx` detecting hub mode via `GET /api/hub/state` and the `getApiBase()` legacy-mode return-value reference (BLOCKED: sandbox denies edits to `.claude/` files — user must update manually)
- [x] 8.3 `.claude/rules/server.md` does not contain `--legacy` references (verified) — no edits needed
- [x] 8.4 Search the repo for any remaining `single-project mode`, `legacy mode`, `SPECRAILS_LEGACY`, or `--legacy` references in non-source docs and remove them, leaving alone the unrelated "legacy" tokens in `setup-manager`, `profile-manager`, `profiles-router`, `queue-manager`, and `rails-router`

## 9. Verification

- [x] 9.1 Run `npm run typecheck` from the repo root and confirm zero errors
- [x] 9.2 Run `npm test -- --coverage` from the repo root; verify coverage stays at or above 80% server / 70% global
- [x] 9.3 If coverage gates regress, add hub-side tests for any uncovered branches in `project-router.ts` or manager classes — do not restore legacy code
- [ ] 9.4 Start `npm run dev`, open the client at `http://localhost:4201`, confirm the app shell renders without making any `GET /api/hub/state` request (USER VERIFICATION REQUIRED — automated apply cannot exercise the browser)
- [ ] 9.5 In the running app, exercise: project switching, spawning a job from a project, opening chat, opening the agents page, toggling the terminal panel — all hub-mode features behave identically to before the change (USER VERIFICATION REQUIRED)
- [ ] 9.6 Stop the dev server and confirm no orphaned `node` processes or stale `~/.specrails/manager.pid` remain (USER VERIFICATION REQUIRED)

## 10. Validation

- [x] 10.1 Run `openspec validate remove-legacy-single-project-mode --strict` and resolve any findings
- [x] 10.2 Self-review the diff for stray `legacy` or `isHubMode` tokens and remove them
