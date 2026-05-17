# Handoff — add-multi-provider-support

This file is the running progress log for the change. It is **not** an
OpenSpec-tracked artifact — `proposal.md`, `design.md`, `specs/`, and
`tasks.md` are. Update this file when you commit work so anyone resuming the
branch sees the current state at a glance.

## Stage A — foundations + supporting modules — **DONE**

The internal infrastructure is in place. Every adapter-related primitive is
implemented and tested. The codex path inside managers is **not** yet wired
onto the adapter — that is Stage A's remaining work (sections 7–14 of
`tasks.md`).

### Branch
`feat/multi-provider-support` off `main`.

### Commits in order
1. `docs(openspec): add-multi-provider-support change with full artifact set`
2. `feat(providers): introduce ProviderAdapter contract + claude/codex adapters`
3. `feat(server): pricing table + finaliseInvocationResult + codex OTEL bridge`
4. `feat(db): ai_invocations.provider + total_cost_usd_estimated + byProvider`

### What is on disk
- `server/providers/` — `types.ts`, `registry.ts`, `claude-adapter.ts`,
  `codex-adapter.ts`, `index.ts`, `__fixtures__/{claude,codex/0.128.0}/*.jsonl`,
  plus 3 test files (71 tests, full contract coverage including real codex
  0.128.0 fixture parsing).
- `server/pricing.ts` + test — 4 codex models seeded with quarterly review
  reminder; `estimateCostUsd(providerId, model, usage)` returns null for
  unknown rate cards (no fabrication).
- `server/codex-otel-bridge.ts` + test — `createCodexOtelBridge(...)` produces
  OTLP/JSON traces+metrics+logs payloads from `AdapterEvent` streams and
  POSTs to the in-process receiver so `telemetry_blobs`, gzip-NDJSON storage,
  and the diagnostic export ZIP work identically across providers.
- `server/result-event.ts` — new `finaliseInvocationResult(adapter, events,
  opts)` returns `{ result, estimated }` integrating the pricing fallback.
  Legacy `normaliseResultEvent` kept verbatim for the un-migrated callsites.
- `server/db.ts` — migrations 18 + 19 (`provider`, `total_cost_usd_estimated`
  columns + `idx_ai_inv_project_provider`).
- `server/ai-invocations.ts` — `provider` required at TS + runtime; optional
  `total_cost_usd_estimated`; new `getInvocationsByProvider(db, projectId,
  opts)` helper.
- All existing `recordInvocation` callsites (queue-manager, chat-manager,
  agent-refine-manager, project-router/generate-spec, smash-runner, test
  fixtures) updated to pass `provider`.
- `server/index.ts` — side-effect import of `./providers` so the registry is
  populated at server start.

### What is **not** done yet in Stage A

`tasks.md` remains the source of truth. The big chunks still pending:

