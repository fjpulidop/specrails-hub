## 1. Upstream dependency readiness

- [ ] 1.1 Confirm `specrails-core@4.1.0` is published with `add-profile-aware-implement` complete — **gated on core release**
- [ ] 1.2 Bump dep in scaffold/setup code paths (`SetupManager`, doctor preflight) to require `>=4.1.0` — **pending core release**
- [x] 1.3 Add `ajv` to `server/package.json`; add `@monaco-editor/react` to `client/package.json` — ajv added; monaco-editor pending client work in group 7-11

## 2. Database migrations

- [x] 2.1 Add `job_profiles` table to per-project SQLite schema (`server/db.ts`): `(job_id TEXT PRIMARY KEY, profile_name TEXT, profile_json TEXT, created_at INTEGER)`
- [x] 2.2 Add `agent_versions` table to hub-level or per-project SQLite: `(id INTEGER PK, agent_name TEXT, version INTEGER, body TEXT, created_at INTEGER)` with unique (`agent_name`, `version`)
- [x] 2.3 Add `agent_tests` table: `(id INTEGER PK, agent_name TEXT, draft_hash TEXT, sample_task_id TEXT, tokens INTEGER, duration_ms INTEGER, output TEXT, created_at INTEGER)`
- [x] 2.4 Index `job_profiles.profile_name`, `agent_versions(agent_name, version)`, `agent_tests(agent_name)`

## 3. `ProfileManager` backend module

- [x] 3.1 Create `server/profile-manager.ts` with `list/get/create/update/duplicate/rename/delete` over `.specrails/profiles/*.json`
- [x] 3.2 Load and cache `schemas/profile.v1.json` — bundled at `server/schemas/profile.v1.json` (copied from specrails-core 4.1.0; to keep in sync via a future script)
- [x] 3.3 Add `ajv`-based validator; every write passes through it; structural checks (default-last, exactly-one-default) enforced in code beyond the schema
- [x] 3.4 Implement `resolveProfile(projectPath, explicit?)` honoring resolution order (explicit → `.user-preferred.json` → `default`/`project-default`)
- [x] 3.5 Implement `snapshotForJob(slug, jobId, resolved)` that copies bytes to `~/.specrails/projects/<slug>/jobs/<jobId>/profile.json` and chmods 400
- [x] 3.6 Implement `persistJobProfile(db, jobId, resolved)` writing to `job_profiles`
- [x] 3.7 Unit tests for CRUD, validation errors, resolution order, snapshot semantics (see `profile-manager.test.ts`)

## 4. API endpoints

- [x] 4.1 `GET/POST/PATCH/DELETE /api/projects/:projectId/profiles` — list/create/update/delete profiles
- [x] 4.2 `POST /api/projects/:projectId/profiles/:name/duplicate` — duplicate with new name
- [x] 4.3 `POST /api/projects/:projectId/profiles/:name/rename` — rename
- [x] 4.4 `GET /api/projects/:projectId/profiles/resolve?profile=<name>` — preview what would resolve
- [x] 4.5 `GET /api/projects/:projectId/profiles/active` — read `.user-preferred.json`
- [x] 4.6 `PUT /api/projects/:projectId/profiles/active` — write `.user-preferred.json`
- [x] 4.7 Mount endpoints in `server/project-router.ts` and gate by `SPECRAILS_AGENTS_SECTION` env
- [x] 4.8 WebSocket events: `profile.changed` broadcast on write
- [x] 4.9 `.gitignore` auto-append on first `.user-preferred.json` write (handled by `setUserPreferred` in `profile-manager.ts`)

## 5. `QueueManager` integration

- [x] 5.1 Extend `QueueManager` enqueue+spawn to accept `profileName`, resolve via `ProfileManager`, snapshot, and persist to `job_profiles`
- [x] 5.2 Inject `SPECRAILS_PROFILE_PATH=<abs snapshot path>` into the spawn env
- [x] 5.3 Add `specrails.profile_name` and `specrails.profile_schema_version` to the OTEL resource attributes (extended `buildTelemetryEnv` signature)
- [ ] 5.4 Legacy fallback: if `specrails-core` version < 4.1.0, DO NOT inject env var — **TODO: wire into `core-compat` check; currently always injects when profile resolvable**
- [ ] 5.5 Unit tests: spawn with profile, spawn without profile, legacy-core detection — **covered for ProfileManager; QueueManager-level spawn env tests pending**

