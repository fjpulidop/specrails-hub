## Context

The Explore Spec feature today has two sources of truth for the same decisions:

1. **Project Settings** (`SettingsPage` → "Explore Spec" card): two project-level toggles persisted in `queue_state` (`config.explore_mcp_enabled`, `config.explore_contract_refine_enabled`), exposed via four REST endpoints, and read by `ChatManager` (spawn cwd) and `contract-refine-runner` (lifecycle gate + retry gate).
2. **Add Spec modal** (`ContextScopeSlider`): the same flags (`mcp`, `contractRefine`) are exposed per-spec inside the `contextScope` blob, persisted alongside the conversation in `chat_conversations.context_scope`, and stored with every committed ticket via `origin_conversation_id`.

The two sources are not synchronized. Worse, the project-level toggles act as a retroactive default: a user who flipped Settings.MCP=on yesterday sees it apply to specs created today even though the slider's preset shows `mcp: false`. The product invariant we want is simpler: **the per-spec decision at creation time is the only decision that matters; the ticket carries its own scope forever.**

This change removes the project-level toggles, the four endpoints, and the two reads in `ChatManager`/`contract-refine-runner`. It does not add any new mechanism — `context_scope` already exists and already flows everywhere it needs to.

## Goals / Non-Goals

**Goals:**
- One source of truth for MCP-in-Explore and Contract-Refine decisions: the ticket's (or in-flight conversation's) `context_scope`.
- No retroactive project defaults. Existing tickets keep behaving exactly as their stored `context_scope` says.
- No DB migration. Orphan `queue_state` keys are harmless and left in place.
- Retry endpoint becomes a thin per-ticket consent: if the ticket has an `origin_conversation_id` and the hub-wide kill switch is off, retry runs.

**Non-Goals:**
- Changing how `ContextScopeSlider` works, what presets exist, or how `useContextScope` persists scope per-project (the slider's pre-fill is UX memory, not a functional default — out of scope).
- Removing the hub-wide kill switch `SPECRAILS_EXPLORE_CONTRACT_REFINE` (kept as ops escape hatch).
- Touching Quick mode's `add_spec_quick_contract_refine_last` (modal-local sticky toggle, unrelated to project settings).
- Migrating or back-filling `context_scope` for legacy conversations created before the feature shipped. Legacy `null` scope continues to default to `false` everywhere (current behavior).
- Adding any UI for retry-after-the-fact configuration. If a ticket wasn't created with `contractRefine: true`, the user clicking Retry on the ticket is the consent — no second toggle.

## Decisions

### 1. Remove the four REST endpoints rather than deprecate them

`GET/PATCH /api/projects/:projectId/explore-mcp-enabled` and `GET/PATCH /api/projects/:projectId/explore-contract-refine-enabled` are deleted outright. No `410 Gone` shim, no version flag.

**Rationale:** the only client is `SettingsPage`, which is deleted in the same commit. There is no external consumer (no specrails-core, no CLI, no third-party). Deprecation overhead exceeds benefit.

**Alternative considered:** keep endpoints but make them no-ops returning the kill-switch state. Rejected — adds confusing semantics ("the toggle returns false but Explore still runs MCP", etc.).

### 2. Retry endpoint: kill switch + `origin_conversation_id` are the only gates

`POST /api/projects/:projectId/tickets/:id/contract-refine`:
- 404 if ticket unknown.
- 409 if ticket has no `origin_conversation_id` (cannot resume).
- 409 if hub-wide kill switch `SPECRAILS_EXPLORE_CONTRACT_REFINE` is set to a disabling value (`0`, `false`, `off`, case-insensitive — match current parsing).
- 202 otherwise.

The previous "409 if project toggle off" branch is removed.

**Rationale:** the user clicking Retry on a specific ticket is the per-ticket consent. The original `context_scope.contractRefine` was the creation-time decision; Retry is a fresh decision and should not be gated by that historical value. The kill switch remains as an ops-level circuit breaker for hub operators (not end users).

**Alternative considered:** 409 when `origin_conversation.context_scope.contractRefine === false`. Rejected — too restrictive; the user has explicitly clicked Retry, they want it now.

### 3. `ChatManager` Explore spawn: drop the project-toggle read

Current logic in `ChatManager` (for `kind === 'explore'`): spawn cwd = `project.path` when `config.explore_mcp_enabled === true`, else explore-cwd. After this change: spawn cwd is decided exclusively by `conversation.context_scope.mcp` — `true` → `project.path`, `false`/null → explore-cwd.

**Rationale:** `chat_conversations.context_scope` is already written at creation time by the Explore client (`useChat.startWithMessage(..., scope)`). The read path is a one-line change.

**Edge case:** legacy conversations with `context_scope === null` were spawning per the project toggle. After this change they spawn in explore-cwd (the conservative path). This affects resumes only — no new sessions can be created with `null` scope under current code.

### 4. `contract-refine-runner`: drop the project-toggle fallback

Current logic: `context_scope.contractRefine ?? project_setting`. After: just `context_scope.contractRefine === true`. Null/false → no-op (return `scope-disabled`).

**Rationale:** same as #3. Cleaner, and aligns with the per-ticket invariant.

### 5. No DB migration; leave orphan keys

The two `queue_state` rows (`config.explore_mcp_enabled`, `config.explore_contract_refine_enabled`) are no longer read or written by any code path after this change. They remain in the database for users who had them set.

**Rationale:** no schema change, no migration risk. A future cleanup migration could sweep them, but it's not load-bearing.

**Alternative considered:** delete the rows in a startup hook. Rejected — adds startup-time write churn for zero functional gain.

### 6. `ContextScopeSlider` and `useContextScope` unchanged

The slider's presets continue to include `mcp` and `contractRefine` flags. `useContextScope(projectId)` continues to persist the last-used scope per project as a pre-fill convenience.

**Rationale:** the pre-fill is *modal-state memory*, not a *project default*. It only affects what the dial shows when the modal opens; the actual decision is still made per-spec and stored with the conversation/ticket. Removing it would force users to re-select their preset every time, which is friction without benefit.

## Risks / Trade-offs

- **[Risk] Users who had `explore_mcp_enabled=true` set in Settings will silently see new Explore specs spawn without MCP unless they enable `scope.mcp` via the slider.** → Mitigation: the slider already exposes `scope.mcp` via the `Max` and `Hub` presets, and `useContextScope` will remember the user's last choice. Release notes call out the change.
- **[Risk] Users who had `explore_contract_refine_enabled=true` will see new Explore specs not auto-run Contract Refine unless they pick a preset that includes it.** → Same mitigation as above. Same presets cover it.
- **[Risk] Retry endpoint accepting tickets whose `origin_conversation.context_scope.contractRefine === false` may surprise users ("I never asked for contract refine, why is the button there?").** → Mitigation: the Retry button in `TicketDetailModal` only appears when `origin_conversation_id` is non-null. The intent — "I want Contract Refine on this ticket now" — is the click itself.
- **[Trade-off] Orphan rows in `queue_state` stay forever.** → Acceptable. Two key/value rows per affected project; trivial storage footprint.
- **[Risk] Test fallout: `SettingsPageExploreMcp.test.tsx` and related server tests for the four endpoints become obsolete.** → Delete the file and remove the obsolete describe blocks; coverage thresholds must still pass.

## Migration Plan

This is a code-only change with no schema migration.

1. Deploy: remove server endpoints, server reads, and client Settings card in a single release.
2. Rollback: revert the commit; the orphan `queue_state` keys are still there and the project toggles resume working.

## Open Questions

None at design time. Implementation may surface minor questions about test rewrites; those are tactical, not design-level.
