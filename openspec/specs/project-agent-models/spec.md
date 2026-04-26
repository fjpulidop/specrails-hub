# project-agent-models Specification

## Purpose
TBD - created by archiving change add-agents-profiles. Update Purpose after archive.
## Requirements
### Requirement: Tag-rule editing in routing rules
The Profile Editor SHALL allow editing the tag set of any non-default routing rule on any profile type (`default`, `project-default`, custom). The edit flow SHALL reuse the existing routing-rule dialog in an edit mode, pre-populated with the current tags and target agent.

#### Scenario: Edit tags on an existing tag rule
- **WHEN** a user clicks the pencil (edit) action on a tag-based routing rule
- **THEN** the routing-rule dialog opens with the current tags and target agent pre-filled
- **AND** confirming with new tags replaces the rule at the same position without altering rule order

#### Scenario: Tag validation on edit
- **WHEN** a user submits the edit dialog with a tag that violates the kebab-case pattern `^[a-z0-9][a-z0-9-]*$`
- **THEN** the dialog surfaces the invalid tags and blocks confirmation

#### Scenario: Edit preserves rule position
- **WHEN** an edit completes on the rule at index N
- **THEN** the rule remains at index N in the profile's routing array

### Requirement: Default routing rule is immutable and pinned to sr-developer
Every profile's `default: true` routing rule SHALL have `agent === 'sr-developer'`. The hub SHALL NOT permit clients to retarget, reorder, or delete this rule. The UI SHALL hide the agent selector, delete, and reorder controls for this rule and render a "core" indicator. The server SHALL reject profile create/update requests whose default rule targets any agent other than `sr-developer`.

#### Scenario: Default rule UI is read-only
- **WHEN** the Profile Editor renders a routing list that contains a `default: true` rule
- **THEN** that row displays `sr-developer` as the target with the agent select disabled or hidden
- **AND** the row does not render a delete button
- **AND** the row does not render reorder arrows
- **AND** the row displays a "core" badge or equivalent indicator

#### Scenario: Server rejects default rule with non-developer target
- **WHEN** a POST or PATCH request reaches `/api/projects/:projectId/profiles` with a body whose routing contains `{ default: true, agent: 'custom-foo' }`
- **THEN** the server responds with HTTP 400 and the profile is not written to disk

#### Scenario: Server rejects default rule deletion by payload omission
- **WHEN** a PATCH payload rewrites routing without any `default: true` entry on a profile that previously had one
- **THEN** the server accepts the payload only if the resulting routing contains no `default: true` entry at all
- **AND** if a default entry is present, its agent MUST be `sr-developer`

### Requirement: Non-default rules remain fully editable on every profile type
Non-default routing rules SHALL remain editable (tags, target agent), reorderable, and deletable on `default`, `project-default`, and custom profiles alike.

#### Scenario: Edit non-default rule on default profile
- **WHEN** a user edits a tag rule on the `default` profile
- **THEN** the edit is persisted and the profile remains valid

