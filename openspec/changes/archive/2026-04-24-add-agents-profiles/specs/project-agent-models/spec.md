## REMOVED Requirements

### Requirement: Agent model list reflects installed agents
**Reason**: The per-agent model configuration surface is moving from Project Settings into the new Agents section (tabs `Profiles` and `Models`). The model values are now sourced from the active profile's `agents[].model` field, not from each agent's frontmatter.
**Migration**: On first visit to the Agents section (or on hub upgrade), the hub migrator reads the current Project Settings agent-model values and materializes them as `<project>/.specrails/profiles/default.json`. The Project Settings section is removed and a one-time breadcrumb points users to `Agents → Profiles`. The migration is idempotent and lossless; if a `default.json` already exists, the migrator skips and warns.

### Requirement: Per-agent model selection via combobox
**Reason**: Model selection moves into the Profiles tab (per-agent, per-profile) and the Models tab (project-wide defaults). The old Settings combobox is replaced by richer surfaces in the Agents section.
**Migration**: Existing per-agent selections migrate into the auto-created `default` profile. No user data loss.

### Requirement: Apply to all agents shortcut
**Reason**: Equivalent functionality lives in the Models tab ("Apply to all defaults") and can be expressed per-profile in the Profiles tab.
**Migration**: Users who relied on the shortcut are redirected to the Models tab via the Settings breadcrumb.

### Requirement: Save persists model config
**Reason**: Persistence path changes. Model values now live in `.specrails/profiles/<name>.json`, not in `install-config.yaml` nor in `.md` frontmatter. The `applyModelConfig` path is retired.
**Migration**: Hub migrator performs a one-time write of `default.json` from existing values. Going forward, saves target the profile JSON files.

### Requirement: Agent Models section is hub-mode only
**Reason**: The section itself is removed; its replacement (the Agents section) is hub-mode only by the same principle, but documented in the `agents-section` capability instead.
**Migration**: No user action needed; the new section mirrors the hub-mode gating.

### Requirement: GET endpoint returns installed agents and models
**Reason**: The `/api/projects/:projectId/agent-models` endpoint is retired. Callers should use `/api/projects/:projectId/profiles/:name` to read the active profile (which carries per-agent models) or `/api/projects/:projectId/agents` for the raw catalog.
**Migration**: No external callers expected (internal UI only). The client is migrated to the new endpoints as part of this change.

### Requirement: PATCH endpoint applies model config
**Reason**: Retired alongside the GET endpoint. Model updates now go through `PATCH /api/projects/:projectId/profiles/:name` which writes the profile JSON after validation.
**Migration**: Internal UI migrates to the profile endpoint; `install-config.yaml` and frontmatter patching paths are deleted.
