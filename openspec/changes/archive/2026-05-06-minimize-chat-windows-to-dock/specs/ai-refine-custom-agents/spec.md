## ADDED Requirements

### Requirement: AI Refine overlay can be minimized to the dock

The AI Refine overlay SHALL expose a minimize control in its header, distinct from the existing close button. Activating the minimize control MUST hide the overlay without unmounting it, without cancelling any in-flight refine turn, and without writing the draft to disk. A chip MUST be registered in the global minimized chats dock.

#### Scenario: Minimize during streaming does not cancel
- **WHEN** the user clicks the minimize control while the overlay is in the Streaming state
- **THEN** the overlay is hidden
- **AND** the active refine spawn continues running on the server
- **AND** `agent_refine_sessions.status` remains `streaming`
- **AND** a chip with the agent name appears in the dock

#### Scenario: Minimize during reviewing preserves diff
- **WHEN** the user clicks the minimize control while the overlay is in the Reviewing state with a pending diff
- **THEN** the overlay is hidden
- **AND** the chip is added to the dock
- **AND** restoring the chip later shows the same `draftBody`, `history[]`, and diff pane content

#### Scenario: AiEdit shell hoisted out of AgentsCatalogTab
- **WHEN** an AiEdit session is active and the user navigates away from `/agents`
- **THEN** the AiEdit shell remains mounted (in the global minimized chats provider's hidden host)
- **AND** the session is reachable from the dock chip on any project route

#### Scenario: Restore from chip preserves all refine state
- **WHEN** the user clicks the chip for a previously minimized AiEdit session
- **THEN** the active project switches to the session's owning project (if different)
- **AND** the application navigates to `/agents` with the catalog tab active
- **AND** the overlay is shown with the same `refineId`, `agentId`, `baseBody`, `draftBody`, `history[]`, `streamingText`, `phase`, `uiState`, `testResult`, and `appliedVersion` as before minimize
