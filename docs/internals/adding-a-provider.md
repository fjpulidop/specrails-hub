# Adding a new AI provider to SpecRails Hub

The hub is provider-agnostic by design. Every manager that spawns an AI
CLI consumes a `ProviderAdapter` rather than branching on a hardcoded
`if (provider === 'claude')`. Adding a new provider is mostly one adapter
file plus one entry in the registry — but the codebase still carries a
handful of `'claude' | 'codex'` type unions and two hardcoded provider
lists that you must widen by hand today. Those are tracked in the
**Type-union widening** and **Manual wiring still required** sections
below.

If you find yourself wanting to write `if (this._provider === 'X')` in
a manager, **the design has drifted** — find the capability you're
gating on, add a flag to `ProviderCapabilities`, and branch on the
flag instead.

## The recipe

### 1. Implement the adapter

Create `server/providers/<id>-adapter.ts` exporting a `const` of type
`ProviderAdapter`:

```ts
import type { ProviderAdapter, SpawnAction, SpawnOptions, AdapterEvent, NormalisedResult, DetectionResult } from './types'

const MODELS = [
  { value: 'flagship', label: 'Provider X Flagship', default: true as const },
  { value: 'fast',     label: 'Provider X Fast' },
] as const

export const exampleAdapter: ProviderAdapter = {
  id: 'example',
  displayName: 'Example CLI',
  binary: 'example',
  minCliVersion: '1.0.0',
  projectDirName: '.example',
  instructionsFilename: 'EXAMPLE.md',
  mcpRegistration: 'cli-add', // or 'project-json'
  capabilities: {
    nativeResume: true,
    nativeStreamJson: true,
    nativeCostUsd: false,    // if false, add the provider:model entries to server/pricing.ts
    nativeOtelEnv: false,    // if false, the hub will synthesise OTEL via the bridge
    profileEnvSupport: true,
    systemPromptArg: false,
  },
  modelCatalog: () => MODELS,
  defaultModel: () => 'flagship',
  buildArgs: (action: SpawnAction, opts: SpawnOptions): string[] => { /* per-action argv */ },
  parseStreamLine: (line: string): AdapterEvent | null => { /* line → canonical event */ },
  extractResult: (events): NormalisedResult => { /* events → tokens/cost/session */ },
  baselineAgents: () => ['sr-architect', 'sr-developer', 'sr-reviewer'],
  detectInstalled: async (): Promise<DetectionResult> => { /* `which` + `--version` */ },
}
```

The `ProviderAdapter` interface is documented in
`server/providers/types.ts`. Read the existing
`server/providers/{claude,codex}-adapter.ts` for the patterns —
`SpawnAction` shapes per provider, `text-delta` event normalisation
across native JSONL formats, etc. Note the shipped baseline is the
three-agent trio `['sr-architect', 'sr-developer', 'sr-reviewer']`;
`ProfileManager` validation requires exactly your `baselineAgents()` to
be present in every profile chain, so don't add agents your scaffold
won't actually create.

`parseStreamLine` returns `null` for empty input lines **and** for lines
that fail `JSON.parse` (see `server/providers/codex-adapter.ts`); unknown
JSON event types resolve to `{ kind: 'other' }`. Write your tests
accordingly — don't assume null-only-on-empty.

### 2. Register it

Append the import to `server/providers/index.ts`:

```ts
import { register } from './registry'
import { claudeAdapter } from './claude-adapter'
import { codexAdapter } from './codex-adapter'
import { exampleAdapter } from './example-adapter' // ← add this

register(claudeAdapter)
register(codexAdapter)
register(exampleAdapter) // ← and this
```

**Truly automatic** (these walk the registry, so they pick up the new
provider with zero edits):

- `getAdapter` / `listAdapters` / `hasAdapter` (`server/providers/registry.ts`).
- `detectAvailableCLIs` (`server/core-compat.ts`).
- `POST /api/hub/projects` provider validation (`server/hub-router.ts`,
  via `hasAdapter` / `listAdapters`).
- `setup-prerequisites` provider rows (`server/setup-prerequisites.ts`,
  iterates `listAdapters()`).
- Analytics `byProvider` (`server/spending.ts`) and the
  `ProviderBreakdownCard` (`client/src/components/analytics/ProviderBreakdownCard.tsx`).

**Manual wiring still required** (these hardcode `claude` / `codex`
today and will NOT surface a 4th provider until edited):

- `GET /api/hub/available-providers` (`server/hub-router.ts`) returns a
  literal `{ claude, codex }` shape — add your key.
- `AddProjectDialog` (`client/src/components/AddProjectDialog.tsx`)
  hardcodes `PROVIDER_ORDER = ['claude', 'codex']` and reads
  `data.claude` / `data.codex` explicitly. Without editing it the
  provider won't appear in the Add Project UI.
- `providerInstallUrl` / `providerInstallHint`
  (`server/setup-prerequisites.ts`) have generic `default:` fallbacks so
  nothing crashes, but a good install hint needs a `case` for your id.

### Type-union widening

A 4th provider is a **compile-time blocker** until you widen the
`'claude' | 'codex'` unions still scattered across the server. The build
fails until they're widened (or migrated to a shared `ProviderId`):

- `CliProvider` (`server/hub-db.ts`) — the canonical project-row provider type.
- `SpecProvider` (`server/spec-models.ts`).
- The inline `'claude' | 'codex'` unions in `server/queue-manager.ts`
  (`EnqueueOptions.provider`, `_jobProviderSelection`),
  `server/chat-manager.ts`, `server/agent-refine-manager.ts`, and
  `server/project-registry.ts`.

