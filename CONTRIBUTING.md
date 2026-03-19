# Contributing to specrails-hub

Thank you for your interest in contributing to specrails-hub. This document covers how to set up a development environment, run tests, and submit changes.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9

## Local Setup

```bash
git clone https://github.com/fjpulidop/specrails-hub.git
cd specrails-hub
npm install
```

## Project Structure

```
specrails-hub/
├── cli/          # CLI entry point and commands
├── client/       # Web UI (Vite + React)
├── server/       # Local server (Express)
├── data/         # Static data and schemas
├── docs/         # Documentation
└── openspec/     # OpenSpec specs for this project
```

## Running Locally

```bash
# Build all packages
npm run build

# Start the hub in development mode
npm run dev
```

## Running Tests

```bash
npm test
```

Tests live in each package's `tests/` or `__tests__/` directory.

## Making Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep PRs focused — one concern per PR.
3. Run `npm test` and make sure all tests pass.
4. Build with `npm run build` and verify there are no build errors.

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add run history export
fix: correct websocket reconnect timeout
docs: update CLI reference
chore: bump vitest to latest
```

Breaking changes must be flagged with `!` or a `BREAKING CHANGE:` footer:

```
feat!: change WebSocket message protocol format
```

## Submitting a Pull Request

- Target the `main` branch.
- Write a clear PR description: what problem does it solve, how was it tested.
- Tag your PR with the appropriate label (`feat`, `fix`, `docs`, `chore`).

## Reporting Issues

Use [GitHub Issues](https://github.com/fjpulidop/specrails-hub/issues). Include:
- Your OS and Node.js version
- The command you ran
- The full error output or screenshot

## Developer Certificate of Origin (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). By submitting a pull request, you certify that you have the right to submit the code and that it can be distributed under the project's MIT License.

Sign off your commits with the `-s` flag:

```bash
git commit -s -m "feat: add run history export"
```

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
