# Using SpecRails Hub with the Codex CLI

SpecRails Hub supports **two AI providers**: Anthropic's
[Claude Code](https://claude.com/download) and OpenAI's
[Codex CLI](https://developers.openai.com/codex). You choose one when you
add a project; the rest of the hub behaves identically across them.

> The codex path is enabled by default. To temporarily disable it
> (e.g. as an emergency rollback during a beta window), set
> `SPECRAILS_HUB_CODEX_BETA=0` in the hub's environment. Unset or set
> to `1` to re-enable.

## Prerequisites

| What | Why | How |
|---|---|---|
| `codex` CLI ≥ 0.128.0 | Earlier versions don't support `exec --json` + `exec resume` semantics the hub relies on | `brew install codex` (macOS) · winget / download from https://developers.openai.com/codex (Windows / Linux) |
| Authentication | Codex needs OAuth or an API key | `codex login` (ChatGPT OAuth) or set `OPENAI_API_KEY` |
| `uv` ≥ 0.1.0 (optional) | Required if you want to install the Serena plugin | `brew install uv` · `pipx install uv` · or the curl installer at https://docs.astral.sh/uv |
| `git`, `node`, `npm`, `npx` | Same as Claude — needed for `specrails-core init` | Use your usual installer |

The hub's `Add Project` dialog runs a live prerequisites check. It
disables the Codex provider button with a "not found" hint when the
binary isn't on `PATH`; it shows install commands if you click "More info".

## Adding a codex project

1. Open the hub UI and click **Add Project**.
2. Pick the project's path.
3. In the **AI provider** row, click **Codex**.
4. Submit. The hub spawns `npx specrails-core@latest init --provider
   codex --quick` and produces the codex install:
   - `.codex/config.toml` — model + sandbox baseline.
   - `.codex/rules.star` — Starlark execution policy.
   - `.codex/skills/sr-*/SKILL.md` — general specrails skills
     (implement, batch-implement, why, compat-check, …).
   - `.codex/skills/rails/sr-{architect,developer,reviewer,merge-resolver}/SKILL.md`
     — the four pipeline rails.
   - `.codex/skills/{enrich,doctor}/SKILL.md` — the lifecycle commands.
   - `AGENTS.md` — top-level instructions file with a sentinel-protected
     managed block. Anything outside the sentinels is preserved on
     updates.

You can't switch a project from claude to codex (or vice versa) after
creation — the on-disk layouts are disjoint and we don't want to ask
the user to migrate two trees in place.

## What's different vs Claude

| Surface | Claude | Codex |
|---|---|---|
| **CLI** | `claude` | `codex` |
| **Project dir** | `.claude/` | `.codex/` |
| **Instructions file** | `CLAUDE.md` | `AGENTS.md` |
| **Agent format** | `.claude/agents/<id>.md` with `model:` frontmatter | `.codex/skills/<id>/SKILL.md` Skill format |
| **MCP registration** | Surgical merge of `<project>/.mcp.json` | `codex mcp add` against per-project `CODEX_HOME=~/.specrails/projects/<slug>/codex-home/` (isolated) |
| **Session resume** | `--resume <session_id>` | `exec resume <thread_id>` |
| **Native cost report** | `result.total_cost_usd` from `--output-format stream-json` | None — cost is **estimated** by the hub from `turn.completed.usage` and the local pricing table at `server/pricing.ts` |
| **Telemetry** | `OTEL_EXPORTER_OTLP_*` env vars consumed by claude itself | Synthesised by the hub from `codex exec --json` events and POSTed to the same in-process OTLP receiver — telemetry export ZIP works identically |

## Estimated cost

Codex does not report `total_cost_usd` natively. The hub computes an
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

## Plugins on codex projects

Plugins (Serena today) install on codex projects via `codex mcp add`
with a per-project `CODEX_HOME`. That means:

- Installing Serena in project A does **not** affect project B.
- The MCP servers you've added globally via `codex mcp add` from your
  terminal are not visible to the hub's codex spawns (and vice versa).
- Plugins whose manifest does not declare `providerSupport.codex` show
  as **`not-applicable`** on the codex project's Plugins page.

## Troubleshooting

**"codex binary not found" when adding a project** — install codex CLI
and restart the hub so PATH refreshes. The hub's
`/api/hub/setup-prerequisites` endpoint surfaces the absolute path it
resolved, useful for diagnosing Homebrew-vs-npm install collisions.

**"codex 0.120.0 is older than required 0.128.0"** — upgrade. The
adapter pins the minimum because earlier versions don't support
`exec --json` or `exec resume`.

**"codex mcp add serena failed: auth missing"** — run `codex login`
or set `OPENAI_API_KEY`. The hub doesn't proxy auth.

**Cost shows as `—` for codex jobs even though tokens are non-zero**
— the spawned model isn't in `server/pricing.ts` (e.g. a brand-new
model OpenAI shipped after our last review). Update the pricing table
and reload the page.

**Cost on the Hero looks too high after a long Explore session** —
remember that codex Explore uses real `exec resume`, so every turn
re-feeds the prior conversation. Long sessions accumulate input-
token cost the same way Claude's `--resume` does. The Hero footnote
calls this out.

## Emergency rollback

If you need to disable the codex path without redeploying:

```bash
SPECRAILS_HUB_CODEX_BETA=0 npm run dev
```

`GET /api/hub/available-providers` will report `codex: false` and
`POST /api/hub/projects` will refuse new codex projects. Existing
codex projects keep functioning — only new-project gating is gated by
the env var.

## Architecture pointers (for hub developers)

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
