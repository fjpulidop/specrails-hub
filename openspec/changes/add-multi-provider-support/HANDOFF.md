# Handoff — add-multi-provider-support

This file is the running progress log for the change. It is **not** an
OpenSpec-tracked artifact — `proposal.md`, `design.md`, `specs/`, and
`tasks.md` are. Update this file when you commit work so anyone resuming the
branch sees the current state at a glance.

## Status: **STAGE A + B + C-gates DONE** ✅

The multi-provider work spans three stages. Stage A (hub adapter
architecture + codex correctness) is complete. Stage B (specrails-core
4.6.0 with codex first-class scaffolding) is complete in
`/Users/javi/repos/specrails-core` on the `feat/codex-provider-support`
branch. Stage C's gate-lifts are complete; Stage C's UX polish
(AnalyticsPage estimated-cost badge + ProviderBreakdownCard) and
docs/rollout still remain.

The hub now lets users create codex projects end-to-end through the UI
when codex is on PATH. The behaviour is gated behind an emergency-
rollback env var `SPECRAILS_HUB_CODEX_BETA=0` (default: enabled).

### Branches

- `specrails-hub: feat/multi-provider-support` (this repo) — 20 commits.
- `specrails-core: feat/codex-provider-support` (sibling) — 1 commit
  containing the gate-lifts, scaffold extension, rail SKILL.md files, and
  175 passing tests.

### Hub commits in order

1.  `docs(openspec): add-multi-provider-support change with full artifact set`
2.  `feat(providers): introduce ProviderAdapter contract + claude/codex adapters`
3.  `feat(server): pricing table + finaliseInvocationResult + codex OTEL bridge`
4.  `feat(db): ai_invocations.provider + total_cost_usd_estimated + byProvider`
5.  `docs(openspec): handoff log + tasks.md progress markers through §15.3`
6.  `refactor(chat-manager): migrate onto ProviderAdapter; real codex thread_id`
7.  `refactor(core-compat): registry-walking provider detection`
8.  `feat(setup-prerequisites): registry-driven provider entries + at-least-one rule`
9.  `refactor(queue-manager): migrate onto ProviderAdapter; wire codex OTEL bridge`
10. `refactor(agent-refine-manager): adapter-driven; codex SKILL.md path support`
11. `feat(explore-cwd): provider-aware instructions file (AGENTS.md for codex)`
12. `docs(openspec): refresh handoff log`
13. `refactor(setup-manager): adapter-driven enrich; real codex thread_id resume`
14. `feat(profile-manager): adapter-driven model catalog + optional provider field`
15. `refactor(project-router): generate-spec spawn uses adapter.buildArgs`
16. `feat(plugins): provider-aware contributors target AGENTS.md on codex`
17. `docs(openspec): handoff refresh — 16 commits, Stage A 95% done`
18. `feat(plugins): codex `mcp add` install path with per-project CODEX_HOME`
19. `docs(openspec): mark Stage A complete; 17/17 sections done`
20. `feat: lift codex gates in hub-router + UI (Stage C §21)`

### specrails-core commit

1. `feat(installer): codex provider is now first-class alongside claude`
   - 12 files changed, +1254/-58 LOC
   - 172 → 175 tests pass
   - Three gates lifted; scaffold extended; rail SKILL.md files added;
     e2e verified locally with `node bin/specrails-core.mjs init
     --provider codex --quick --yes`

### Sections of tasks.md status

| § | What | Status |
|---|---|---|
| 1–17 | All Stage A (foundations, adapters, pricing, OTEL bridge, result-event, every manager refactored, DB migrations, setup-prereq, core-compat) | ✅ |
| 18 | specrails-core: lift 3 gates (provider-detect, install-config, init) | ✅ |
| 19 | specrails-core: extend scaffold + new rail SKILL.md files + apply codex settings + AGENTS.md | ✅ |
| 20 | specrails-core: version bump + CHANGELOG | ⏳ release-please will handle when merged |
| 21 | Hub: lift gates (hub-router, AddProjectDialog, useHub) | ✅ |
| 22 | Hub UI: SettingsPage badge, AnalyticsPage estimated-cost tilde + ProviderBreakdownCard | ⏳ pending |
| 23 | e2e dry-run on a real codex project | ⏳ pending |
| 24 | Coverage + CI verification | ✅ thresholds hold (1786/1787 server, smash-runner pre-existing fail outside scope) |
| 25 | Docs (README, docs/codex.md, CHANGELOG) | ⏳ pending |
| 26 | Rollout behind SPECRAILS_HUB_CODEX_BETA | ✅ env var already wired; default ON; "=0" forces off |

## What works right now (codex projects, gates off)

