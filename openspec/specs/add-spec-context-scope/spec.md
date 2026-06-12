# add-spec-context-scope Specification

## Purpose
TBD - created by archiving change add-spec-context-scope. Update Purpose after archive.
## Requirements

### Requirement: Context Scope picker in Add Spec modal
The `Add Spec` modal SHALL render a `Context Scope` section containing four independent toggles in this order: `specrails specs`, `openspec specs`, `Full codebase`, `External tools (MCPs)`. The toggles MUST be visible in both Quick and Explore modes. The `External tools (MCPs)` toggle MUST be rendered as disabled in Quick mode with a tooltip "Explore mode only".

#### Scenario: All four toggles render in Quick mode
- **WHEN** the user opens the Add Spec modal and Quick mode is selected
- **THEN** four toggles are visible labelled `specrails specs`, `openspec specs`, `Full codebase`, `External tools (MCPs)`
- **AND** the `External tools (MCPs)` toggle is disabled
- **AND** hovering the disabled MCPs toggle shows the tooltip text `Explore mode only`

#### Scenario: All four toggles are interactive in Explore mode
- **WHEN** the user switches to Explore mode in the modal
- **THEN** all four toggles are interactive (none disabled)

#### Scenario: Toggles operate independently
- **WHEN** the user clicks `openspec specs` ON while `specrails specs` is ON
- **THEN** both toggles are independently ON
- **AND** toggling one does not affect the state of any other

### Requirement: Default boot for the toggles

On first open in a project (no persisted value), the toggles SHALL boot to: `specrails specs = ON`, `openspec specs = OFF`, `Full codebase = OFF in Quick / ON in Explore`, `External tools (MCPs) = OFF`. The Add Spec modal MUST NOT consult any project-level setting (no `explore_mcp_enabled`, no `explore_contract_refine_enabled`, no other server-side per-project default) when seeding the default boot values. After the first submit in a given project, `useContextScope` persists the chosen scope per-project and subsequent opens restore those values (per the `Per-project sticky persistence` requirement); the defaults defined here apply only when no per-project persisted record exists.

#### Scenario: Fresh project Quick boot
- **WHEN** the modal opens in Quick mode for a project with no persisted scope
- **THEN** `specrails specs` is ON
- **AND** `openspec specs` is OFF
- **AND** `Full codebase` is OFF
- **AND** `External tools (MCPs)` is OFF and disabled

#### Scenario: Fresh project Explore boot
- **WHEN** the modal opens in Explore mode for a project with no persisted scope
- **THEN** `specrails specs` is ON
- **AND** `openspec specs` is OFF
- **AND** `Full codebase` is ON
- **AND** `External tools (MCPs)` is OFF

#### Scenario: Boot does not consult project-level settings
- **GIVEN** the server has no endpoint or stored value for any `explore_*_enabled` project setting
- **WHEN** the Add Spec modal boots in either Quick or Explore mode
- **THEN** the toggle defaults match this requirement without any server fetch for project-level Explore configuration

### Requirement: Per-project sticky persistence
The toggle state SHALL be persisted per-project under `queue_state` key `add_spec_context_scope_last` as a JSON record `{ specrails: boolean, openspec: boolean, full: boolean, mcp: boolean }` on every submit. The next open of the modal in the same project MUST restore those values. Switching projects MUST NOT carry values across projects.

#### Scenario: Persistence on submit
- **WHEN** the user toggles `openspec specs` ON and submits in Quick mode
- **THEN** `queue_state.add_spec_context_scope_last` is upserted with `openspec: true`

#### Scenario: Restore on reopen
- **WHEN** the user closes the modal after persisting `{ specrails: true, openspec: true, full: false, mcp: false }` and reopens it in the same project
- **THEN** the four toggles show `ON / ON / OFF / OFF` respectively

#### Scenario: Per-project isolation
- **WHEN** project A has persisted `full: true` and the user switches to project B which has no persisted record
- **THEN** project B opens with the default boot values, not project A's values

### Requirement: Cost Awareness meter — qualitative tier
A segmented 4-tier bar SHALL render below the toggles showing the active tier among `Light | Medium | Heavy | Deep`. Tier MUST be computed as the sum of toggle weights — `specrails=1`, `openspec=2`, `mcp=2`, `full=4` — with thresholds: `0 → Light`, `1–2 → Medium`, `3–5 → Heavy`, `6+ → Deep`. The active segment MUST update within 100ms of any toggle change.

