## ADDED Requirements

### Requirement: AI Edit entry point alongside Duplicate and Edit

The Agents Catalog SHALL expose an **AI Edit** action on every custom agent card, in addition to the existing Duplicate and Edit actions. AI Edit SHALL launch the AI Refine overlay (defined in capability `ai-refine-custom-agents`) scoped to the selected agent.

#### Scenario: Three actions on a custom agent
- **WHEN** the user opens the Agents Catalog and selects a custom agent
- **THEN** the action row renders Duplicate, Edit, and AI Edit
- **AND** clicking AI Edit opens the overlay for the selected agent

### Requirement: Studio rehydrates a draft from an in-flight refine session

When `AgentStudio` is opened with a `draftFromRefine=<refineId>` query parameter, the Studio SHALL load the matching `agent_refine_sessions.draft_body` as the initial editor content (instead of the on-disk file body) and SHALL display a persistent "Resume AI Edit" pill that re-opens the AI Refine overlay for the same session.

#### Scenario: Studio loads draft body when handed off
- **WHEN** the user clicks "Open in Studio" from the AI Refine overlay in Reviewing state
- **THEN** Studio opens at the agent's edit route with `?draftFromRefine=<refineId>`
- **AND** the Monaco editor's initial value is `draft_body` (not the on-disk body)
- **AND** the form panel reflects the parsed frontmatter from `draft_body`
- **AND** a "Resume AI Edit" pill is rendered in the Studio header

#### Scenario: Resume AI Edit reopens the overlay
- **WHEN** the user clicks the "Resume AI Edit" pill in Studio
- **THEN** Studio closes (or yields)
- **AND** the AI Refine overlay opens with the same `refineId`
- **AND** the overlay rehydrates state from `GET /api/projects/.../refine/:refineId`

#### Scenario: Studio without handoff parameter behaves unchanged
- **WHEN** Studio opens without `draftFromRefine` (existing flows: from Edit, Duplicate, or new agent)
- **THEN** the editor loads the on-disk body as before
- **AND** no Resume AI Edit pill is rendered
