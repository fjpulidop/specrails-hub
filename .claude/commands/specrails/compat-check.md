---
name: "Compatibility Impact Analyzer"
description: "Snapshot the current API surface and detect breaking changes against a prior baseline. Generates a migration guide when breaking changes are found."
category: Workflow
tags: [workflow, compatibility, breaking-changes, migration]
---

Analyze the API surface of **specrails-hub** for backwards compatibility. Extracts the current contract surface (CLI flags, template placeholders, command names, argument flags, agent names, config keys), compares against a stored baseline, classifies each change by severity, and generates a migration guide when breaking changes are found.

**Input:** `$ARGUMENTS` — optional flags:
- `--diff` — compare current surface to most recent snapshot (default when snapshots exist)
- `--snapshot` — capture current surface and save without diffing (default on first run)
- `--since <date>` — diff against snapshot from this date (ISO format: YYYY-MM-DD)
- `--propose <change-dir>` — diff proposed changes in `openspec/changes/<change-dir>/` against current surface
- `--dry-run` — run all phases but skip saving the snapshot

---

## Phase 0: Argument Parsing

Parse `$ARGUMENTS` to set runtime variables.

**Variables to set:**

- `MODE` — string, one of `"snapshot"`, `"diff"`, `"propose"`. Default: `"diff"` if `.claude/compat-snapshots/` contains any `.json` files; `"snapshot"` otherwise.
- `COMPARE_DATE` — string (ISO date) or empty string. Default: `""` (use most recent snapshot).
- `PROPOSE_DIR` — string or empty string. Default: `""`.
- `DRY_RUN` — boolean. Default: `false`.

**Parsing rules:**

1. Scan `$ARGUMENTS` for `--snapshot`. If found, set `MODE=snapshot`.
2. Scan for `--diff`. If found, set `MODE=diff`.
3. Scan for `--since <date>`. If found, set `COMPARE_DATE=<date>` and (if `MODE` not already set to `snapshot`) set `MODE=diff`.
4. Scan for `--propose <change-dir>`. If found, set `PROPOSE_DIR=<change-dir>` and `MODE=propose`.
   - Verify `openspec/changes/<change-dir>/` exists. If not: print `Error: no change found at openspec/changes/<change-dir>/` and stop.
5. Scan for `--dry-run`. If found, set `DRY_RUN=true`.
6. Apply default-mode logic if `MODE` is not yet set: check whether `.claude/compat-snapshots/` exists and contains `.json` files. If yes: `MODE=diff`. If no: `MODE=snapshot`.

**Verify prerequisites:**

- Check whether `templates/` directory exists. If not: print `Error: templates/ not found — is this a specrails repo?` and stop.
- Check whether `install.sh` exists. If not: set `INSTALLER_AVAILABLE=false`. Otherwise set `INSTALLER_AVAILABLE=true`.

**Print active configuration:**

```
Mode: <MODE> | Compare date: <COMPARE_DATE or "latest"> | Dry-run: <true/false>
```

---

## Phase 1: Extract Current Surface

Read the codebase and build the surface snapshot.

**Surface categories:** `installer_flags`, `template_placeholders`, `command_names`, `command_arguments`, `agent_names`, `config_keys`

Build the surface object:

```json
{
  "schema_version": "1",
  "captured_at": "<ISO 8601 datetime>",
  "git_sha": "<git rev-parse HEAD or 'unknown'>",
  "git_branch": "<git rev-parse --abbrev-ref HEAD or 'unknown'>",
  "surfaces": {
    "installer_flags": [...],
    "template_placeholders": [...],
    "command_names": [...],
    "command_arguments": [...],
    "agent_names": [...],
    "config_keys": [...]
  }
}
```

If `MODE=snapshot`: proceed directly to Phase 5.

---

## Phase 2: Load Baseline

For `diff` mode: load most recent snapshot (or by `COMPARE_DATE`) from `.claude/compat-snapshots/`.
For `propose` mode: load most recent snapshot + read `openspec/changes/<PROPOSE_DIR>/design.md`.

---

## Phase 3: Diff and Classify

For each surface category, compute removed/added/changed elements and classify:
- Category 1: Removal (BREAKING — MAJOR)
- Category 2: Rename (BREAKING — MAJOR)
- Category 3: Signature Change (BREAKING or MINOR)
- Category 4: Behavioral Change (ADVISORY)

---

## Phase 4: Generate Report

```
## Compatibility Impact Report — specrails-hub
Date: <ISO date> | Commit: <git_short_sha or "unknown">

### Surface Snapshot
| Category | Elements Found |
|----------|---------------|
| Installer flags | N |
| Template placeholders | N |
| Command names | N |
| Command argument flags | N |
| Agent names | N |
| Config keys | N |

### Breaking Changes (N found)
[list or "None detected."]

### Advisory Changes (N found)
[list or "None detected."]
```

Include Migration Guide blocks for each breaking change.

---

## Phase 5: Save Snapshot

If `DRY_RUN=true`: print `Snapshot not saved — dry-run mode`.

Otherwise: save to `.claude/compat-snapshots/<YYYY-MM-DD>-<git_short_sha>.json`.

Check `.gitignore` — suggest adding `.claude/compat-snapshots/` if missing.