#### Scenario: All off is Light
- **WHEN** all four toggles are OFF
- **THEN** the meter highlights `Light` and the numeric estimate row reads `~0k tok additional context`

#### Scenario: specrails + openspec is Medium
- **WHEN** `specrails specs=ON` and `openspec specs=ON` and the others are OFF
- **THEN** the meter highlights `Medium` (weight sum 3 → in band 1–5? recompute by rule)
- **AND** the active segment changes within 100ms of the last toggle click

#### Scenario: Full codebase alone is Heavy
- **WHEN** only `Full codebase=ON`
- **THEN** the meter highlights `Heavy` (weight 4)

#### Scenario: Everything on is Deep
- **WHEN** all four toggles are ON
- **THEN** the meter highlights `Deep` (weight 9)

### Requirement: Cost Awareness meter — numeric estimate line
A second line below the tier bar SHALL render `~Xk tok · ~$Y · ~Zs` using a live estimate derived from the toggle state and a budget snapshot obtained from `GET /api/projects/:projectId/context-budget`. The numeric line MUST refresh within 200ms of any toggle change. If the budget endpoint fails, the line MUST be replaced by `tier-only — estimate unavailable` and the tier bar MUST continue to function.

#### Scenario: Numeric line uses budget snapshot
- **WHEN** the budget endpoint returns `{ specrailsSpecsTokens: 1800, openspecSpecsTokens: 7200, codebaseEstimatedTokens: 95000 }` and the user has `specrails=ON, openspec=ON, full=OFF, mcp=OFF`
- **THEN** the displayed token total is approximately `~9k tok`
- **AND** the cost figure is computed using the selected model's per-token price
- **AND** the displayed time is a heuristic mapping from tier (e.g. Medium ≈ `~30s`)

#### Scenario: Budget endpoint failure
- **WHEN** `GET /context-budget` returns 500 or times out (5s)
- **THEN** the numeric line is replaced by `tier-only — estimate unavailable`
- **AND** the tier segmented bar still updates on toggle changes

### Requirement: Submit button color shifts with tier
The Add Spec modal submit button (`Generate Spec` in Quick / `Continue` in Explore) SHALL apply a theme-token background color matching the current tier: `Light → accent-success`, `Medium → accent-info`, `Heavy → accent-warning`, `Deep → accent-secondary`. The button MUST remain enabled in all tiers (color is informational, not gating).

#### Scenario: Deep tier turns the submit accent-secondary
- **WHEN** all four toggles are ON in Explore mode
- **THEN** the `Continue` button has background `accent-secondary`
- **AND** the button is enabled if the idea textarea has text

#### Scenario: Light tier turns the submit accent-success
- **WHEN** all toggles are OFF in Quick mode and the user has typed an idea
- **THEN** the `Generate Spec` button has background `accent-success`

### Requirement: Quick chip hint reflects Full codebase
The Quick mode chip's hint SHALL display `~15s` by default and `~45s` whenever `Full codebase=ON`. The hint MUST update live as the toggle changes, without closing or reopening the modal.

#### Scenario: Hint updates live
- **WHEN** the user has Quick selected with hint `~15s` and toggles `Full codebase` ON
- **THEN** within 100ms the Quick chip hint reads `~45s`
- **AND** toggling `Full codebase` OFF reverts the hint to `~15s`

### Requirement: Server context-budget endpoint
The app SHALL expose `GET /api/projects/:projectId/context-budget` returning a JSON body `{ specrailsSpecsTokens: number, openspecSpecsTokens: number, codebaseFileCount: number, codebaseEstimatedTokens: number, mcpServers: string[] }`. Each token field SHALL be a rough estimate (sum of file bytes divided by 4 for ASCII heuristic). The response SHALL be cacheable for 60 seconds per project.

#### Scenario: Budget for a fresh project with no specs
- **WHEN** the project has no `.specrails/specs/` and no `openspec/specs/` directories
- **THEN** the response has `specrailsSpecsTokens: 0` and `openspecSpecsTokens: 0`
- **AND** `codebaseFileCount` reflects the number of source files

