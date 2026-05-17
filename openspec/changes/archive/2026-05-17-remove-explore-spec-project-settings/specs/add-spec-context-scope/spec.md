## MODIFIED Requirements

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
