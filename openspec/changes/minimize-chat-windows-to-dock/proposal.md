## Why

Today, two fullscreen chat surfaces — `ExploreSpecShell` (spec drafting) and `AiEditShell` (AI-refine custom agents) — completely block the rest of the hub UI. Users can't peek at other rails, logs, or projects without either finishing or discarding the in-progress conversation, which forces premature decisions and loses context. A "minimize to a dock chip" affordance lets users park a session and come back to it without losing state.

## What Changes

- New global, hub-wide **minimized chats dock** (fixed bottom-right) that renders one chip per parked chat session, with a label and the owning project name.
- New **MinimizedChatsProvider** mounted above the project router that owns the lifecycle of minimized shells (state, persistence, hidden host element).
- ExploreSpecShell and AiEditShell are refactored to mount inside the provider's hidden host (terminal-style hoisting) instead of inside their trigger components, so visibility can toggle without unmounting.
- New "minimize" button on both shells. Esc still closes (existing behavior, with current discard-confirm rules). Minimize is non-destructive — never triggers discard-confirm.
- Clicking a chip switches the active project to the session's owning project, navigates to the session's restore route, and re-shows the shell.
- Stack of minimized chips is uncapped. Multiple chips of the same kind for the same project are allowed.
- Minimized session metadata persists to `localStorage` so chips survive a hub reload. Per-shell chat state hydration is best-effort.
- If the owning project is deleted while a chip is parked, the chip is dropped silently.

## Capabilities

### New Capabilities
- `minimizable-chat-windows`: dock UI, MinimizedChatsProvider, hoisted-shell host, persistence, project-switch + restore-route behavior, chip stack semantics.

### Modified Capabilities
- `explore-spec`: ExploreSpecShell adds a minimize button and is hoisted out of `ProposeSpecModal`'s Dialog into the global host. ChatContext access pattern verified to survive project switch (or promoted accordingly).
- `ai-refine-custom-agents`: AiEditShell adds a minimize button and is hoisted out of `AgentsCatalogTab`'s early-return into the global host. `useAgentRefine` state migrates with the shell.

## Impact

- **Client**: new `MinimizedChatsProvider` + `MinimizedChatsDock` components; non-trivial refactor of `ExploreSpecShell` and `AiEditShell` mount points; small changes in `ProposeSpecModal` and `AgentsCatalogTab` (become triggers); possible lift of `ChatContext` if it doesn't survive project switch.
- **Routing/navigation**: chip click invokes `setActiveProject` (HubProvider) and `navigate(restoreRoute)`.
- **Persistence**: new `localStorage` key (e.g., `specrails-hub:minimized-chats`) storing chip metadata only — not full chat transcripts.
- **No server changes**. No schema changes. No API changes.
- **Tests**: new unit/integration tests for provider, dock, persistence, and project-deleted cleanup; updated tests for both shells covering minimize/restore paths.
