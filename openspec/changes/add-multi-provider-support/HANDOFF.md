# Handoff — add-multi-provider-support

This file is the running progress log for the change. It is **not** an
OpenSpec-tracked artifact — `proposal.md`, `design.md`, `specs/`, and
`tasks.md` are. Update this file when you commit work so anyone resuming the
branch sees the current state at a glance.

## Stage A progress — **MOST OF THE WAY DONE**

The provider-adapter contract, supporting modules, every spawn manager
except SetupManager, the DB migrations, setup-prerequisites, and
core-compat are migrated. The Claude path is byte-identical for users;
the codex path runs end-to-end internally with the gates still up. The
remaining Stage A items are PluginManager (codex `mcp add`) and
ProfileManager (per-provider model catalog validation).

### Branch
`feat/multi-provider-support` off `main`.

### Commits in order
1. `docs(openspec): add-multi-provider-support change with full artifact set`
2. `feat(providers): introduce ProviderAdapter contract + claude/codex adapters`
3. `feat(server): pricing table + finaliseInvocationResult + codex OTEL bridge`
4. `feat(db): ai_invocations.provider + total_cost_usd_estimated + byProvider`
5. `docs(openspec): handoff log + tasks.md progress markers through §15.3`
6. `refactor(chat-manager): migrate onto ProviderAdapter; real codex thread_id`
7. `refactor(core-compat): registry-walking provider detection`
8. `feat(setup-prerequisites): registry-driven provider entries + at-least-one rule`
9. `refactor(queue-manager): migrate onto ProviderAdapter; wire codex OTEL bridge`
10. `refactor(agent-refine-manager): adapter-driven; codex SKILL.md path support`
11. `feat(explore-cwd): provider-aware instructions file (AGENTS.md for codex)`

### Sections of tasks.md complete

| § | What | Status |
|---|---|---|
| 1 | Foundations: types, registry, fixtures | ✅ |
| 2 | Claude adapter + tests | ✅ |
| 3 | Codex adapter + tests + fixture-vs-minVersion CI guard | ✅ |
| 4 | Pricing table | ✅ |
| 5 | Codex OTEL bridge (incl §5.6 wiring into QueueManager) | ✅ |
| 6 | result-event refactor (incl §6.3 callsite migration in ChatManager, QueueManager, AgentRefineManager) | ✅ |
| 7 | ChatManager refactor | ✅ |
| 8 | QueueManager refactor | ✅ |
| 9 | AgentRefineManager refactor | ✅ |
| 10 | SetupManager refactor | ⏳ pending |
| 11 | project-router refactor (generate-spec already adapter-aware; ai-edit delegates to §9) | ⏳ partial |
| 12 | explore-cwd-manager (provider-aware AGENTS.md) | ✅ |
| 13 | ProfileManager (per-provider model catalog) | ⏳ pending |
| 14 | PluginManager (codex `mcp add` + AGENTS.md contributors) | ⏳ pending |
| 15 | DB migrations + recordInvocation extended + byProvider helper (UI surfacing in §22) | ✅ |
| 16 | setup-prerequisites: registry-driven providers + at-least-one rule | ✅ |
| 17 | core-compat: registry-walking detection | ✅ |

### Sections still pending (in priority order)

| § | Why it matters |
|---|---|
| 10 SetupManager | Codex setup-enrich pass currently uses a stale codex-only branch; refactor onto `adapter.buildArgs('setup-enrich'/'setup-enrich-resume')` so wizard checkpoint detection + resume work like the chat-manager flow. |
| 13 ProfileManager | Profile schema validation rejects codex models today. Extend `validateStructural` to resolve `getAdapter(profile.provider ?? project.provider)` and check `agents[i].model ∈ adapter.modelCatalog().map(m => m.value)`. Schema bumps optional `provider?: string` field. |
| 14 PluginManager | Plugins (Serena today) hardcode `.mcp.json` writes. Add `providerSupport.codex.mcpEntry` to manifest, dispatch on `adapter.mcpRegistration === 'cli-add'`, run `codex mcp add` with per-project `CODEX_HOME=~/.specrails/projects/<slug>/codex-home/`. Shared-file contributors target `adapter.instructionsFilename` (AGENTS.md for codex). |
| 11 project-router | Minor cleanup — generate-spec already branches on provider; refactor to `adapter.buildArgs('spec-gen', ...)` for symmetry with the rest of the codebase. ai-edit delegates entirely to AgentRefineManager (already migrated). |
| 22.5 client/AnalyticsPage | Surface the `provider` column and `total_cost_usd_estimated` flag — render `~` prefix on estimated rows + Hero footnote when `totalEstimatedCostUsd > 0`. New `ProviderBreakdownCard`. |