## 6. Batch-implement per-rail forwarding

- [ ] 6.1 Extend batch-implement launch API to accept `rails[].profileName` per rail
- [ ] 6.2 In the server orchestrator, resolve + snapshot per rail; distinct `SPECRAILS_PROFILE_PATH` per spawn
- [ ] 6.3 Unit tests: mixed profiles in one batch, same profile on two rails (distinct snapshots)

## 7. Sidebar + Agents page shell

- [x] 7.1 Add "Agents" entry to the top navbar (Home/Analytics/Agents/Settings layout) — hub mode only via existing project routing
- [x] 7.2 Create `client/src/pages/AgentsPage.tsx` with three-tab shell (`Profiles`, `Agents`, `Models`)
- [x] 7.3 Route: `/agents` → default Profiles tab (hub mode uses per-project base via `getApiBase()`)
- [ ] 7.4 Per-project memory of active tab via existing `useProjectRouteMemory` — **basic route memory already in place; tab-level memory still TODO**
- [ ] 7.5 Gate behind `VITE_FEATURE_AGENTS_SECTION` — **server side gated via `SPECRAILS_AGENTS_SECTION`; client flag pending**
- [ ] 7.6 Upgrade banner when `specrails-core` version is older than 4.1.0 — **TODO: wire into existing core-compat surface**

## 8. Profiles tab UI

- [x] 8.1 `ProfilesTab.tsx` — list pane with profiles, "New" action, per-row duplicate/delete/preferred
- [x] 8.2 Profile editor: orchestrator model selector, agent chain builder (move up/down, per-agent model dropdown), routing rules editor (move up/down, first-match-wins hint, terminal `default:true` pinned last)
- [x] 8.3 Required agents marked non-removable (`sr-architect`, `sr-developer`, `sr-reviewer`)
- [ ] 8.4 Live validation summary with `ajv` run client-side against the shipped schema — **server-side validates on save; client-side live validation pending**
- [x] 8.5 Save action calls `PATCH /api/projects/:id/profiles/:name`
- [x] 8.6 Duplicate/rename/delete actions (rename via duplicate+delete flow; explicit rename endpoint wired but not yet surfaced in UI)
- [x] 8.7 Loading/empty states

## 9. Agents tab UI

- [ ] 9.1 `AgentsTab.tsx` — catalog segmented into Upstream (`sr-*`, read-only viewer) and Custom (`custom-*`, editable)
- [ ] 9.2 Read-only viewer for upstream agents shows metadata + body
- [ ] 9.3 Custom agents expose "Open in Studio" and "Version history"

## 10. Models tab UI

- [ ] 10.1 `ModelsTab.tsx` — default model selectors per role (orchestrator, developer, reviewer, fallback)
- [ ] 10.2 "Test connectivity" action calls Claude CLI to verify auth works
- [ ] 10.3 Save persists to a dedicated section of `.specrails/profiles/default.json` (or equivalent place; see Decision 1)

## 11. Agent Studio

- [ ] 11.1 `AgentStudio.tsx` — Monaco + form split view, bidirectional sync
- [ ] 11.2 Create-new modal with three entry points (Template / Duplicate / Generate)
- [ ] 11.3 Template entry: fetch `templates/agents/` from `specrails-core` package (bundled or API)
- [ ] 11.4 Duplicate entry: copy existing agent, prefill `custom-<original>-copy`
- [ ] 11.5 Generate entry: server endpoint `POST /api/projects/:id/agents/generate` spawns dedicated Claude with agent-authoring system prompt; returns draft `.md`
- [ ] 11.6 Live validation: name regex, collision check, model enum, frontmatter required fields
- [ ] 11.7 Save: validate → write `.claude/agents/<name>.md` → append `agent_versions` row
- [ ] 11.8 Version history panel: list revisions, view v_N, restore (writes new version row)
- [ ] 11.9 "Test agent" action: server spawns sandboxed `claude` with draft inline + sample task; streams output; writes `agent_tests` row on completion; token ceiling default 4000
- [ ] 11.10 Sample-task library (bundled set: "s3 public", "sql injection", "frontend a11y", etc.)

