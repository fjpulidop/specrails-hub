# agent-studio Specification

## Purpose
TBD - created by archiving change add-agents-profiles. Update Purpose after archive.
## Requirements
### Requirement: Monaco-based split editor
The Agent Studio SHALL render a split-view editor for custom agents consisting of a structured form (left) and a Monaco-based markdown editor with live preview (right). Changes in either pane SHALL reflect in the other bidirectionally.

#### Scenario: Form edit updates markdown
- **WHEN** the user changes the `model` dropdown in the form
- **THEN** the Monaco editor's frontmatter `model:` line updates to the new value within 100ms

#### Scenario: Markdown edit updates form
- **WHEN** the user edits the frontmatter `model:` line in Monaco to a valid value
- **THEN** the form's model dropdown reflects the new value

### Requirement: Three entry points for agent creation
The Agent Studio SHALL offer three entry points when creating a new custom agent: (a) from a curated template, (b) duplicate of an existing agent, (c) generated from a natural-language description via Claude.

#### Scenario: Template entry point
- **WHEN** the user clicks "New agent" → "From template" and selects the "Security Reviewer" template
- **THEN** the Studio opens pre-filled with that template's fields and markdown body

#### Scenario: Duplicate entry point
- **WHEN** the user clicks "Duplicate" on an existing agent (upstream or custom)
- **THEN** the Studio opens with a copy of that agent, name prefilled as `custom-<original>-copy`, marked as unsaved

#### Scenario: Generate entry point
- **WHEN** the user enters a description ("reviews Terraform for IaC misconfigs") and clicks "Generate"
- **THEN** the hub spawns a dedicated Claude invocation with an agent-authoring system prompt, receives a drafted `.md`, and opens it in a diff-viewer for review before save

### Requirement: Live validation
The Studio SHALL validate agent metadata live as the user edits. Validation SHALL cover: name must match `^custom-[a-z0-9-]+$`, name must not collide with existing agents, `model` must be an accepted alias, required frontmatter fields must be present.

#### Scenario: Name collision flagged
- **WHEN** the user enters a name that matches an existing agent file in `.claude/agents/`
- **THEN** the form shows a red validation error and the Save button is disabled

#### Scenario: Reserved prefix rejected
- **WHEN** the user enters a name starting with `sr-`
- **THEN** the form shows an error: "The `sr-` prefix is reserved for upstream agents"

### Requirement: Save writes to disk
The Studio's Save action SHALL write the current buffer to `<project>/.claude/agents/<name>.md` after a final validation pass. A version record SHALL be appended to the `agent_versions` hub DB table.

#### Scenario: Successful save
- **WHEN** the user clicks Save on a valid draft
- **THEN** the file is written to disk AND a row is appended to `agent_versions` with `{agentName, version, body, createdAt}`

#### Scenario: Save fails on filesystem error
- **WHEN** the filesystem write fails
- **THEN** no version row is appended, the Studio remains on the unsaved draft, and an error toast is shown

### Requirement: Version history
The Studio SHALL display a version history panel listing all saved revisions of the agent in reverse chronological order. The user SHALL be able to view an older version and restore it (which creates a new version record equal to the restored content).

#### Scenario: History lists revisions
- **WHEN** the user opens a custom agent with 3 prior versions
- **THEN** a history panel lists v1, v2, v3 with timestamps

#### Scenario: Restore writes a new version
- **WHEN** the user restores v2
- **THEN** the current file contents equal v2's body AND a new row v4 is appended equal to v2

### Requirement: Test Agent sandbox
The Studio SHALL provide a "Test agent" action that runs the current draft against a user-chosen or library-provided sample task in a sandboxed `claude` invocation. The run SHALL NOT modify the project filesystem. Token count and wall-clock duration SHALL be captured in the `agent_tests` table and rendered in the Studio.

#### Scenario: Test run produces output
- **WHEN** the user selects a sample task and clicks "Test agent"
- **THEN** the hub spawns a disposable `claude` process with the draft body inlined and the sample task as input
- **AND** streaming output is displayed in the Studio's Test pane
- **AND** on completion, a row is appended to `agent_tests` with `{agentName, draftHash, sampleTaskId, tokens, durationMs, output}`

#### Scenario: Test run has a token ceiling
- **WHEN** a test run exceeds the configured token ceiling (default 4000)
- **THEN** the spawn is terminated, the Test pane shows a "token ceiling reached" notice, and the partial output is stored

#### Scenario: Test run does not touch project files
- **WHEN** a test run is executed
- **THEN** no files under the project's working directory are created or modified by the test process

### Requirement: Generate-with-Claude uses dedicated system prompt
The Generate entry point SHALL use a dedicated system prompt for agent authoring, separate from any project-level Claude context. The prompt SHALL instruct Claude to produce a valid `custom-*.md` body matching the schema expected by the Studio's validator.

#### Scenario: Dedicated system prompt used
- **WHEN** the Generate action spawns Claude
- **THEN** the invocation uses a system prompt specific to agent authoring, not the user's project system prompt

### Requirement: Reserved prefix for custom agents
The hub SHALL only allow creating agents whose name starts with `custom-`. The hub SHALL NOT offer create/edit actions for files matching `sr-*.md`.

#### Scenario: Create blocked for non-custom prefix
- **WHEN** the user attempts to save a new agent with name `my-agent`
- **THEN** the validator rejects the save with: "Custom agents must start with `custom-`"

### Requirement: Agent Studio reachable from Agents tab
Opening a custom agent from the Agents tab SHALL navigate to `/projects/:id/agents/studio/:agentName`. Creating a new agent from the Agents tab SHALL navigate to `/projects/:id/agents/studio?new=1` (with query selecting the entry point).

#### Scenario: Edit navigates to studio
- **WHEN** the user clicks "Open in Studio" on `custom-pentester`
- **THEN** the app navigates to `/projects/:id/agents/studio/custom-pentester` and the Studio opens loaded with that agent

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
