# Handoff — add-multi-provider-support

This file is the running progress log for the change. It is **not** an
OpenSpec-tracked artifact — `proposal.md`, `design.md`, `specs/`, and
`tasks.md` are. Update this file when you commit work so anyone resuming the
branch sees the current state at a glance.

## Stage A — **COMPLETE** ✅

Every server-side path that interacts with an AI CLI runs through the
ProviderAdapter contract. Codex projects are functionally end-to-end
within the hub server: chat, rails (with synthetic OTEL spans), AI Edit,
setup wizard, explore-cwd, profiles, and plugins (Serena via `codex mcp
add`) all work. The UI gates ("Codex coming soon") stay UP — that's
Stage C.

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
12. `docs(openspec): refresh handoff log — 11 commits, 13/17 Stage A sections done`
13. `refactor(setup-manager): adapter-driven enrich; real codex thread_id resume`
14. `feat(profile-manager): adapter-driven model catalog + optional provider field`
15. `refactor(project-router): generate-spec spawn uses adapter.buildArgs`
16. `feat(plugins): provider-aware contributors target AGENTS.md on codex`
17. `docs(openspec): handoff refresh — 16 commits, Stage A 95% done`
18. `feat(plugins): codex `mcp add` install path with per-project CODEX_HOME`

### Sections of tasks.md status

| § | What | Status |
|---|---|---|
| 1 | Foundations: types, registry, fixtures | ✅ |
| 2 | Claude adapter + tests | ✅ |
| 3 | Codex adapter + tests + fixture-vs-minVersion CI guard | ✅ |
| 4 | Pricing table | ✅ |
| 5 | Codex OTEL bridge (incl §5.6 wiring into QueueManager) | ✅ |
| 6 | result-event refactor (incl §6.3 callsite migration) | ✅ |
| 7 | ChatManager refactor | ✅ |
| 8 | QueueManager refactor | ✅ |
| 9 | AgentRefineManager refactor | ✅ |
| 10 | SetupManager refactor | ✅ |
| 11 | project-router refactor | ✅ |
| 12 | explore-cwd-manager refactor | ✅ |
| 13 | ProfileManager (per-provider model catalog) | ✅ |
| 14 | PluginManager (full codex MCP-add path + AGENTS.md contributors) | ✅ |
| 15 | DB migrations + recordInvocation extended + byProvider helper | ✅ |
| 16 | setup-prerequisites: registry-driven providers + at-least-one rule | ✅ |
| 17 | core-compat: registry-walking detection | ✅ |

## Test status

```
PASS (1784) FAIL (1)
```

The lone failure is the pre-existing smash-runner test
(`server/smash-runner.test.ts:381`) which is the user's WIP, not in scope.

| Module | Tests after refactor |
|---|---|
| server/providers/ | 71 |
| server/pricing | 18 |
| server/result-event | 11 |
| server/codex-otel-bridge | 7 |
| server/chat-manager | 41 |
| server/queue-manager | 85 |
| server/agent-refine-manager | 29 |
| server/setup-manager | 107 |
| server/setup-prerequisites | 15 |
| server/core-compat | 19 |
| server/explore-cwd-manager | 12 |
| server/ai-invocations | 12 |
| server/profile-manager | 32 |
| server/plugin-manager | 30 |
| server/plugins/contributors | 12 |
| server/plugins/serena (install + verify) | 14+5 codex |
| server/plugins/codex-mcp | 8 |
| server/plugins-router | 16 |

## Typecheck status

```
TypeScript: 12 errors in 2 files
```