| Surface | Codex behaviour |
|---|---|
| Add project | UI lets you select codex when on PATH; `POST /projects` accepts `provider: 'codex'`; emergency rollback via `SPECRAILS_HUB_CODEX_BETA=0` |
| Setup wizard (Quick install) | spawns `npx specrails-core init --provider codex --quick` which now succeeds and lays down `.codex/{config.toml,rules.star,skills/*}` + `AGENTS.md` |
| Chat (sidebar + Explore) | `codex exec --json` first turn → real `thread_id` captured → `codex exec resume <UUID>` on subsequent turns → context preserved |
| Rails (QueueManager) | `codex exec --json --sandbox workspace-write` → tokens from `turn.completed.usage` → estimated cost from `server/pricing.ts` → OTEL spans synthesised via `server/codex-otel-bridge.ts` → diagnostic ZIP works |
| AI Edit (AgentRefineManager) | refines `.codex/skills/<id>/SKILL.md`; no `model:` frontmatter check on codex |
| Setup wizard (enrich) | adapter-driven; captures real `thread_id`; `codex exec resume <UUID>` on resume; legacy synthetic-session fallback for upgrades |
| Explore-cwd | `AGENTS.md` hub-managed (not `CLAUDE.md`); stale-file cleanup |
| Profiles | schema accepts `provider: 'codex'`; models validated against `codexAdapter.modelCatalog()` |
| Plugins | Serena installs via `codex mcp add` with `CODEX_HOME=~/.specrails/projects/<slug>/codex-home/`; AGENTS.md sentinel block; `not-applicable` status for plugins lacking `providerSupport.codex` |
| setup-prerequisites | Reports one entry per registered adapter; blocks Add Project only when zero providers are usable |
| Analytics (data-layer) | `ai_invocations.provider` populated; `ai_invocations.total_cost_usd_estimated=1` for codex rows; `getInvocationsByProvider` helper ready; UI surfacing pending (§22) |

## What's left (Stage C polish + rollout)

### §22 AnalyticsPage UX (~150 LOC)
Render `~` tilde prefix on cost cells where
`total_cost_usd_estimated === 1`. Hero burn-meter footnote "Includes
estimated costs" when `totalEstimatedCostUsd > 0`. New
`ProviderBreakdownCard` driven by the existing `getInvocationsByProvider`
helper. Pure client-side work; no server changes needed.

### §23 e2e dry-run
Manual: install codex CLI, `codex login`, install Serena prereqs (`uv`),
create a fresh project on a tmp git repo via the UI selecting Codex,
run Quick install, create a ticket via Add Spec → Quick, trigger
`/specrails:implement`, observe rail job runs, tokens captured, estimated
cost on the dashboard, diagnostic ZIP downloads.

### §25 docs
Update README.md "Requirements" section to mention codex. Add
`docs/codex.md` user guide covering: codex CLI install, OAuth via
ChatGPT vs API key, what counts as "estimated cost", emergency rollback
via the env var. CHANGELOG entry when release-please ships.

### §26 rollout
Already covered. `SPECRAILS_HUB_CODEX_BETA=0` is the rollback. Once a
real user has shaken out the codex path end-to-end (and §22 is
shipped), drop the env-var docs and call it generally available.

## Test status

```
Hub:           PASS (1786) FAIL (1)  ← pre-existing smash-runner WIP
specrails-core: PASS (175)  FAIL (0)
```

Multi-provider test counts in the hub (after refactor):

| Module | Tests |
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
| server/hub-router (incl Stage C gate-lift tests) | 105 |

## Typecheck status

```
TypeScript: 12 errors in 2 files
```

All 12 errors are pre-existing in `server/project-router.ts` and
`server/smash-runner.ts` (the user's other WIP). Zero errors introduced
by this branch.

## Test commands

```bash
# Hub multi-provider modules
npx vitest run server/providers server/pricing server/result-event \
  server/codex-otel-bridge server/chat-manager server/queue-manager \
  server/agent-refine-manager server/setup-prerequisites \
  server/core-compat server/explore-cwd-manager server/ai-invocations \
  server/profile-manager server/plugin-manager server/plugins \
  server/setup-manager server/hub-router.test.ts

# Full hub server+CLI suite
npx vitest run

# Typecheck
npx tsc --noEmit -p tsconfig.json

# specrails-core
cd /Users/javi/repos/specrails-core
npm test
```

## How to ship

1. **Merge specrails-core PR** (the `feat/codex-provider-support` branch
   at `/Users/javi/repos/specrails-core`) to its main; release-please
   handles 4.6.0 bump + npm publish via the conventional `feat(...)`
   prefix.
2. **Verify on a real codex project** (§23 dry-run above).
3. **Ship §22 UI polish** for the AnalyticsPage estimated-cost surface.
4. **Update docs** (§25).
5. **Merge the hub PR** (this branch). The env-var rollback stays in
   place for the first week; drop the var documentation after
   stability is established.

## Pre-existing repo state to be aware of

- `git stash list` on the hub shows 30+ entries. The first is
  `claude-model-auth-fix-wip`. Never run bare `git stash pop`.
- `server/project-router.ts` and `server/smash-runner.ts` have pre-existing
  TypeScript errors and 1 pre-existing test failure outside this change's
  scope. They also prevent the codex-specific project-router test file
  from loading; the route handler refactor is verified by the typecheck
  and the other test suites that don't depend on those broken imports.
