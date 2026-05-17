# specrails-hub

**The local dashboard for shipping software with AI agents.**

specrails-hub turns "I'll let Claude do it" into a workflow you can see, steer, and trust. Draft specs in conversation with Claude, drag them onto execution rails, and watch the pipeline ship — all from one window, on your laptop, with every cost tracked.

It's a local-first companion to [specrails-core](https://github.com/fjpulidop/specrails-core): one window for all your projects, one place to manage specs and pipelines, one place to see what AI cost you this week.

> 100% local. Single user. No accounts. No telemetry leaving your machine. Your code stays on your laptop unless **you** spawn an agent against it.

## What you can do with it

- **Draft a spec by talking to Claude** — open Explore, describe what you want; the live draft updates each turn. Save it as a draft and come back later, or commit when it looks right.
- **Generate a spec in one shot** — Quick mode for when you already know what you want. Optionally enrich it with a "Contract Layer" of names, shapes, invariants, and a file touch list.
- **Drag specs onto execution rails** — each rail is an independent lane. Run multiple specs in parallel, with different agent profiles per rail.
- **Compare two specs side by side** — drag any spec modal to the edge of the screen; a picker of your todo specs appears on the other side. Pick one and they live next to each other. Tablet-style.
- **Split a big epic** — SMASH a parent spec into a family of sub-specs in one click; the children carry short summaries on their cards.
- **Refine a spec in place** — *Continue Editing* reopens any draft / todo / backlog spec in Explore, with the original conversation resumed if there was one.
- **Track every AI cost** — every Claude CLI invocation across rails, Quick spec, Explore turns, and AI edits is recorded. The Analytics page shows your burn rate, top tickets, and lets you export CSV.
- **Customise everything** — three themes, font sizes, terminal preferences, agent profiles, plugin integrations (Serena bundled today).

## How specrails-hub looks

```
┌──────────┬───────────────────────────────────────────────────┐
│          │  Dashboard · Jobs · Analytics · Agents · ⚙        │
│   Arc    │ ──────────────────────────────────────────────── │
│  side-   │                                                   │
│   bar    │   SpecsBoard            │   Rails                 │
│          │   (your specs)          │   (execution lanes)     │
│ projects │                         │                         │
│          │   #1  Login flow ●      │   ▶ Rail 1   #1 #2     │
│ + Add    │   #2  Webhook retry     │     [profile: default]  │
│          │   #3  Cost limits  ●    │                         │
│          │                         │   ▶ Rail 2   running    │
│          │                         │     [profile: budget]   │
│   ⚙      │                         │                         │
└──────────┴───────────────────────────────────────────────────┘
                  ⌥ Terminal panel (Cmd+J)
```

## Quick start

```bash
# 1. Install
npm install -g specrails-hub

# 2. Start the hub
specrails-hub start

# 3. Add a project from the CLI…
specrails-hub add /path/to/your/project

# …or click "+ Add project" in the dashboard sidebar at
#   http://127.0.0.1:4200
```

If the project doesn't have specrails-core yet, the setup wizard walks you through installing it. One flow, no tier picker. Total time: about a minute on a warm cache.

**Prefer a desktop app?** Download a signed build for macOS or Windows from `https://specrails.dev/downloads/specrails-hub/latest/`. The desktop app bundles the server, so you don't need a separate `start` command.

## Prerequisites

- **Node.js 20+**
- **`claude` CLI** ([Claude Code](https://claude.com/claude-code))
- **`git`**
- (Optional) **`uv`** if you want to use the Serena plugin

Set `ANTHROPIC_API_KEY` in your shell so the Claude CLI can authenticate. On macOS, the desktop app handles Homebrew/Volta/nvm paths automatically — see [docs/platforms/macos.md](docs/platforms/macos.md).

## Documentation

User guides:

| Guide | What it covers |
|-------|----------------|
| [Getting started](docs/getting-started.md) | Install, register a project, run your first pipeline |
| [Creating specs](docs/creating-specs.md) | Quick vs Explore, drafts, SMASH, Compare, Continue Editing |
| [Running pipelines](docs/running-pipelines.md) | Rails, jobs, agent profiles, plugins |
| [Tracking cost](docs/tracking-cost.md) | Analytics page, exports, per-ticket spending |
| [Customising the hub](docs/customizing.md) | Themes, settings, telemetry, kill switches |
| [Terminal panel](docs/terminal.md) | Keyboard shortcuts, shell integration, drag-and-drop |
| [CLI reference](docs/cli.md) | Every command grouped by task |

Platform notes:

- [macOS](docs/platforms/macos.md) — GUI-launch PATH, broken-symlink detection
- [Windows](docs/platforms/windows.md) — installer formats, SmartScreen, ConPTY

Contributing or extending:

- [`docs/internals/`](docs/internals/) — architecture, REST reference, operations runbook, OpenSpec workflow, profile internals

## Development

```bash
git clone https://github.com/fjpulidop/specrails-hub.git
cd specrails-hub
npm install                        # root deps (server + CLI)
cd client && npm install && cd ..  # client deps (separate tree)
npm run dev                        # server (4200) + client (4201)
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Server + client with hot reload |
| `npm run build` | Production build |
| `npm test` | vitest |
| `npm run tauri dev` | Run desktop app in dev mode |

CI gates coverage hard: 70 % global, 80 % server, 80 % client. Local runs must clear the same bars.

## Security model

- Binds to `127.0.0.1` only. **Do not expose to a network.**
- No authentication (single-user local tool).
- Parameterised SQL throughout.
- Reserved paths in your project (`.mcp.json`, `.specrails/plugins/state.json`, `.specrails/profiles/.user-preferred.json`) are mutated surgically — read, modify owned keys, atomic rename — so adding plugin N+1 never disturbs plugin N's state.

## Support

If specrails-hub saves you time, you can buy me a coffee on [Ko-fi](https://ko-fi.com/D1D81Y002C). It funds development of the open-source ecosystem.

[![Donate on Ko-fi](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B?logo=kofi&logoColor=white&style=flat-square)](https://ko-fi.com/D1D81Y002C)

## License

MIT
