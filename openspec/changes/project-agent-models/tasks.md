## 1. Server — Agent discovery & frontmatter helpers

- [x] 1.1 Add `readAgentModels(projectPath)` helper: globs `.claude/agents/*.md` (excludes subdirs), parses YAML frontmatter, returns `{ name: string, model: string }[]`
- [x] 1.2 Add `applyModelConfig(projectPath)` helper: reads `.specrails/install-config.yaml`, applies `models.defaults.model` to all agents, applies `models.overrides` per-agent, patches `model:` in each frontmatter via regex replace
- [x] 1.3 Add `VALID_MODEL_ALIASES` constant: `['sonnet', 'opus', 'haiku']`

## 2. Server — API endpoints

- [x] 2.1 Add `GET /:projectId/agent-models` route: calls `readAgentModels(project.path)`, returns `{ agents: [{ name, model }] }`
- [x] 2.2 Add `PATCH /:projectId/agent-models` route: validates `defaultModel` and `overrides` values against `VALID_MODEL_ALIASES`, reads existing `install-config.yaml` (or builds default shape), merges new models config, writes via `serializeInstallConfigYaml`, calls `applyModelConfig`, returns updated agent list

## 3. Client — Model combobox component

- [x] 3.1 Create `ModelCombobox` component: Radix `Select` with three options (sonnet/opus/haiku), each option shows label + full model ID + tier badge (`Balanced` / `Most capable` / `Fastest`), current model pre-selected
- [x] 3.2 Style tier badges: `Balanced` = neutral, `Most capable` = accent (purple/indigo), `Fastest` = green — small pill badges

## 4. Client — Agent Models settings section

- [x] 4.1 Add `AgentModelsCard` component to `SettingsPage`: fetches `GET /agent-models` on mount, renders a `ModelCombobox` row per agent, shows empty state if no agents
- [x] 4.2 Add "Apply to all" row above the agent list: a `ModelCombobox` + button that propagates the selected model to all per-agent comboboxes (local state only, not saved yet)
- [x] 4.3 Add Save button: calls `PATCH /agent-models` with `{ defaultModel, overrides }`, shows success/error toast, reverts UI on error
- [x] 4.4 Guard card with `isHubMode` (same as Pipeline Telemetry card)
- [x] 4.5 Add `activeProjectId` as `useEffect` dependency so agent list refreshes on project switch

## 5. Polish & edge cases

- [x] 5.1 Loading skeleton for agent list (3 placeholder rows while fetching)
- [x] 5.2 Disable Save button when no changes are pending (dirty-state tracking)
- [x] 5.3 Handle missing `install-config.yaml` gracefully on PATCH: create it fresh with existing agent models as base
