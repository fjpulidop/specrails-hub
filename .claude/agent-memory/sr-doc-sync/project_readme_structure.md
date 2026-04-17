---
name: README structure confirmed
description: Confirmed sections and style conventions of the root README.md for specrails-hub
type: project
---

README.md at project root contains these sections in order:
- Features (bullet list, `**Bold lead**` style)
- Prerequisites
- Installation
- Quick Start
- Desktop App (added 2026-04-16)
- Architecture (includes Three-layer monorepo subsection with src-tauri/ row)
- UI Overview
- CLI: `specrails-hub` (with sub-tables)
- API (with Hub routes and Project-scoped routes tables)
- Development (includes project structure tree)
- WebSocket (message type table)
- Security
- License

**Why:** Needed as a stable reference so future doc-sync runs don't re-read the full README to locate sections.

**How to apply:** When a new feature needs documenting, check against this list to find the right section. Features bullet goes in Features; new routes go in API tables; new WS messages go in the WebSocket table; new CLI flags go in the CLI Options table.

No CHANGELOG.md exists at the project root — skip changelog updates unless it is created.

API docs are inline in README.md, not in a separate docs/ directory.

docs/ directory structure:
- docs/general/getting-started.md
- docs/general/platform-overview.md
- docs/engineering/architecture.md
- docs/engineering/configuration.md
- docs/engineering/api-reference.md
- docs/engineering/rfcs/ (do not modify)
- docs/engineering/spikes/ (do not modify)
- docs/product/features.md
- docs/product/tickets.md
- docs/product/workflows.md
- docs/product/openspec-workflow.md (do not modify)
- docs/operations/runbook.md

Project Settings in features.md has only Budget subsection — Issue Tracker, Queue, and Display were removed in the 2026-04-16 redesign.
