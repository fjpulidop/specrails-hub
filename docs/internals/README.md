# Internals

These docs are primarily for contributors and people building on the hub's API. They mostly describe how the hub works under the hood — though a couple (like the profiles quick start) double as practical how-tos.

If you're a user looking for **how do I do X?** docs, head back to the [user guides](../README.md).

## Contents

| Doc | What it covers |
|-----|----------------|
| [architecture.md](architecture.md) | Server modules, client layout, WebSocket protocol, process spawning, security model |
| [api-reference.md](api-reference.md) | REST endpoint catalogue under `/api/hub/*` and `/api/projects/:projectId/*` |
| [configuration.md](configuration.md) | Settings, env vars, kill switches, advanced flags |
| [operations-runbook.md](operations-runbook.md) | Start/stop, port conflicts, recovery procedures, backups |
| [openspec-workflow.md](openspec-workflow.md) | `opsx:*` change lifecycle — used by the hub itself for structured change management |
| [adding-a-provider.md](adding-a-provider.md) | How to add a new AI CLI: one adapter file plus one entry in the registry |
| [profiles.md](profiles.md) | Agent profiles quick start: open the Agents section, pick a profile per rail at launch, author custom agents in Agent Studio. For the true file-format and snapshotting internals, read `server/profile-manager.ts` and the profile-manager section of `CLAUDE.md` |

**See also:** [`../codex.md`](../codex.md) for the multi-provider model (Claude Code + Codex CLI as first-class engines).

## Contributing

For coding conventions, file naming, the coverage policy, and how WebSocket handlers are expected to be wired, see [`CLAUDE.md`](../../CLAUDE.md) at the repo root. That file is the authoritative source for project-wide rules.

When adding a feature, follow the OpenSpec workflow: `/opsx:new → /opsx:ff → /opsx:apply → /opsx:verify → /opsx:archive`. The `/opsx:*` invocations resolve to command files under `.claude/commands/opsx/*.md` (the related skills under `.claude/skills/` are named `openspec-*`).
