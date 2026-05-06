## ADDED Requirements

### Requirement: ExploreSpec shell can be minimized to the dock

The ExploreSpec full-screen overlay SHALL expose a minimize control in its header, distinct from the existing back arrow and close (`×`) buttons. Activating the minimize control MUST hide the overlay without unmounting it, register a chip in the global minimized chats dock, and never trigger the discard-confirm dialog.

#### Scenario: Minimize hides overlay and adds chip
- **WHEN** the user clicks the minimize control on an ExploreSpec overlay with a non-empty composer
- **THEN** the overlay is hidden from the viewport
- **AND** a chip appears in the global minimized chats dock with the current draft title (or "Untitled spec" when empty) as its label
- **AND** no discard-confirm dialog is shown

#### Scenario: Restore from chip preserves all state
- **WHEN** the user clicks the chip for a previously minimized ExploreSpec session
- **THEN** the active project switches to the session's owning project (if different)
- **AND** the application navigates to the spec proposal entry route
- **AND** the overlay is shown with the same conversation history, draft fields, composer text, attachments, streaming state, and discard-confirm pending state as before minimize

#### Scenario: ExploreSpec shell hoisted out of ProposeSpecModal
- **WHEN** an ExploreSpec session is active and the user closes `ProposeSpecModal`
- **THEN** the ExploreSpec shell remains mounted (in the global minimized chats provider's hidden host)
- **AND** the session is added to the dock as a chip if it wasn't already visible there
