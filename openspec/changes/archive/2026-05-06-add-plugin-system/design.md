## Context

specrails-hub orchestrates rails (Claude CLI subprocesses) per project. Today, agents inside those rails consume most of their input tokens reading the user's repository through raw `Read`/`Grep`. Adopting semantic-aware MCP servers (Serena via LSP, future indexers, etc.) cuts that cost ~40-60%, but only if their setup is reliable per-project and rails actually inherit them.

We considered three placements for that integration logic:
1. Push it into `specrails-core` via new placeholders in agent templates (`{{PLUGINS_INSTRUCTIONS}}` etc.).
2. Build a separate companion CLI.
3. Build it inside `specrails-hub` as a marketplace-style per-project surface, with zero changes in `specrails-core`.

The user explicitly chose option (3): keep `specrails-core` untouched. The hub already owns per-project state (profiles, telemetry, terminal sessions), the WebSocket fan-out, and the UI surface. Adding "plugins" follows the same shape as "profiles" — a small typed registry, per-project state under `.specrails/`, REST + WS, and a hook in `QueueManager` at spawn time.

The constraint that drives almost every decision below is **additivity**: adding plugin N+1 in the future must not require touching plugin N's state, files, or behavior, and must not require migrations.

## Goals / Non-Goals

**Goals**
- Per-project, marketplace-style integrations surface inside the hub.
- Each plugin independently installable and uninstallable, with a diff-preview before either action.
- All file mutations (`.mcp.json`, plugin state, agent fragments) are surgical, atomic, locked, and reversible.
- Rails launched via `QueueManager` automatically inherit the project's active plugins (env vars, OTEL attrs, snapshot per job).
- Pre-spawn healthcheck is non-blocking: a degraded plugin never cancels a rail.
- Zero changes in `specrails-core` for v1. The plugin system is wholly hub-owned.
- Adding a future plugin requires only: implementing the `Plugin` interface, adding it to `server/plugins/index.ts`, and (if it ships a fragment) dropping a templates file. No changes elsewhere.

**Non-Goals (v1)**
- Remote plugin registry or third-party plugin loading. Bundled-only.
- User-authored plugins, plugin marketplaces beyond what hub bundles.
- Hot-reload of plugins. Hub restart is acceptable.
- Injecting plugin instructions into core agent templates (`sr-developer.md`, etc.). v1 leans on MCP tool schemas being self-descriptive. Re-evaluate in v2.
- Cross-project shared plugin state.
- A CLI for `specrails-hub plugin add/remove`. The UI is the only surface in v1.
- Plugin dependencies between plugins (`requires: [otherPlugin]`). YAGNI.
- Auto-install plugins when adding a project. Always opt-in.

## Decisions

### 1. Hub-only architecture; zero core changes
- **Choice**: All plugin logic lives in the hub. The plugin system mutates `<project>/.mcp.json` and writes to `<project>/.specrails/plugins/` and `<project>/.claude/agents/custom-<plugin>.md`. None of those paths are managed or rewritten by `specrails-core` (per CLAUDE.md, `.claude/agents/custom-*.md` and `.specrails/profiles/**` are explicitly protected; `.mcp.json` is not core-managed; `.specrails/plugins/` is a new sibling that core has no business touching).
- **Why**: Avoids cross-repo coordination, keeps release cadence independent, makes the change self-contained and reversible.
- **Alternatives considered**:
  - Adding a `{{PLUGINS_INSTRUCTIONS}}` placeholder in core agent templates so plugins can boost agents' system prompts. Rejected for v1 because it requires a core PR and its own version gate; revisit if metrics show MCP-only is materially under-utilized.
  - Hub appending a marker block to project `CLAUDE.md`. Rejected for v1 because `CLAUDE.md` is user territory and we do not want hub-managed sections inside it.

### 2. Per-project state at `.specrails/plugins/`
- **Choice**: `<project>/.specrails/plugins/state.json` (state) and `<project>/.specrails/plugins/snapshots/<jobId>.json` (per-job freeze for diagnostic export). Plus the runtime mirror at `~/.specrails/projects/<slug>/jobs/<jobId>/plugins.json` (chmod 400) used at spawn time and read by the diagnostic exporter.
- **Why**: Keeps everything plugin-related in one folder under the project's existing specrails directory. Mirrors the profile pattern (`profiles/` sibling) so future contributors find it without surprise.
- **Risk**: We assume `specrails-core` does not blow away unknown subfolders under `.specrails/`. If a future core version ever does, we migrate to `.specrails-hub/plugins/` (new top-level, fully hub-owned) without breaking the on-disk schema. See "Risks" for mitigation.

