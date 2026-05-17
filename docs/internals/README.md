# Internals

These docs are for contributors and people building on the hub's API. They describe how the hub works under the hood, not how to use it.

If you're a user looking for **how do I do X?** docs, head back to the [user guides](../).

## Contents

| Doc | What it covers |
|-----|----------------|
| [architecture.md](architecture.md) | Server modules, client layout, WebSocket protocol, process spawning, security model |
| [api-reference.md](api-reference.md) | REST endpoint catalogue under `/api/hub/*` and `/api/projects/:projectId/*` |
| [configuration.md](configuration.md) | Settings, env vars, kill switches, advanced flags |
| [operations-runbook.md](operations-runbook.md) | Start/stop, port conflicts, recovery procedures, backups |
| [openspec-workflow.md](openspec-workflow.md) | `opsx:*` change lifecycle — used by the hub itself for structured change management |
| [profiles.md](profiles.md) | Agent profile internals: file format, resolution order, snapshotting |

## Contributing

For coding conventions, file naming, the coverage policy, and how WebSocket handlers are expected to be wired, see [`CLAUDE.md`](../../CLAUDE.md) at the repo root. That file is the authoritative source for project-wide rules.

When adding a feature, follow the OpenSpec workflow: `/opsx:new → /opsx:ff → /opsx:apply → /opsx:verify → /opsx:archive`. The `opsx:*` skill files in `.claude/skills/` document each step.