Expect to widen roughly eight unions. The long-term goal is to delete
them in favour of a single `ProviderId` derived from the registry — if
you add a new hardcoded site instead of widening the existing ones, file
an OpenSpec change first (see the closing section).

### 3. (If `nativeCostUsd === false`) add pricing entries

For providers that don't report `total_cost_usd` in their terminal
event, append the rate card to `server/pricing.ts`:

```ts
'example:flagship': { inputPer1M: 5.00, outputPer1M: 15.00, cacheReadPer1M: 0.50, lastReviewedAt: '2026-05-18' },
'example:fast':     { inputPer1M: 0.50, outputPer1M:  1.50, cacheReadPer1M: 0.05, lastReviewedAt: '2026-05-18' },
```

The `finaliseInvocationResult` flow in `server/result-event.ts` falls
back to this table automatically and returns an `estimated` flag that
`recordInvocation` (`server/ai-invocations.ts`) persists as
`total_cost_usd_estimated = 1` on the `ai_invocations` row, which in
turn lights up the `~` tilde + Hero footnote on the AnalyticsPage.

### 4. (If `nativeOtelEnv === false`) confirm the OTEL bridge works

The synthetic OTEL bridge at `server/codex-otel-bridge.ts` is
provider-neutral despite its name — it consumes the canonical
`AdapterEvent` stream. As long as your adapter's `parseStreamLine`
emits `text-delta`, `tool-use`, `session-started`, and `result` events,
the bridge will synthesise traces / metrics / logs for free. The
exported factory is still named `createCodexOtelBridge`; if that bugs
you, renaming it to `createSyntheticOtelBridge` (and updating callers)
is safe — same logic.

### 5. (If `mcpRegistration === 'cli-add'`) wire the plugin install path

The codex MCP integration lives at `server/plugins/codex-mcp.ts`.
Mirror that file for a new `<provider>-mcp.ts` if your provider has a
similar `<binary> mcp add/remove/list` subcommand. Then update
`server/plugins/serena/install.ts`, which routes to the CLI-add helper
whenever `getAdapter(providerId).mcpRegistration === 'cli-add'`. The
hub-level `PluginManager` already threads `providerId` through every
relevant method.

For `mcpRegistration === 'project-json'` providers, the existing
`.mcp.json` surgical-merge path applies — nothing to add.

## Known gotchas

- **Legacy result path.** `normaliseResultEvent(event, provider)`
  (`server/result-event.ts`) is still live for any callsite not yet
  migrated to `finaliseInvocationResult`. It only special-cases
  `provider === 'claude'`; everything else falls into the non-claude
  (codex-shaped) branch. A 4th provider hitting that path would be
  silently parsed as codex — migrate the callsite or extend the branch.
- **Rail slash-command translation is provider-specific.** In
  `server/queue-manager.ts` the rail prompt builder rewrites
  `/specrails:<name>` → `$<name>` for codex (so codex picks up the
  matching `.codex/skills/<name>/SKILL.md`), while claude passes the
  command verbatim. A new adapter falls through to the claude branch
  (verbatim). If your CLI needs a different invocation syntax, add a
  branch keyed on a capability, not on the provider id.

## Drop a fixture set

Add a JSONL capture of a real `<binary> exec --json` (or whatever your
CLI's JSONL flag is) under
`server/providers/__fixtures__/<id>/<minCliVersion>/`. The adapter's
test suite consumes these so future CLI-version bumps surface schema
drift loudly instead of silently.

## Write the tests

Mirror the test layout under `server/providers/<id>-adapter.test.ts`.
Required coverage:

- Identity: id / binary / projectDirName / instructionsFilename /
  mcpRegistration / capability flags / model catalog.
- `buildArgs` for every `SpawnAction` the manager flow uses (today:
  `chat-turn`, `chat-resume`, `rail-job`, `spec-gen`, `agent-refine`,
  `setup-enrich`, `setup-enrich-resume`, `auto-title`).
- `parseStreamLine` per event type, including an "unknown type maps
  to kind: 'other'" defensive test and a "returns null on empty input
  and on unparseable JSON" test.
- `extractResult` from a fixture-derived event sequence.
- `detectInstalled` happy / missing / non-zero-exit paths.

## Verify

```bash
npm run typecheck
npx vitest run server/providers server/pricing server/result-event server/plugin-manager
```

`npm run typecheck` runs `tsc --noEmit` for both the server and the
client — important here, because the type-union widening above touches
types both halves import, and a missed union surfaces only on the side
you didn't check.

Then a manual smoke test: register a project via the UI with the new
provider, run a chat turn, run a rail, confirm tokens + cost land on
the AnalyticsPage.

## Don't break the principle

The drift inventory above — the two hardcoded provider lists, the ~8
`'claude' | 'codex'` unions, the legacy `normaliseResultEvent` branch,
and the provider-specific rail rewrite — is the current debt. The
long-term goal is to delete every one of those sites in favour of a
registry-derived `ProviderId` so that adding a fifth provider really is
just the adapter file plus the registry entry. If you find a NEW
hardcoded `if (provider === 'X')` site that this guide doesn't list,
**the architecture has drifted further** — file an OpenSpec change at
`openspec/changes/<your-change-name>/` and capture the drift before
papering over it with another manager-level branch.