### 3. TypeScript module manifest, not YAML
- **Choice**: Each plugin is a TS module exporting a `Plugin` value; the manifest is a typed object, not a parsed YAML/JSON document.
- **Why**: Bundled-only registry means the manifest's source of truth is code we compile. Type safety > runtime AJV validation. Simpler tests. No risk of malformed manifests at runtime.
- **Alternative**: `plugin.yaml` per plugin. Rejected: adds a parser, requires AJV like profiles already use, brings nothing because plugins are not user-authored in v1.

### 4. Ownership-based additivity
- **Choice**: Each plugin manifest declares `owns.mcpServers`, `owns.agentFragments`, `owns.configKeys`. At hub startup, `PluginManager` precomputes a global ownership map and fails fast if two plugins claim overlapping keys. All file mutations are scoped to a plugin's owned keys.
- **Why**: This is the central guarantee. Adding plugin N+1 cannot accidentally trample plugin N because conflicts are detected before any user-facing surface is reachable.
- **Alternatives**:
  - Marker comment blocks inside a single `.mcp.json` per plugin. Rejected: `.mcp.json` is JSON, comments are not standard, and the merge logic becomes more error-prone.
  - One `.mcp.json` fragment per plugin merged at runtime. Rejected: Claude CLI reads one file; we'd add a build step for no benefit.

### 5. Surgical, locked, atomic mutators
- **Choice**: All writes to `<project>/.mcp.json` and `state.json` follow read → modify → write-temp → rename, with a `proper-lockfile` advisory lock held for the entire round trip. Install transactions capture pre-install bytes for every file they will mutate; on `verify` failure or thrown error, the manager restores those bytes before surfacing the error.
- **Why**: Prevents lost updates from concurrent installs; prevents partially-written `.mcp.json` from breaking the user's project; guarantees rollback is byte-identical.
- **Alternative**: Best-effort writes with retry. Rejected: too easy to leave the project in an inconsistent state; users notice when their MCP config breaks.

### 6. Healthcheck contract: non-blocking, time-boxed
- **Choice**: `Plugin.verify` is a function each plugin implements; `PluginManager.verify(projectId, name)` wraps it with a 2000ms default timeout and converts errors/timeouts into `{ ok: false, reason }`. `QueueManager` consumes the result, never throws on degraded.
- **Why**: A broken plugin (uv removed, daemon crashed) must not cancel a rail. Users tolerate "Serena unavailable for this run" — they do not tolerate "your rail failed to start because of a plugin you did not invoke".
- **Trade-off**: We may run rails with broken plugins silently. Mitigation: emit `plugin.degraded` WS event with `jobId`, surface a degraded badge in the UI card, and include `degraded` in OTEL attrs so post-hoc analysis is straightforward.

### 7. Snapshot per rail job
- **Choice**: Before spawning a rail, `QueueManager` writes the resolved plugin set (active + degraded) to `~/.specrails/projects/<slug>/jobs/<jobId>/plugins.json` (chmod 400), exactly mirroring the existing profile snapshot pattern. The snapshot is the source of truth for that job and is included in the diagnostic ZIP.
- **Why**: Reproducibility (we can answer "what plugins were live when this job ran?") and immutability (mid-job install/uninstall does not affect a running job).
- **Alternative**: Read live state at every diagnostic export. Rejected: state is mutable, diagnostic data must not be retroactively rewritten.

### 8. Spawn surfaces: only QueueManager
- **Choice**: `QueueManager` snapshots, env-injects, and OTEL-tags. `ChatManager` does nothing plugin-specific — it relies on Claude CLI reading `.mcp.json` from the spawn `cwd`. `SetupManager` ignores plugins entirely.
- **Why**: Same reasoning as the existing profile system. Rails are reproducible, telemetried jobs; chats are interactive (no point freezing); setup happens before any plugin could be installed.
- **Alternative**: Snapshot for chat too. Rejected: adds work without payoff because chat is not analytically replayed.

