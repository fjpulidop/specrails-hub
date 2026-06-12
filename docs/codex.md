# Using Specrails with the Codex CLI

Specrails supports **two AI providers**: Anthropic's
[Claude Code](https://claude.com/claude-code) and OpenAI's
[Codex CLI](https://developers.openai.com/codex). You pick one or
both when you add a project; the rest of the app behaves identically
across them. (See [Running both providers in one
project](#running-both-providers-in-one-project) below.)

> The codex path is enabled by default. To temporarily disable it
> (e.g. as an emergency rollback during a beta window), set
> `SPECRAILS_CODEX_BETA=0` in the app's environment (the legacy
> `SPECRAILS_HUB_CODEX_BETA` name is still read as a fallback when the
> new variable is unset). Unset or set to `1` to re-enable.

## Prerequisites

| What | Why | How |
|---|---|---|
| `codex` CLI ≥ 0.128.0 | Earlier versions don't support `exec --json` + `exec resume` semantics the app relies on | `brew install codex` (macOS) · winget / download from https://developers.openai.com/codex (Windows / Linux) |
| Authentication | Codex needs OAuth or an API key | `codex login` (ChatGPT OAuth) or set `OPENAI_API_KEY` |
| `uv` ≥ 0.1.0 (optional) | Required if you want to install the Serena plugin | `brew install uv` · `pipx install uv` · or the curl installer at https://docs.astral.sh/uv |
| `git`, `node`, `npm`, `npx` | Same as Claude — needed for `specrails-core init` | Use your usual installer |

The app's `Add Project` dialog runs a live prerequisites check. It
disables the Codex provider checkbox with a "not found" hint when the
binary isn't on `PATH`; it shows install commands if you click "More info".

## Adding a codex project

1. Open the app UI and click **Add Project**.
2. Pick the project's path.
3. In the **AI providers** row, check **Codex** (you can check
   **Claude** too — see [Running both providers in one
   project](#running-both-providers-in-one-project)). The first
   provider you select becomes the project default.
4. Submit. The app writes `.specrails/install-config.yaml` (with
   `provider: codex` and `tier: quick` as YAML keys) and spawns
   `npx specrails-core@latest init --from-config <file>` — the provider
   and tier live in the YAML, not as CLI flags. The install produces:
   - `.codex/config.toml` — model, reasoning effort, sandbox mode, and
     approval policy (all top-level keys per the codex 0.128.0+ schema).
   - `.codex/skills/sr-*/SKILL.md` — general specrails skills
     (implement, batch-implement, why, compat-check, …).
   - `.codex/skills/rails/sr-*/SKILL.md` — the pipeline rails.
   - `AGENTS.md` — top-level instructions file with a sentinel-protected
     managed block. Anything outside the sentinels is preserved on
     updates.

   The exact rail and lifecycle skill set is produced by
   `specrails-core`, not the app, so the precise file list can vary by
   core version.

The provider **set** you choose is immutable after creation — you
can't add or remove a provider on an existing project (the on-disk
layouts are disjoint and we don't want to ask you to migrate two trees
in place). Install both up front if you want the choice later.

## Running both providers in one project

A single project can install **both** Claude and Codex. In the
**Add Project** dialog the **AI providers** control is a multi-select —
check both and the app runs each provider's install sequentially. The
first provider you select is the **primary/default**; the helper text
spells this out: *"Both engines will be set up. The first is the
project default. Cannot be changed after creation."*

Once both are installed:

- **Per-invocation engine pickers** let you choose Claude vs Codex each
  time you spawn work. The picker appears in the **Add Spec** dialog
  (`AiEngineSelector`), in the **rail header** (`RailEngineSelector`),
  and in the terminal's **Open AI CLI** menu (`CliLaunchMenu`). On
  single-provider projects these pickers don't render — there's nothing
  to choose.
- The **selected engine is remembered per project** (it defaults to the
  primary), so you don't have to re-pick on every spawn.
- **Capability intersection.** The right sidebar only shows sections
  that *every* installed provider supports. Because Codex has no agent
  profiles and no plugins, the **Agents** and **Integrations** sections
  are **hidden** while both providers are installed. Single-provider
  projects are unaffected.

When only one provider is installed the app behaves byte-identically to
a single-provider project — no engine pickers, no provider persisted on
spawns, no overrides.

## What's different vs Claude

| Surface | Claude | Codex |
|---|---|---|
| **CLI** | `claude` | `codex` |
| **Project dir** | `.claude/` | `.codex/` |
| **Instructions file** | `CLAUDE.md` | `AGENTS.md` |
| **Agent format** | `.claude/agents/<id>.md` with `model:` frontmatter | `.codex/skills/<id>/SKILL.md` Skill format |
| **Agent profiles** | Full support (rail `RailProfileSelector`) | **None** — codex rails force the profile to `null`; the Agents section is Claude-only |
| **Contract Refine** | Claude-only (it `--resume`s the Explore session and runs `/specrails:contract-refine`) | **Skipped** — toggling "Enrich with Contract Layer" on a codex spec is a no-op |
| **MCP registration** | Surgical merge of `<project>/.mcp.json` | `codex mcp add` against per-project `CODEX_HOME=~/.specrails/projects/<slug>/codex-home/` (isolated) |
| **Session resume** | `--resume <session_id>` | `exec resume <thread_id>` |
| **Native cost report** | `result.total_cost_usd` from `--output-format stream-json` | None — cost is **estimated** by the app from `turn.completed.usage` and the local pricing table at `server/pricing.ts` |
| **Telemetry** | `OTEL_EXPORTER_OTLP_*` env vars consumed by claude itself | Synthesised by the app from `codex exec --json` events and POSTed to the same in-process OTLP receiver — telemetry export ZIP works identically |

## Estimated cost

Codex does not report `total_cost_usd` natively. The app computes an
estimate from the captured `usage` (input / output / cached input
tokens × the local rate-card in `server/pricing.ts`) and stores it in
`ai_invocations.total_cost_usd` with `total_cost_usd_estimated = 1`.

The Analytics page surfaces this in two places:

- **The cost cell** in the Raw Invocations table shows a `~` prefix
  (e.g. `~$0.012`) and a tooltip explaining the fallback when you
  hover.
- **The Hero** shows a small italic suffix next to the invocation
  count (`· includes ~$X.XX estimated`) when any row in the active
  window came from the fallback.
- **A new "By provider" card** between the Hero and the Timeline
  splits per-provider cost into authoritative vs estimated columns
  whenever the project has invoked both providers.

The pricing table is reviewed quarterly. The reference date sits on
each entry as `lastReviewedAt`. If OpenAI raises prices mid-quarter,
ship an out-of-band update to `server/pricing.ts`.

## Plugins and MCP on codex projects

The **Integrations** (plugins) marketplace is a **Claude-only** capability. The app
hides the Integrations tab for any project that includes codex — both codex-only and
dual-provider (Claude + Codex) projects — because the sidebar only shows sections that
*every* installed provider supports (the capability intersection in
`provider-capabilities.ts`). So there is no in-app plugins page to install Serena on a
codex project.

To give a codex project MCP servers, register them with `codex mcp add` from your
terminal: codex chat / Explore turns spawn with your own environment and read your global
`~/.codex/config.toml`, so those servers are available natively — no extra plumbing required.

## Troubleshooting

**"codex binary not found" when adding a project** — install codex CLI
and restart the app so PATH refreshes. The app's
`/api/setup-prerequisites` endpoint surfaces the absolute path it
resolved, useful for diagnosing Homebrew-vs-npm install collisions.

**"codex 0.120.0 is older than required 0.128.0"** — upgrade. The
adapter pins the minimum because earlier versions don't support
`exec --json` or `exec resume`.

**"codex mcp add serena failed: auth missing"** — run `codex login`
or set `OPENAI_API_KEY`. The app doesn't proxy auth.

**Cost shows as `—` for codex jobs even though tokens are non-zero**
— the spawned model isn't in `server/pricing.ts` (e.g. a brand-new
model OpenAI shipped after our last review). Update the pricing table
and reload the page.

**Cost on the Hero looks too high after a long Explore session** —
remember that codex Explore uses real `exec resume`, so every turn
re-feeds the prior conversation. Long sessions accumulate input-
token cost the same way Claude's `--resume` does. The Hero footnote
calls this out.

**"Enrich with Contract Layer" did nothing on a codex spec** — that's
expected. Contract Refine is a Claude-only capability; the Add Spec UI
hides the toggle for codex, and the server skips it defensively if a
codex conversation reaches the refine path. There's no error — the
spec just commits without a Contract Layer block.

## Emergency rollback

If you need to disable the codex path, set `SPECRAILS_CODEX_BETA=0`
in the app's environment. For a source checkout that's:

```bash
SPECRAILS_CODEX_BETA=0 npm run dev
```

For the packaged desktop app, set the variable in the environment the app
process inherits (the `npm run dev` form is for source runs only).

`GET /api/available-providers` will report `codex: false` and
`POST /api/projects` will refuse new codex projects. Existing
codex projects keep functioning — only new-project gating is gated by
the env var.

## Architecture pointers (for specrails-desktop developers)

The codex integration lives in:

- `server/providers/codex-adapter.ts` — `ProviderAdapter`
  implementation for codex 0.128.0+. Fixtures under
  `server/providers/__fixtures__/codex/0.128.0/`.
- `server/pricing.ts` — local pricing table + `estimateCostUsd`.
- `server/codex-otel-bridge.ts` — synthetic OTEL traces / metrics /
  logs derived from JSONL events.
- `server/plugins/codex-mcp.ts` — `codex mcp add/remove/list` wrapper
  with per-project `CODEX_HOME`.

The contract every provider implements is at
`server/providers/types.ts`. Adding a new provider in the future is
one new adapter file + one entry in `server/providers/index.ts`.

## See also

- [Adding a provider](internals/adding-a-provider.md) — the developer
  guide to wiring a third AI CLI adapter.
- [Tracking cost](tracking-cost.md) — how the Analytics page surfaces
  per-invocation cost across every surface (including the estimated
  codex rows described above).