## 12. Launch-time profile pickers

- [ ] 12.1 Extend single-feature launch dialog with `ProfilePicker` preselected to the resolved default
- [ ] 12.2 Extend batch-implement launch dialog with per-rail `ProfilePicker` + "Same for all" convenience
- [ ] 12.3 Rail header: compact profile picker for quick re-launch (read-only while running)
- [ ] 12.4 Submitting a launch writes `.user-preferred.json` if the selection changed

## 13. Migration from legacy Project Settings

- [ ] 13.1 Add migrator to `SetupManager` or first-visit hook: read `install-config.yaml` + frontmatter models, generate `.specrails/profiles/default.json` with equivalent content
- [ ] 13.2 Idempotency: skip if `default.json` already exists
- [ ] 13.3 Remove Agent Models section from `SettingsPage.tsx`; add one-time breadcrumb banner pointing to Agents
- [ ] 13.4 Decommission `agent-models` server endpoint and `applyModelConfig` code path after migration window (two release cycles)

## 14. Analytics integration

- [ ] 14.1 Add SQL aggregation for per-profile metrics (join `jobs` × `job_profiles`)
- [ ] 14.2 `AnalyticsPage.tsx` gains a "Profile usage" card: bar chart, tables (success rate, avg tokens, avg duration)
- [ ] 14.3 Time window selector (7d / 30d / 90d)

## 15. Telemetry enrichment

- [ ] 15.1 Update `queue-manager.ts` OTEL env var construction to include the profile attributes
- [ ] 15.2 Verify OTLP receiver surfaces the attributes in the compacted summaries
- [ ] 15.3 Diagnostic ZIP export includes `profile.json` snapshot

## 16. Doctor / compat-check hooks

- [ ] 16.1 Doctor reports specrails-core version and whether profile mode is available
- [ ] 16.2 Doctor warns if `.specrails/` contains invalid profiles
- [ ] 16.3 `compat-check` surfaces the profile schema version the project uses

## 17. Tests

- [ ] 17.1 Unit tests for `ProfileManager` CRUD + validation
- [ ] 17.2 Unit tests for snapshot-per-job (bytes match; env var set; chmod 400)
- [ ] 17.3 Unit tests for resolution order (explicit / `.user-preferred.json` / `default`)
- [ ] 17.4 Unit tests for batch per-rail forwarding (three rails, three distinct snapshots)
- [ ] 17.5 Integration test: launch a single feature with profile; verify `SPECRAILS_PROFILE_PATH` reaches the spawned process (mock claude binary)
- [ ] 17.6 Integration test: hub with specrails-core 4.0.x (mocked) does NOT inject env var; 4.1.x does
- [ ] 17.7 Client tests: Profiles tab renders; validation errors shown; routing drag-reorder works
- [ ] 17.8 Client tests: Agent Studio form↔markdown bidirectional sync; collision detection; save flow
- [ ] 17.9 Client tests: launch dialog profile picker; batch dialog per-rail selection
- [ ] 17.10 Migration test: legacy Project Settings → `default.json` content equivalence
- [ ] 17.11 Coverage maintained at or above existing thresholds (70% global, 80% server lines/functions/statements)

## 18. Documentation

- [ ] 18.1 Update `CLAUDE.md` with an Architecture section for the Agents section
- [ ] 18.2 Update README with feature overview + screenshot
- [ ] 18.3 Add a "Profiles quick start" doc explaining catalog vs selection and per-rail overrides
- [ ] 18.4 Document the migration behavior for existing users

## 19. Release readiness

- [ ] 19.1 Feature flag default is `false` for first release
- [ ] 19.2 Internal dogfood pass: create two profiles, run batch with per-rail overrides, verify analytics
- [ ] 19.3 After green, flip flag default to `true` in a follow-up PR
- [ ] 19.4 Changelog entry explaining the migration and the core version requirement
