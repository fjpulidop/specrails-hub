## Context

specrails-core installs agents as `.claude/agents/<name>.md` files with a `model:` field in YAML frontmatter. Claude Code reads this field at runtime to decide which model to spawn. `install-config.yaml` is the installer's source of truth — when the user re-runs `npx specrails-core init`, it reads the config and patches frontmatter via `sed`. Neither file is read at runtime by Claude Code; only the `.md` frontmatter matters for execution.

The hub already owns `serializeInstallConfigYaml()` and writes `install-config.yaml` during setup. No DB changes needed.

## Goals / Non-Goals

**Goals:**
- Let users change the Claude model per agent from the SettingsPage
- Apply changes immediately (no re-install required)
- Persist changes so a future `npx specrails-core init` doesn't overwrite them
- Show only agents actually installed in the project (read from filesystem)

**Non-Goals:**
- Supporting non-Claude providers (future work)
- Changing models for ChatManager or SetupManager spawns
- Presets UI (`balanced`, `budget`, `max`) — these are installer labels with no runtime semantics

## Decisions

### 1. Write order: config first, then apply

Update `install-config.yaml` first, then call `applyModelConfig(projectPath)` which reads the config and patches agent frontmatters. This mirrors the installer's own flow, avoids dual-write divergence, and makes `applyModelConfig` reusable for post-install scenarios.

Alternative considered: patch agent files directly without touching config. Rejected — a future re-install would silently reset the user's choices.

### 2. Agent discovery: read `.claude/agents/*.md` directly

Discover installed agents by globbing `.claude/agents/*.md` and parsing their frontmatter. This is the ground truth — the manifest (`.specrails/specrails-manifest.json`) in current installs (v3.3.0) doesn't list agent files.

### 3. Model values: short aliases

Store and write the short alias form (`sonnet`, `opus`, `haiku`) in frontmatter — same as the installer. The UI displays human-readable labels with full model IDs as subtitles. These map to:

| Alias   | Full ID                         |
|---------|---------------------------------|
| `sonnet`| `claude-sonnet-4-6`             |
| `opus`  | `claude-opus-4-7`               |
| `haiku` | `claude-haiku-4-5-20251001`     |

### 4. Frontmatter patching: regex replace on the `model:` line

Read the file content, replace `/^model: .+$/m` with `model: <alias>`. Same approach as `install.sh`'s `sed -i`. Safe because frontmatter is at file top and `model:` is a top-level key.

### 5. Hub mode only

The Agent Models section is hidden in legacy mode (same guard as Pipeline Telemetry). In legacy mode there is no active project context and no `install-config.yaml` path.

### 6. "No agents installed" state

If `.claude/agents/` doesn't exist or is empty, show an empty state message: "No specrails agents installed in this project."

## Risks / Trade-offs

- **Frontmatter regex brittleness** → The `model:` key is always a top-level frontmatter field written by specrails-core with no indentation. The regex `/^model: .+$/m` is safe.
- **Stale UI after manual edit** → If a user edits agent files manually, the UI will reflect the actual file state on next load (reads from filesystem, not from config).
- **install-config.yaml absent** → Some projects may not have this file (older installs, manual setup). Handle gracefully: read current models from agent files only, create the config file on first PATCH.

## Open Questions

None — design is fully resolved from exploration.
