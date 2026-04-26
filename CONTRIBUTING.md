# Contributing to specrails-hub

Thank you for your interest in contributing to specrails-hub. This document covers how to set up a development environment, run tests, and submit changes.

## Prerequisites

- **Node.js** >= 20 (matches the specrails-core ≥ 4.2.0 engine requirement)
- **npm** >= 10
- **claude** CLI on your PATH ([Claude Code](https://claude.ai/claude-code)) — needed to test job spawning
- **OS:** macOS, Linux, or Windows 10/11 (1809+). The hub is cross-platform; the desktop build ships as `.dmg` (macOS) and `.exe`/`.msi` (Windows). See [docs/windows.md](docs/windows.md) for Windows-specific notes.

## Local Setup

```bash
git clone https://github.com/fjpulidop/specrails-hub.git
cd specrails-hub

# Install server + CLI dependencies
npm install

# Install client dependencies (separate node_modules tree)
cd client && npm install && cd ..
```

> **Note:** This repo has two separate `node_modules` trees — one at the root (server + CLI) and one inside `client/` (Vite + React). Both installs are required. If you see `sh: tsc: command not found` during `npm run build`, one of them is missing.

## Project Structure

```
specrails-hub/
├── cli/          # CLI bridge (specrails-hub command)
├── client/       # Web UI (Vite + React + Tailwind v4)
├── server/       # Express server (API + WebSocket + SQLite)
├── docs/         # Documentation portal source
├── CLAUDE.md     # Claude Code project instructions
└── CONTRIBUTING.md
```

## Running Locally

```bash
npm run dev          # Start server (4200) + client (4201) concurrently
npm run dev:server   # Server only with tsx watch
npm run dev:client   # Vite dev client only
```

The client (port 4201) proxies all `/api` and `/hooks` requests to the server (port 4200). Access the dashboard at `http://localhost:4201` in development.

## Running Tests

```bash
npm test             # Run vitest (server + CLI tests)
npm run test:watch   # Vitest in watch mode
```

Run a single file:

```bash
npx vitest run server/db.test.ts
```

Tests use `:memory:` SQLite databases. No cleanup or external services required.

## TypeScript Check

```bash
npm run typecheck    # Checks both server and client
```

Both `server/` and `client/` have separate TypeScript configurations. Typecheck runs both. CI blocks on any TypeScript error.

## Making Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep PRs small and focused — one concern per PR.
3. Run `npm run typecheck` — fix any TypeScript errors.
4. Run `npm test` — all tests must pass.
5. Run `npm run build` — verify there are no build errors.

## Conventions

- **File naming:** kebab-case for server/CLI files, PascalCase for React components
- **No magic strings:** use constants or enums
- **No `any`** unless genuinely unavoidable
- **API calls in client:** always use `getApiBase()` from `lib/api.ts`, never hardcode `/api/...`
- **State per project:** never use module-level caches that could bleed between projects — use `useProjectCache` or per-project Maps in refs
- **WS handlers:** always filter `msg.projectId` against active project via ref, not stale closure

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add run history export
fix: correct websocket reconnect timeout
docs: update CLI reference
chore: bump vitest to latest
refactor: extract metrics aggregation
```

Commit prefixes affect automated versioning: `feat:` → minor bump, `fix:` → patch bump, `feat!:` → major bump.

Breaking changes must be flagged with `!` or a `BREAKING CHANGE:` footer:

```
feat!: change WebSocket message protocol format
```

## Submitting a Pull Request

- Target the `main` branch.
- Write a clear PR description: what problem does it solve, how was it tested.
- CI must pass (typecheck + vitest) before merge.
- One approving review required.
- Tag your PR with the appropriate label (`feat`, `fix`, `docs`, `chore`).

## Testing Guidelines

- Write tests for all critical paths
- Use real SQLite `:memory:` databases — do not mock the database
- Server-side tests go in `server/*.test.ts`
- Client-side tests go in `client/src/**/__tests__/*.test.tsx`

```typescript
// Good: real in-memory DB
const db = initDb(':memory:')

// Bad: mock
vi.mock('./db')
```

## Reporting Issues

Use [GitHub Issues](https://github.com/fjpulidop/specrails-hub/issues). Include:
- Your OS and Node.js version
- The command you ran
- The full error output or screenshot

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
