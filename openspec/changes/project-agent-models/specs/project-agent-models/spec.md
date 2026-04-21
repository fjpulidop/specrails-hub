## ADDED Requirements

### Requirement: Agent model list reflects installed agents
The system SHALL discover installed agents by reading `.claude/agents/*.md` in the project directory and extract the current `model:` value from each file's YAML frontmatter. Only agents present on disk SHALL appear in the UI.

#### Scenario: Project has agents installed
- **WHEN** the user opens the Agent Models settings section
- **THEN** a combobox row appears for each `.md` file found in `.claude/agents/` (excluding subdirectories like `personas/`)
- **AND** each row shows the agent name and its current model value read from frontmatter

#### Scenario: Project has no agents installed
- **WHEN** `.claude/agents/` does not exist or contains no `.md` files
- **THEN** the section shows an empty state: "No specrails agents installed in this project."

### Requirement: Per-agent model selection via combobox
The system SHALL render a premium combobox for each installed agent that displays available Claude models as selectable options. The combobox SHALL show the model's human-readable label, full model ID, and a cost/capability indicator.

Available models (alias → full ID):
- `sonnet` → `claude-sonnet-4-6` (Balanced)
- `opus` → `claude-opus-4-7` (Most capable)
- `haiku` → `claude-haiku-4-5-20251001` (Fastest)

#### Scenario: User opens model combobox for an agent
- **WHEN** the user clicks the combobox for an agent
- **THEN** all three model options appear with label, full ID subtitle, and tier badge
- **AND** the current model is visually marked as selected

#### Scenario: User selects a different model
- **WHEN** the user selects a model from the combobox
- **THEN** the combobox updates immediately to reflect the selection (optimistic UI)
- **AND** the selection is pending until the user saves

### Requirement: Apply to all agents shortcut
The system SHALL provide an "Apply to all" control that sets all agent comboboxes to the same model in a single action.

#### Scenario: User applies a model globally
- **WHEN** the user selects a model in the "Apply to all" combobox and confirms
- **THEN** all per-agent comboboxes update to the selected model
- **AND** the change is pending until the user saves

### Requirement: Save persists model config
The system SHALL write changes on explicit Save action. The save operation SHALL:
1. Update `install-config.yaml` (`models.defaults` and `models.overrides`) via the existing serialization path
2. Call `applyModelConfig` which reads the updated config and patches `model:` in each `.claude/agents/*.md` frontmatter

#### Scenario: User saves model changes
- **WHEN** the user clicks Save
- **THEN** the server writes `install-config.yaml` with the new defaults/overrides
- **AND** patches all agent frontmatter files
- **AND** shows a success toast

#### Scenario: Save fails due to filesystem error
- **WHEN** the server cannot write to `install-config.yaml` or an agent file
- **THEN** returns HTTP 500
- **AND** the UI shows an error toast
- **AND** agent comboboxes revert to their pre-save state

### Requirement: Agent Models section is hub-mode only
The Agent Models card SHALL only render when the hub is running in hub mode (active project context exists). It SHALL be hidden in legacy single-project mode.

#### Scenario: Hub mode active
- **WHEN** `activeProjectId` is non-null
- **THEN** the Agent Models card is visible in SettingsPage

#### Scenario: Legacy mode
- **WHEN** `activeProjectId` is null
- **THEN** the Agent Models card is not rendered

### Requirement: GET endpoint returns installed agents and models
`GET /api/projects/:projectId/agent-models` SHALL return the list of installed agents with their current model values read from agent frontmatter files.

#### Scenario: Agents exist
- **WHEN** GET is called and `.claude/agents/*.md` exist
- **THEN** returns `{ agents: [{ name, model }] }`

#### Scenario: No agents installed
- **WHEN** GET is called and no agent files exist
- **THEN** returns `{ agents: [] }`

### Requirement: PATCH endpoint applies model config
`PATCH /api/projects/:projectId/agent-models` SHALL accept `{ defaultModel, overrides }`, write `install-config.yaml`, and apply models to agent frontmatter.

#### Scenario: Valid PATCH request
- **WHEN** PATCH is called with `{ defaultModel: "sonnet", overrides: { "sr-architect": "opus" } }`
- **THEN** `install-config.yaml` is updated with `defaults.model = "sonnet"` and `overrides = { sr-architect: opus }`
- **AND** each agent's `.md` frontmatter `model:` is patched (override takes precedence over default)
- **AND** returns HTTP 200 with the updated agent list

#### Scenario: Invalid model value
- **WHEN** PATCH is called with an unrecognized model alias
- **THEN** returns HTTP 400 with a descriptive error