### 9. Marketplace UX with diff preview
- **Choice**: A dedicated `IntegrationsPage` with marketplace-style cards. Install opens a modal showing exactly which files will change (`+` create, `~` modify) plus prerequisite checks; uninstall opens a destructive-style modal listing what reverts and what stays.
- **Why**: Plugins mutate the user's repo. Showing the diff before mutation builds trust and makes accidental clicks harmless.
- **Alternative**: One-click install. Rejected: too easy to nuke an existing `.mcp.json` setup the user crafted by hand.

### 10. Reuse existing patterns, do not invent new ones
- `usePrerequisites()` + `setup-prerequisites.ts` for `uv` detection (extend, not parallel).
- Streaming install logs reuse the WS-driven progress UI from `SetupWizard`.
- `useProjectCache` for stale-while-revalidate of the catalog across project switches.
- WS event filtering by `projectId` ref already standard in `useHub`.
- `proper-lockfile` is already an acceptable dep on the server side.

## Risks / Trade-offs

- **Risk**: Future `specrails-core` versions may add cleanup logic that touches `.specrails/plugins/`.
  → **Mitigation**: The CLAUDE.md contract today is "core does not touch unknown subfolders." We monitor core release notes; if a future version ever sweeps `.specrails/`, the migration is a one-shot rename to `.specrails-hub/plugins/` (path constant lives in one place: `server/plugins/paths.ts`).

- **Risk**: A user manually edits `.mcp.json` and the manager's surgical merge silently overwrites their entry because we mis-identify ownership.
  → **Mitigation**: Ownership map is computed at startup and never includes user-authored keys. Mutators only touch keys explicitly listed in a plugin's `owns.mcpServers`. Add a regression test where the project starts with a user-authored entry and assert byte-equality after install + uninstall.

- **Risk**: Verify timeouts misclassify a slow but healthy plugin as degraded.
  → **Mitigation**: 2000ms default is generous; configurable per plugin via manifest field `verifyTimeoutMs`. UI shows the reason (`verify-timeout` vs `uv-not-on-path`) so users can recheck manually.

- **Risk**: Two installs racing each other corrupt `state.json` or `.mcp.json`.
  → **Mitigation**: `proper-lockfile` advisory locks held end-to-end; explicit test for concurrent installs.

- **Risk**: MCP server name collision with user-authored entries (user already has `mcpServers.serena` for a personal Serena setup).
  → **Mitigation**: Pre-install check rejects with a clear error: "this project already has an `mcpServers.serena` entry not managed by the hub; remove it first." No silent overwrite.

- **Risk**: Adding plugin instructions to core agents (v2) is more impactful than MCP-only and we under-deliver in v1.
  → **Trade-off**: Accepted. v1 is shippable in days; v2 prompt boost can land on top without architectural change. The plugin contract already supports an optional `custom-<plugin>.md` fragment, so v2 may not even require a contract change — only a templates/instructions.md inside Serena.

- **Risk**: Diagnostic ZIP grows.
  → **Trade-off**: `plugins.json` is small (sub-KB). Negligible.

- **Risk**: Healthcheck spawns add measurable latency before each rail spawn.
  → **Mitigation**: Healthcheck runs in parallel for all installed plugins (Promise.all with per-plugin timeout). For typical projects with 0–1 plugins, added latency is bounded by the slowest plugin's timeout (≤ 2000ms) and is acceptable.

## Migration Plan

This is purely additive; there is nothing to migrate.

- **Deploy**: Ship hub release with the plugin module compiled in. Existing projects without any installed plugin behave identically.
- **Rollback**: If the plugin system causes regressions, ship a hub release that disables the router and hides the sidebar entry; on-disk state files are inert and can be re-enabled later. No DB migration to revert.

## Open Questions

- Final placement of the sidebar entry (above or below "Agents") — UX detail, defer until layout review.
- Whether to expose `verifyTimeoutMs` per plugin in v1 or hardcode 2000ms — defer; ship hardcoded, expose in v2 if any plugin needs different.
- Whether `plugin.health_changed` should be emitted on a periodic interval or only on user-triggered re-verify — start with user-triggered + spawn-time only; revisit if users want a "dashboard" view.