#### Scenario: Cache TTL
- **WHEN** the endpoint is called twice within 60 seconds for the same project
- **THEN** the second call returns the cached value without re-walking the filesystem

### Requirement: Quick mode forwards contextScope and concats requested specs
`POST /api/projects/:projectId/tickets/generate-spec` SHALL accept a `contextScope: { specrails: boolean, openspec: boolean, full: boolean }` field in its request body. When `specrails=true` the server MUST concatenate the bodies of `<project>/.specrails/specs/**/*.md` into the system prompt (capped at 30k tokens, truncated with a `(truncated)` marker on overflow). When `openspec=true` the server MUST concatenate `<project>/openspec/specs/**/spec.md` similarly. When `full=true` the server MUST spawn the underlying claude call with `--allowedTools Read,Grep,Glob` (but NOT Bash). When `full=false` the server MUST pass `--disallowedTools Read,Grep,Glob,Bash`.

#### Scenario: Quick with both specs ON concatenates content
- **WHEN** the user submits a Quick request with `contextScope: { specrails: true, openspec: true, full: false }`
- **THEN** the system prompt contains a section labelled `## Specrails Specs` followed by spec contents
- **AND** a section `## OpenSpec Specs` follows with openspec contents
- **AND** the spawn arguments include `--disallowedTools Read,Grep,Glob,Bash`

#### Scenario: Quick with Full codebase allows read tools
- **WHEN** the user submits a Quick request with `contextScope: { specrails: false, openspec: false, full: true }`
- **THEN** the spawn arguments include `--allowedTools Read,Grep,Glob`
- **AND** `Bash` is not in the allowed list

#### Scenario: 30k token cap on spec concat
- **WHEN** the combined specrails specs would exceed the 30k token cap
- **THEN** the content is truncated to fit and ends with the marker `(truncated)`

### Requirement: Explore overlay context pill
After the user submits the first Explore turn, the overlay SHALL render a persistent pill in the header area summarising the active scope and per-turn cost estimate. The pill text MUST follow the format `Context: <comma-separated active scopes> · ~$Y/turn`. If no scopes are active, the pill text is `Context: minimal · ~$Y/turn`.

#### Scenario: Pill reflects two active scopes
- **WHEN** the Explore overlay opens with `specrails=ON, openspec=OFF, full=ON, mcp=OFF`
- **THEN** the header pill reads `Context: specrails, codebase · ~$Y/turn` where Y is the model's per-turn cost estimate

#### Scenario: Pill with all off
- **WHEN** the Explore overlay opens with all four toggles OFF
- **THEN** the pill reads `Context: minimal · ~$Y/turn`

### Requirement: First-turn delta toast
After the first assistant turn completes in any Explore session launched from the Add Spec modal, the client SHALL emit a non-blocking toast of format `Used Nk tok (est. Mk) · $Z` where `N` is the actual input tokens from the `ai_invocations` row for that turn and `M` is the estimate the user saw at submit time. The toast MUST NOT appear on subsequent turns.

#### Scenario: First turn shows the delta
- **WHEN** the first assistant turn settles with `tokens_in=11800` and the meter estimate was `12000`
- **THEN** a toast appears reading `Used 11.8k tok (est. 12k) · $0.038`
- **AND** no further delta toast is emitted for subsequent turns of the same conversation

#### Scenario: Quick mode does not emit the delta toast
- **WHEN** a Quick generation completes
- **THEN** no delta toast is emitted (the existing progress toast remains the only feedback)

### Requirement: Global explore_mcp_enabled is the MCP default boot
The project-wide `explore_mcp_enabled` setting SHALL serve as the default boot value for the `External tools (MCPs)` toggle when no per-project persisted scope exists. The modal toggle is a per-spec override and MUST NOT mutate the global setting on submit.

#### Scenario: Global setting drives default boot
- **WHEN** the global `explore_mcp_enabled=true` and no persisted scope exists for the project
- **THEN** the Explore mode opens with the MCPs toggle ON

#### Scenario: Per-spec override does not mutate the global
- **WHEN** the global setting is `true` and the user toggles MCPs OFF for one spec and submits
- **THEN** `GET /api/projects/:id/explore-mcp-enabled` continues to return `true`
- **AND** the persisted `add_spec_context_scope_last.mcp` is `false`