All 12 errors are pre-existing in `server/project-router.ts` and
`server/smash-runner.ts` (the user's other WIP). Zero errors introduced
by this branch.

## End-to-end codex behaviour (gates still up)

When the gates are lifted in Stage C, the following will all work
correctly with codex projects:

| Surface | Codex behaviour |
|---|---|
| **Add project** | hub-router POST /projects + AddProjectDialog accept provider: 'codex' (Stage C flips one boolean) |
| **Chat (sidebar + Explore)** | `codex exec --json` first turn → real `thread_id` captured → `codex exec resume <UUID>` on every subsequent turn → context preserved |
| **Rails (QueueManager)** | `codex exec --json --sandbox workspace-write --skip-git-repo-check <prompt> --model <m>` → tokens from `turn.completed.usage` → estimated cost from pricing.ts → OTEL spans synthesised → diagnostic ZIP works |
| **AI Edit (AgentRefineManager)** | refines `.codex/skills/<id>/SKILL.md` (was `.claude/agents/<id>.md`); no model field check on codex frontmatter |
| **Setup wizard** | `_spawnSetupWithAdapter` adapter-driven; captures real `thread_id`; resume via `codex exec resume <UUID>`; legacy synthetic-session fallback for upgrades; checkpoint detection recognises `.codex/skills/sr-*/SKILL.md`, `.codex/rules.star` |
| **Explore-cwd** | `~/.specrails/projects/<slug>/explore-cwd/AGENTS.md` (not `CLAUDE.md`); stale-file cleanup if provider switches |
| **Profiles** | profile schema accepts `provider: 'codex'`; models validated against `codexAdapter.modelCatalog()`; cross-provider model mixing rejected with a clear "not valid for provider 'codex'" message |
| **Plugins** | `codex mcp add` with per-project `CODEX_HOME=~/.specrails/projects/<slug>/codex-home/`; AGENTS.md contributor block; `not-applicable` status for plugins lacking `providerSupport.codex` |
| **setup-prerequisites** | Reports one entry per registered adapter; blocks Add Project only when zero providers are usable |
| **Analytics** | `ai_invocations.provider` populated; `ai_invocations.total_cost_usd_estimated=1` for codex rows; getInvocationsByProvider helper ready for UI |

## What's next: Stage B and Stage C

### Stage B (specrails-core 4.6.0) — separate repo

Tasks §18–§20. Lives at `/Users/javi/repos/specrails-core`. Three gate-
lifts, scaffold updates, port rails to SKILL.md format, npm publish.
Blueprint in `tasks.md` §18-§20 + `proposal.md` §3.

### Stage C (lift hub gates + UI polish + rollout) — this repo

Tasks §21–§26. Concrete checklist:

1. **One-line gate flips** (§21):
   - `server/hub-router.ts:147`: change hardcoded `codex: false` to
     `codex: providers.codex` (real value).
   - `server/hub-router.ts:181-188`: remove the `provider === 'codex'`
     rejection block.
   - `client/src/hooks/useHub.tsx:37`: widen `addProject` parameter
     type to `provider?: 'claude' | 'codex'`.
   - `client/src/components/AddProjectDialog.tsx:59,74`: stop force-
     setting `codex: false`; remove the early-return + "Coming Soon"
     toast.
2. **AnalyticsPage codex surfacing** (§22.5):
   - Render `~` prefix on cost cells where
     `total_cost_usd_estimated === 1`.
   - Hero footnote "Includes estimated costs" when
     `totalEstimatedCostUsd > 0`.
   - New `ProviderBreakdownCard` driven by `getInvocationsByProvider`.
3. **e2e dry run** (§23): manual on a real codex project end-to-end.
4. **Docs** (§25): `README.md` "Requirements" updated; new
   `docs/codex.md` user guide; CHANGELOG entries.
5. **Rollout** (§26): `SPECRAILS_HUB_CODEX_BETA` env var first, then
   drop the gate.

Stage C is small in code-volume — maybe 200 LOC — but UX-critical. Wait
for Stage B to publish before flipping.

## Test commands

```bash
# Multi-provider modules
npx vitest run server/providers server/pricing server/result-event \
  server/codex-otel-bridge server/chat-manager server/queue-manager \
  server/agent-refine-manager server/setup-prerequisites \
  server/core-compat server/explore-cwd-manager server/ai-invocations \
  server/profile-manager server/plugin-manager server/plugins \
  server/setup-manager

# Full server+CLI suite
npx vitest run

# Typecheck
npx tsc --noEmit -p tsconfig.json

# Coverage (must hold ≥80% server lines/funcs/stmts, ≥80% client lines/stmts)
npm run test:coverage
cd client && npm run test:coverage
```

## Pre-existing repo state to be aware of

- `git stash list` shows 30+ entries. The first is `claude-model-auth-fix-
  wip` which was accidentally popped early in session 1 but is preserved.
  Never run bare `git stash pop`.
- `server/project-router.ts` and `server/smash-runner.ts` have pre-existing
  TypeScript errors and 1 pre-existing test failure outside this change's
  scope. They also prevent the codex-specific project-router test file from
  loading (the test runs into the broken transitive import); the actual
  refactor of the route handler itself is verified by the typecheck and the
  other test suites that don't depend on those broken imports.
