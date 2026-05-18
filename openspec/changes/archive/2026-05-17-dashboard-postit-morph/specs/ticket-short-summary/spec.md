## ADDED Requirements

### Requirement: Tickets persist an optional short_summary field

The per-project tickets store SHALL include a `short_summary` text field. The field MUST be optional (nullable), MUST be plain text (no HTML), and MUST be hard-capped server-side at 240 characters.

#### Scenario: Schema migration adds the field
- **WHEN** the server starts against an existing project database without `short_summary`
- **THEN** an additive migration adds `short_summary TEXT NULL` to the `tickets` table
- **AND** the schema version is bumped
- **AND** existing rows have `short_summary = NULL`

#### Scenario: Field is exposed on every Ticket payload
- **WHEN** the server returns a Ticket via REST or WebSocket
- **THEN** the payload includes `short_summary: string | null`

#### Scenario: Server clamps oversize summary
- **WHEN** any internal code writes a `short_summary` longer than 240 characters
- **THEN** the server trims the value to 240 characters before persisting
- **AND** logs a warning

### Requirement: Quick spec generation produces short_summary

The `POST /tickets/generate-spec` flow SHALL extend its prompt to request a `shortSummary` field (≤120 chars, ≤2 lines, plain language) and persist it on the new ticket. If the model omits the field, the ticket SHALL be created with `short_summary = null`.

#### Scenario: Successful Quick generation includes summary
- **WHEN** the model returns a valid response with `shortSummary`
- **THEN** the new ticket persists `short_summary` to the trimmed value
- **AND** the WS `ticket_created` event includes the summary

#### Scenario: Model omits shortSummary
- **WHEN** the model returns a response without `shortSummary`
- **THEN** the new ticket persists `short_summary = null`
- **AND** ticket creation succeeds with no error

### Requirement: Explore from-draft commit produces short_summary

The `POST /tickets/from-draft` flow SHALL include a `shortSummary` request in its prompt and persist the returned value. The behavior MUST apply both when inserting a fresh ticket and when flipping a draft in place.

#### Scenario: Draft commit produces summary
- **WHEN** an Explore draft is committed to a non-draft status
- **THEN** the persisted ticket has `short_summary` populated (or null if the model omitted it)

#### Scenario: Flip-in-place preserves short_summary when missing
- **WHEN** the from-draft path flips a draft and the model omits `shortSummary`
- **THEN** the existing ticket's `short_summary` is preserved (no overwrite to null)

### Requirement: Postit card displays short_summary

The dashboard postit tier of `SpecsBoard` SHALL render `short_summary` when present, and SHALL omit the summary region entirely when null or empty.

#### Scenario: Summary displayed
- **WHEN** a ticket with non-empty `short_summary` is rendered as a postit
- **THEN** the summary text is shown in a muted style below the title

#### Scenario: Summary hidden when absent
- **WHEN** a ticket has `short_summary = null` or empty string
- **THEN** the summary region is not rendered
- **AND** the card height adapts without a placeholder
