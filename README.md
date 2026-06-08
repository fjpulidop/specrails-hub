# specrails-hub

**The local dashboard for shipping software with AI agents.**

specrails-hub turns "I'll let Claude do it" into a workflow you can see, steer, and trust. Draft specs in conversation with Claude, drag them onto execution rails, and watch the pipeline ship — all from one window, on your laptop, with every cost tracked.

It's a local-first companion to [specrails-core](https://github.com/fjpulidop/specrails-core): one window for all your projects, one place to manage specs and pipelines, one place to see what AI cost you this week.

> 100% local. Single user. No accounts. No telemetry leaving your machine. Your code stays on your laptop unless **you** spawn an agent against it.

## What you can do with it

- **Draft a spec by talking to Claude or Codex** — open Explore, describe what you want; the live draft updates each turn. Save it as a draft and come back later, or commit when it looks right.
- **Generate a spec in one shot** — Quick mode for when you already know what you want. Optionally enrich it with a "Contract Layer" of names, shapes, invariants, and a file touch list.
- **Turn a live website into a spec** — *Add Spec → From a website* opens an embedded browser. Navigate to a page, hover-select an element or drag a rectangle, and the screenshot + rich DOM + applied CSS become attachments that feed Quick or Explore. The desktop app ships its own Chromium, so it works offline.
- **Drag specs onto execution rails** — each rail is an independent lane. Run multiple specs in parallel, with different agent profiles per rail.
- **Compare two specs side by side** — drag any spec modal to the edge of the screen; a picker of your todo specs appears on the other side. Pick one and they live next to each other. Tablet-style.
- **Split a big epic** — SMASH a parent spec into a family of sub-specs in one click; the children carry short summaries on their cards.
- **Refine a spec in place** — *Continue Editing* reopens any draft / todo / backlog spec in Explore, with the original conversation resumed if there was one.
- **Track every AI cost** — every AI CLI invocation across rails, Quick spec, Explore turns, and AI edits is recorded — across **both** Claude and Codex. Codex cost is estimated from a local rate-card since the CLI doesn't report it natively. The Analytics page shows your burn rate, top tickets, breaks down spend per provider, and lets you export CSV.
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

- **Node.js 20+** (specrails-core ≥ 4.6.0 for codex projects; ≥ 4.2.0 for claude-only)
- **At least one AI CLI** on your PATH:
  - **[Claude Code](https://claude.com/claude-code)** — `claude` binary. Set `ANTHROPIC_API_KEY` to authenticate.
  - **[Codex CLI](https://developers.openai.com/codex)** ≥ 0.128.0 — `codex` binary. Run `codex login` or set `OPENAI_API_KEY`.
- **`git`**
- (Optional) **`uv`** if you want to use the Serena plugin

The provider is chosen per-project at install time and is immutable after
creation. On macOS, the desktop app handles Homebrew/Volta/nvm paths
automatically — see [docs/platforms/macos.md](docs/platforms/macos.md).
**Windows users:** see [docs/platforms/windows.md](docs/platforms/windows.md)
for Windows 10/11 specifics. For Codex-specific topics — auth, sandbox config,
estimated cost caveats, plugin support, and emergency rollback — see
[docs/codex.md](docs/codex.md).

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
| `npm run dev` | Server (4200) + client (4201) with hot reload |
| `npm run dev:desktop` | Desktop app (Tauri) in dev mode |
| `npm run build` | Production build (client + server + CLI) |
| `npm test` | vitest (server + CLI) |
| `npm run test:coverage` | Server coverage (mirrors the CI gate) |
| `npm run build:desktop` | Desktop installers — ships an **empty** `runtimes/` |
| `npm run build:desktop:local` | Self-contained desktop app (macOS arm64) |

CI gates coverage hard: 70 % global, 80 % server, 80 % client. Local runs must clear the same bars (`npm run test:coverage`, and `cd client && npm run test:coverage`).

### Building the desktop app locally

`npm run build:desktop` builds the `.app`/`.dmg`/`.exe` but does **not** assemble
the bundled Node/Git/Chromium runtimes — the resulting app falls back to your
system PATH, and the embedded browser downloads a Playwright-managed Chromium on
first use. To build a self-contained app the way CI does (**macOS arm64 only**):

```bash
# Bundle Node 22 + a relocatable Git into src-tauri/runtimes/, then build.
npm run build:desktop:local

# …and bundle Chromium too, so "Add Spec from a website" works fully offline.
# Adds a one-time ~150 MB Playwright Chromium download.
BUNDLE_CHROMIUM=true npm run build:desktop:local
```

Notes:

- **Local builds are unsigned.** Gatekeeper will warn ("unidentified developer") —
  right-click → Open, or run `xattr -dr com.apple.quarantine <App>.app`.
- Locally, Chromium is bundled **unpacked**; the app launches it straight from
  `Contents/Resources/runtimes/chromium`.
- The signed + notarized installers are produced only by the `desktop-release` CI
  workflow. There, Chromium is shipped as an obfuscated `chromium.pak` blob — the
  notarization service recurses into plain archives and would reject Chromium's
  ad-hoc-signed binaries, so the magic bytes are XOR-broken to make it opaque. The
  app reverses the XOR and extracts Chromium to `~/.specrails/runtimes/chromium`
  on first use, where Google's ad-hoc signature is enough to run it.

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
