## ADDED Requirements

### Requirement: Explore session captures short_summary at commit

The Explore flow SHALL request a `shortSummary` value in the same final AI call that produces title and description at `from-draft` commit time, and SHALL persist it on the resulting ticket.

#### Scenario: Summary present in commit
- **WHEN** the user commits an Explore session via `from-draft` and the model returns `shortSummary`
- **THEN** the committed ticket persists `short_summary` (trimmed, max 240 chars)

#### Scenario: Summary absent in commit response
- **WHEN** the model omits `shortSummary`
- **THEN** the committed ticket has `short_summary = null` (fresh insert) or preserves the prior value (flip-in-place)
- **AND** the commit succeeds