| Task | What it does | Why deferred |
|---|---|---|
| §5.6 | Wire `QueueManager` to instantiate the OTEL bridge when telemetry ON and `adapter.capabilities.nativeOtelEnv === false` | Lives inside the §8 QueueManager refactor |
| §6.3 | Migrate `chat-manager`, `queue-manager`, `agent-refine-manager` callsites of `normaliseResultEvent` onto `finaliseInvocationResult(adapter, events)` | Same as §7-§9 manager refactors |
| §7 | ChatManager — adapter-driven argv, real `codex exec resume`, real `thread_id` capture (no more synthetic `codex-<convId>-<timestamp>`), per-conversation event accumulator passed into `finaliseInvocationResult` | The biggest single refactor |
| §8 | QueueManager — `adapter.buildArgs('rail-job', ...)`, profile injection gate flipped from `provider==='claude'` to `capabilities.profileEnvSupport`, plugin injection from project-json to provider-aware, OTEL env vs synthetic bridge dispatch | Second-biggest refactor |
| §9 | AgentRefineManager — add codex branch via adapter; remove the hardcoded `.claude/agents/` path; provider-aware `validateAgentBody` model regex | New surface area for codex |
| §10 | SetupManager — adapter-driven argv for `setup-enrich` / `setup-enrich-resume`, real codex `thread_id`, codex skill checkpoint detection patterns | |
| §11 | project-router `/tickets/generate-spec` adapter-driven (already partly there) + `/tickets/:id/ai-edit` once §9 lands | |
| §12 | explore-cwd-manager provider-aware (AGENTS.md for codex) | |
| §13 | ProfileManager — provider optional field + adapter-driven model catalog in `validateStructural`; remove hardcoded baseline agent ids | |
| §14 | PluginManager — `providerSupport` per-plugin, codex `mcp add` install path with per-project `CODEX_HOME`, contributors target `adapter.instructionsFilename` (CLAUDE.md vs AGENTS.md) | Touches plugin contracts |
| §15.4-15.6 | Wire `byProvider` into `getSpending`; UI estimated-cost `~` badge + Hero footnote; analytics `ProviderBreakdownCard` | |
| §16 | `setup-prerequisites` reports one entry per registered provider | |
| §17 | `core-compat.detectAvailableCLIs` walks the registry instead of hardcoding `claude`+`codex` | Trivial, ~30 LOC |

## Stage B — specrails-core 4.6.0 — **NOT STARTED**

Sections 18–20 of `tasks.md`. Different repo (`/Users/javi/repos/specrails-core`).
Lift the three "coming soon" gates (provider-detect.ts, install-config.ts,
init.ts), extend scaffold.ts to deploy `.codex/skills/`, port the four rail
agents to `templates/skills/rails/sr-*/SKILL.md`, apply `codex-config.toml` +
`codex-rules.star` at scaffold time, generate a sentinel-protected
`AGENTS.md`, bump to 4.6.0, publish.

## Stage C — gate lift + UI + rollout — **NOT STARTED**

Sections 21–26 of `tasks.md`. Wait for Stage B to be on npm before merging.

## How to continue

1. Pick the next task from §7 onwards (deepest first: ChatManager is the most
   educational refactor because every other manager follows its shape).
2. For each manager:
   - Read its current file; identify every `provider`/`if (provider === ...)`
     branch.
   - Replace with `adapter.capabilities.*` checks or `adapter.method()` calls.
   - Capture events into an array, pass it to `finaliseInvocationResult` at
     close.
   - Update tests in lockstep — fixture-driven where possible.
   - Run `npx vitest run server/<manager> server/providers server/pricing
     server/result-event server/codex-otel-bridge server/ai-invocations
     server/spending` after each edit.
3. After all §7–§17 are done, the **gates can be lifted** (§21). At that
   point codex is end-to-end usable in the hub UI. Coverage thresholds
   (server ≥80 % lines/funcs/stmts, client ≥80 % lines/stmts) must hold —
   if they regress, write tests until they pass before pushing (per
   `CLAUDE.md` policy).

## Test commands

```bash
# Fast: just the new module
npx vitest run server/providers server/pricing server/result-event \
  server/codex-otel-bridge server/ai-invocations

# Full server suite
npx vitest run

# Typecheck (pre-existing errors in project-router.ts and smash-runner.ts
# are user WIP, NOT caused by this branch)
npx tsc --noEmit -p tsconfig.json

# Coverage
npm run test:coverage              # server
cd client && npm run test:coverage # client
```

## Pre-existing repo state to be aware of

The user has WIP in stashes (`git stash list` shows 30+ entries). One stash
named `claude-model-auth-fix-wip` was accidentally popped into the working
tree during early investigation but immediately reverted; it remains safe in
the stash list. Do not run bare `git stash pop` again — always use
`git stash list` first.

`server/project-router.ts` and `server/smash-runner.ts` have 12 pre-existing
TypeScript errors and 1 pre-existing test failure that are not within this
change's scope. They will be addressed by the user's separate WIP.
