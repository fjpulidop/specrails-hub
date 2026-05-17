## ADDED Requirements

### Requirement: SMASH decomposition produces short_summary per sub-spec

Both SMASH modes (Simple and Full) SHALL request a `shortSummary` field for each sub-spec produced and persist it on the created child tickets.

#### Scenario: Simple mode generates summary per sub-spec
- **WHEN** a parent ticket is decomposed using SMASH Simple
- **THEN** each child ticket created has `short_summary` populated from the model's response
- **AND** if the model omits `shortSummary` for a child, that child has `short_summary = null`

#### Scenario: Full mode generates summary per sub-spec
- **WHEN** a parent ticket is decomposed using SMASH Full
- **THEN** each child ticket created has `short_summary` populated from the model's response
- **AND** missing values default to null without aborting decomposition
