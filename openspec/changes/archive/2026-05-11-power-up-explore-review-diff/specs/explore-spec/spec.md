## ADDED Requirements

### Requirement: Explore composer footer exposes a Review action

The Explore composer footer SHALL render a `Review →` action positioned between the `Send` button and the `Create Spec` button. The action MUST be visible only when the draft has a non-empty `title` (matching the existing enable-condition of `Create Spec`). Activating the action SHALL open the Review Changes overlay over the shell without unmounting the shell.

#### Scenario: Review button appears when title is non-empty

- **WHEN** the draft has a non-empty title
- **THEN** a `Review →` action is rendered in the composer footer
- **AND** clicking it opens the Review Changes overlay

#### Scenario: Review button is hidden when title is empty

- **WHEN** the draft has no title (or whitespace-only)
- **THEN** the `Review →` action is not rendered

#### Scenario: Shell stays mounted while Review is open

- **WHEN** the Review overlay is open
- **THEN** the underlying Explore shell remains mounted in the DOM
- **AND** closing the overlay returns the user to the exact conversation and draft state they had before opening it

### Requirement: Review Changes overlay renders the full draft against a baseline

The Review Changes overlay SHALL accept a `baseline` describing the prior state of the spec (default empty) and render each draft field with diff highlights against the baseline. The overlay MUST cover `title`, `description`, `labels`, `priority`, and `acceptanceCriteria`. The overlay MUST NOT mutate the underlying draft state.

#### Scenario: Empty baseline renders all fields as additions

- **WHEN** the overlay is opened on a new spec with no prior baseline
- **THEN** all proposed values for `title`, `description`, `labels`, and `acceptanceCriteria` are rendered as added content
- **AND** the `priority` is rendered as a single pill (no before/after arrow)

#### Scenario: Non-empty baseline renders mixed diffs

- **WHEN** the overlay is opened with a baseline that differs from the proposed draft
- **THEN** unchanged text segments are rendered with default styling
- **AND** added segments are visually highlighted (e.g., success-coloured background)
- **AND** removed segments are visually struck through (e.g., warning-coloured strikethrough)

#### Scenario: Overlay does not mutate the draft

- **WHEN** the overlay is open
- **THEN** closing it via `Back to edit` returns the draft to the same in-memory state it had before the overlay opened
- **AND** no `spec_draft.update` WS event is emitted by opening or closing the overlay

### Requirement: Text fields use word-level diff; arrays use set diff; priority uses before/after

`title` and `description` SHALL be diffed at the word level using the existing `diff` package (`diffWords`). `labels` and `acceptanceCriteria` SHALL use a set-based diff that classifies each item as `added`, `removed`, or `unchanged` and renders order-preserved `unchanged + added` followed by `removed` items. `priority` SHALL render a single pill when unchanged or only one side has a value, and a `from → to` pill pair when changed.

#### Scenario: Word-level diff on description

- **WHEN** the baseline description is `Users cannot change the OS theme.` and the proposed description is `Users cannot override the OS theme.`
- **THEN** the rendered description shows the unchanged words intact, `change` struck through, and `override` highlighted as added

#### Scenario: Set diff on labels

- **WHEN** the baseline labels are `["ui", "misc"]` and the proposed labels are `["ui", "theme", "settings"]`
- **THEN** `ui` is rendered as unchanged
- **AND** `theme` and `settings` are rendered as added
- **AND** `misc` is rendered as removed

#### Scenario: Set diff on acceptance criteria preserves proposed order

- **WHEN** the baseline criteria are `["A", "B"]` and the proposed criteria are `["B", "C", "A"]`
- **THEN** the rendered list shows `B`, `C`, `A` in that order as unchanged/added/unchanged
- **AND** no removed entries are rendered

#### Scenario: Priority renders before-and-after when changed

- **WHEN** the baseline priority is `medium` and the proposed priority is `high`
- **THEN** the priority is rendered as a `medium → high` pill pair

#### Scenario: Priority renders single pill when unchanged

- **WHEN** the baseline and proposed priorities are both `medium`
- **THEN** the priority is rendered as a single `medium` pill

### Requirement: Review overlay supports Back-to-edit and Create-Spec actions

The overlay SHALL render two footer actions: `[← Back to edit]` and `[Create Spec]`. `Back to edit` MUST close the overlay without committing. `Create Spec` MUST invoke the same commit handler used by the footer-level `Create Spec` button on the underlying shell; both entry points MUST produce identical results. The `Esc` key MUST be equivalent to `Back to edit`.

#### Scenario: Back to edit closes the overlay

- **WHEN** the user clicks `Back to edit`
- **THEN** the overlay closes
- **AND** the underlying Explore shell becomes interactive again with unchanged draft state
- **AND** no ticket is committed

#### Scenario: Create Spec from the overlay commits the draft

- **WHEN** the user clicks `Create Spec` from inside the overlay
- **THEN** the same commit path used by the footer `Create Spec` button is invoked
- **AND** the overlay closes on success

#### Scenario: Esc closes the overlay equivalent to Back to edit

- **WHEN** the user presses `Esc` while the overlay is open
- **THEN** the overlay closes without committing
- **AND** the draft state is preserved

### Requirement: Review overlay is gated by a build-time escape hatch

The Review-Changes feature SHALL be gated by a client build-time flag `VITE_FEATURE_EXPLORE_REVIEW`. The default value MUST be enabled. Setting `VITE_FEATURE_EXPLORE_REVIEW=false` MUST cause the `Review →` action to not render and MUST keep the rest of the Explore shell functional, including the unchanged `Create Spec` footer action.

#### Scenario: Default build enables Review

- **WHEN** the client is built without setting the flag
- **THEN** the `Review →` action is rendered when the draft has a title
- **AND** clicking it opens the overlay

#### Scenario: Flag set to false hides Review

- **WHEN** the client is built with `VITE_FEATURE_EXPLORE_REVIEW=false`
- **THEN** the `Review →` action is not rendered regardless of draft state
- **AND** the existing `Create Spec` footer action is unaffected and continues to commit when clicked