### Stage B/C status

Both untouched. Stage B (specrails-core 4.6.0 lift gates + codex skill rails)
is a separate repo PR. Stage C (lift hub gates, UI gate lift, e2e, docs,
rollout) is gated on Stage B publishing to npm.

## Test status

```
PASS (1759) FAIL (1)
```

The lone failure is the pre-existing smash-runner test
(`server/smash-runner.test.ts:381`) which is the user's WIP, not in scope
for this change. Multi-provider tests all green:

| Module | Tests |
|---|---|
| server/providers/ | 71 |
| server/pricing | 18 |
| server/result-event | 11 |
| server/codex-otel-bridge | 7 |
| server/chat-manager | 41 |
| server/queue-manager | 85 |
| server/agent-refine-manager | 29 |
| server/setup-prerequisites | 15 |
| server/core-compat | 19 |
| server/explore-cwd-manager | 12 |
| server/ai-invocations | 12 |

## Typecheck status

```
TypeScript: 12 errors in 2 files
```

All 12 errors are pre-existing in `server/project-router.ts` and
`server/smash-runner.ts` (the user's other WIP). Zero errors introduced
by this branch.

## Test commands

```bash
# Modules touched by this branch
npx vitest run server/providers server/pricing server/result-event \
  server/codex-otel-bridge server/chat-manager server/queue-manager \
  server/agent-refine-manager server/setup-prerequisites \
  server/core-compat server/explore-cwd-manager server/ai-invocations

# Full server+CLI suite
npx vitest run

# Typecheck
npx tsc --noEmit -p tsconfig.json

# Coverage (must hold ≥80% server lines/funcs/stmts, ≥80% client lines/stmts)
npm run test:coverage
cd client && npm run test:coverage
```

## How to continue

1. **§10 SetupManager** — pattern mirrors §7 ChatManager. Inject the adapter,
   replace `if (this._provider === 'codex')` branches in `_spawnSetup` /
   `resumeEnrich` with `adapter.buildArgs('setup-enrich' | 'setup-enrich-
   resume')`, switch `parseStreamLine` to the adapter, drop the synthetic
   `codex-<projectId>-<ts>` session id (use the real thread_id), extend
   checkpoint detection regexes for `.codex/skills/sr-*/SKILL.md` paths.
2. **§13 ProfileManager** — extend `validateStructural` to resolve the
   adapter and validate models against its catalog. Bump
   `schemas/profile.v1.json` to allow `provider?: string` and replace the
   enum on `ProfileAgent.model` with a string pattern (runtime validation
   enforces the catalog).
3. **§14 PluginManager** — the biggest remaining chunk. Add
   `providerSupport` to manifests, branch install/uninstall on
   `adapter.mcpRegistration`, plumb per-project `CODEX_HOME`, target
   `adapter.instructionsFilename` from `applyContributors`.
4. After §10, §11, §13, §14 all land, run the full e2e §23 dry-run to
   confirm a codex project can be created → installed → ticket created →
   implement → tokens/cost visible. Then move to Stage B (specrails-core
   4.6.0) and finally Stage C (gate lift).

## Pre-existing repo state to be aware of

- `git stash list` shows 30+ entries. The first is `claude-model-auth-fix-
  wip` which was accidentally popped early in session 1 but is preserved.
  Never run bare `git stash pop`.
- `server/project-router.ts` and `server/smash-runner.ts` have pre-existing
  TypeScript errors and 1 pre-existing test failure outside this change's
  scope.
