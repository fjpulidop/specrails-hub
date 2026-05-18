# Adding a new AI provider to SpecRails Hub

The hub is provider-agnostic by design. Every manager that spawns an AI
CLI consumes a `ProviderAdapter` rather than branching on a hardcoded
`if (provider === 'claude')`. Adding a new provider is one adapter file
plus one entry in the registry. No manager code should change.

If you find yourself wanting to write `if (this._provider === 'X')` in
a manager, **the design has drifted** — find the capability you're
gating on, add a flag to `ProviderCapabilities`, and branch on the
flag instead.

## The 5-step recipe

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
  baselineAgents: () => ['sr-architect', 'sr-developer', 'sr-reviewer', 'sr-merge-resolver'],
  detectInstalled: async (): Promise<DetectionResult> => { /* `which` + `--version` */ },
}
```

The `ProviderAdapter` interface is documented in
`server/providers/types.ts`. Read the existing
`server/providers/{claude,codex}-adapter.ts` for the patterns —
SwitchAction shapes per provider, `text-delta` event normalisation
across native JSONL formats, etc.

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

Everything else — `getAdapter`, `listAdapters`, `hasAdapter`,
`detectAvailableCLIs`, `setup-prerequisites`, `POST /projects`
validation, `AddProjectDialog`'s provider selector, the
`ProviderBreakdownCard`, `Analytics` `byProvider` — picks up the new
provider automatically because they walk the registry.

### 3. (If `nativeCostUsd === false`) add pricing entries

For providers that don't report `total_cost_usd` in their terminal
event, append the rate card to `server/pricing.ts`:

```ts
'example:flagship': { inputPer1M: 5.00, outputPer1M: 15.00, cacheReadPer1M: 0.50, lastReviewedAt: '2026-05-18' },
'example:fast':     { inputPer1M: 0.50, outputPer1M:  1.50, cacheReadPer1M: 0.05, lastReviewedAt: '2026-05-18' },
```

The `finaliseInvocationResult` flow in `server/result-event.ts` will
fall back to this table automatically and stamp
`total_cost_usd_estimated = 1` on the `ai_invocations` row, which in
turn lights up the `~` tilde + Hero footnote on the AnalyticsPage.

### 4. (If `nativeOtelEnv === false`) confirm the OTEL bridge works

The synthetic OTEL bridge at `server/codex-otel-bridge.ts` is
provider-neutral despite its name — it consumes the canonical
`AdapterEvent` stream. As long as your adapter's `parseStreamLine`
emits `text-delta`, `tool-use`, `session-started`, and `result` events,
the bridge will synthesise traces / metrics / logs for free. If the
function name `createCodexOtelBridge` bugs you, it's safe to rename it
to `createSyntheticOtelBridge` — wires the same logic, all callers
updated.

### 5. (If `mcpRegistration === 'cli-add'`) wire the plugin install path

The codex MCP integration lives at `server/plugins/codex-mcp.ts`.
Mirror that file for a new `<provider>-mcp.ts` if your provider has a
similar `<binary> mcp add/remove/list` subcommand. Then update
`server/plugins/serena/install.ts` to route the new provider's
install to the right helper. The hub-level `PluginManager` already
threads `providerId` through every relevant method.

For `mcpRegistration === 'project-json'` providers, the existing
`.mcp.json` surgical-merge path applies — nothing to add.

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
  to kind: 'other'" defensive test.
- `extractResult` from a fixture-derived event sequence.
- `detectInstalled` happy / missing / non-zero-exit paths.

## Verify

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run server/providers server/pricing server/result-event server/plugin-manager
```

Then a manual smoke test: register a project via the UI with the new
provider, run a chat turn, run a rail, confirm tokens + cost land on
the AnalyticsPage.

## Don't break the principle

If anything about adding a third provider felt like more than 5 steps,
**the existing architecture has drifted from the spec** — file an
OpenSpec change at
`openspec/changes/<your-change-name>/` and capture the drift before
papering over it with a manager-level branch.
