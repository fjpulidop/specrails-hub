## ADDED Requirements

### Requirement: Global minimized chats dock

The hub SHALL render a global, hub-wide dock fixed to the bottom-right of the viewport that displays one chip per minimized chat session. The dock MUST be visible regardless of which project is active, and MUST be hidden only when (a) the project setup wizard is taking over the viewport, or (b) no minimized chats exist.

#### Scenario: Dock hidden when no chips exist
- **WHEN** the user has no minimized chat sessions
- **THEN** the dock element is not rendered (no empty container in the DOM)

#### Scenario: Dock visible across project switches
- **WHEN** the user has at least one minimized chat session and switches the active project
- **THEN** the dock remains visible and shows all chips, including chips for other projects

#### Scenario: Dock hidden during setup wizard
- **WHEN** the active project is in the setup-wizard takeover state (`isInSetup === true`)
- **THEN** the dock is not rendered

### Requirement: Chip metadata

Each chip SHALL display the chat label, the owning project's name, an icon indicating the chat kind (explore-spec or ai-edit), and a close affordance (`×`). Chips MUST be ordered newest-on-top.

#### Scenario: Chip shows owning project
- **WHEN** a chat session for project "Alpha" is minimized while the active project is "Beta"
- **THEN** the chip in the dock shows the label and the project name "Alpha"

#### Scenario: Newest chip on top
- **WHEN** the user minimizes session A, then minimizes session B
- **THEN** the dock renders chip B above chip A

### Requirement: Minimize button on supported shells

The ExploreSpec overlay shell and the AI Edit overlay shell SHALL each expose a minimize button distinct from their existing close (`×`) button. The minimize button MUST NOT trigger any discard-confirm dialog and MUST NOT destroy session state.

#### Scenario: Minimize is non-destructive
- **WHEN** the user clicks the minimize button while the composer has unsaved text
- **THEN** no discard-confirm dialog appears
- **AND** the shell becomes hidden and a chip is added to the dock
- **AND** the underlying chat / refine session state remains intact

#### Scenario: Esc still closes (not minimizes)
- **WHEN** the user presses Esc on a shell with unsaved composer text
- **THEN** the existing close behavior runs (including discard-confirm where applicable)
- **AND** no chip is created in the dock

### Requirement: Restore by clicking a chip

Clicking a chip SHALL switch the active project to the chip's owning project, navigate to the chip's restore route, and re-show the chip's shell over the UI. If a different shell is currently visible for the destination project, that shell MUST be minimized (not closed) before the clicked shell is shown.

#### Scenario: Cross-project restore
- **WHEN** the active project is "Beta" and the user clicks a chip whose owning project is "Alpha"
- **THEN** the active project is set to "Alpha"
- **AND** the application navigates to the chip's stored restore route
- **AND** the corresponding shell becomes visible with all prior state intact (composer text, conversation history, attachments, diff state, etc.)

#### Scenario: Same-project restore swaps visible shell
- **WHEN** the active project is "Alpha", an ExploreSpec shell is currently visible for "Alpha", and the user clicks a chip for an AiEdit session also owned by "Alpha"
- **THEN** the ExploreSpec shell becomes hidden (minimized, chip persists in the dock)
- **AND** the AiEdit shell becomes visible
- **AND** neither shell loses its in-memory state

### Requirement: Stack semantics

The dock SHALL allow an unlimited number of minimized sessions to coexist, including multiple sessions of the same kind for the same project. No cap is enforced at the UI layer.

#### Scenario: Two AiEdit sessions for the same project
- **WHEN** the user opens an AiEdit session for agent X, minimizes it, opens a new AiEdit session for agent Y, and minimizes that
- **THEN** the dock shows two distinct chips
- **AND** restoring either chip shows the correct shell with the correct agent's draft and history

### Requirement: Persistence across reload

Chip metadata (id, kind, projectId, label, restoreRoute, params required to bootstrap the shell, createdAt) SHALL be persisted to `localStorage` under the key `specrails-hub:minimized-chats`. On hub load, the provider SHALL rehydrate chips and validate each: chips whose owning project no longer exists or whose backing session cannot be resolved MUST be dropped silently. The provider MUST NOT persist full chat transcripts.

#### Scenario: Chip survives reload
- **WHEN** the user has minimized chats and reloads the hub
- **THEN** the dock re-renders the same chips
- **AND** clicking a chip restores the shell with whatever state can be rehydrated from the chip's backing store

#### Scenario: Stale chip dropped silently on reload
- **WHEN** a chip references a project that no longer exists at reload time
- **THEN** the chip is removed from `localStorage` and is not rendered
- **AND** no toast or notification is shown

#### Scenario: Persisted entries are capped
- **WHEN** the persisted entry count would exceed the configured upper bound (e.g., 50)
- **THEN** the oldest entries are dropped from the persisted list before write

### Requirement: Owning-project deletion drops chips silently

When a project is removed from the hub, the provider SHALL drop all chips whose `projectId` matches the removed project. Any visible shell belonging to that project MUST be unmounted as part of the same cleanup. No toast, dialog, or confirmation is shown.

#### Scenario: Project removed mid-session
- **WHEN** the user has a minimized AiEdit chip for project "Alpha" and the user removes "Alpha" from the hub
- **THEN** the chip is removed from the dock and from `localStorage`
- **AND** no notification is surfaced

#### Scenario: Visible shell unmounted on owning-project removal
- **WHEN** an ExploreSpec shell is visible for project "Alpha" and "Alpha" is removed
- **THEN** the shell is unmounted (its host slot is cleared)
- **AND** no chip remains in the dock for "Alpha"

### Requirement: Hidden host hoisting

The MinimizedChatsProvider SHALL own a hidden host element under which all minimized-capable shells are mounted exactly once per session lifetime. Triggers (e.g., `ProposeSpecModal`, `AgentsCatalogTab`) SHALL NOT mount these shells themselves; they MUST instead invoke a provider API (`openExploreSpec(...)`, `openAiEdit(...)`) that creates and tracks the session.

#### Scenario: Trigger unmount does not destroy session
- **WHEN** the user starts an explore-spec session via `ProposeSpecModal`, minimizes it, and the modal closes
- **THEN** the ExploreSpecShell instance remains mounted in the provider's host
- **AND** restoring the chip later shows the same shell instance with intact state

#### Scenario: Route navigation does not destroy session
- **WHEN** the user starts an AiEdit session via `AgentsCatalogTab`, minimizes it, and navigates away from `/agents`
- **THEN** the AiEditShell instance remains mounted in the provider's host
- **AND** restoring the chip later shows the same shell instance with intact draft, history, and diff state
