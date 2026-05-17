## Why

The Add Spec modal (Quick + Explore) ships a fixed context strategy: every Explore turn opens Read/Grep/Glob over the full project, and Quick generation has no context controls at all. Users cannot trade off depth vs. cost, cannot opt into specrails/openspec specs as grounding, and have no visual signal of how expensive a spec generation will be before submitting. Power users want a tighter cheaper run for simple specs; deep specs want everything on.

## What Changes

- Add a **Context Scope** picker to the Add Spec modal with four independent toggles: `specrails specs`, `openspec specs`, `Full codebase`, `External tools (MCPs)`.
- Quick mode supports `specrails specs`, `openspec specs`, and `Full codebase`. The MCPs check is disabled in Quick with a tooltip "Explore mode only".
- Explore mode supports all four toggles. `Full codebase` OFF passes `--disallowed-tools Read,Grep,Glob,Bash` to the spawn. `External tools (MCPs)` controls spawn cwd (project root vs. explore-cwd), overriding the project-wide `explore_mcp_enabled` setting per-spec.
- specrails/openspec specs ON concat the relevant spec files into the system prompt (Quick) or mount them as readable context (Explore).
- Add a **Cost Awareness** meter under the toggles: a 4-tier segmented bar (Light/Medium/Heavy/Deep) computed from toggle weights (specrails=1, openspec=2, MCPs=2, full=4), plus a live numeric line `~Xk tok · ~$Y · ~Zs` driven by a new `GET /context-budget` endpoint.
- Submit button color shifts with tier. Explore overlay shows a persistent pill `Context: <scopes> · ~$Y/turn` after launch. First-turn post-completion toast shows `Used Nk tok (est. Mk) · $Z` to close the estimate→real loop.
- The Quick chip hint `~15s` updates to `~45s` dynamically when `Full codebase` is ON.
- Persist last-used scope per-project in `queue_state` under key `add_spec_context_scope_last`. Default boot when no value: `{ specrails: true, openspec: false, full: false (Quick) / true (Explore), mcp: <value of project's explore_mcp_enabled> }`.
- The existing project-wide `explore_mcp_enabled` setting (in `SettingsPage`) becomes the default boot for the MCPs check; the modal toggle is a per-spec override and does NOT mutate the global setting.

## Capabilities

### New Capabilities
- `add-spec-context-scope`: per-spec context scope configuration with cost-awareness meter and per-project persistence, covering both Quick and Explore Add Spec flows.

### Modified Capabilities
- `explore-spec`: Explore spawn must honor the per-turn context scope (disallowed-tools, cwd selection, prepended spec context), in addition to existing `explore_mcp_enabled` global behavior.

## Impact

- **Client**: `ProposeSpecModal.tsx` (new toggle UI + cost meter), `ExploreSpecShell.tsx` (consume scope on launch, render Context pill, post-turn toast), new `ContextScopeChecks.tsx` and `CostAwarenessMeter.tsx` components, new `useContextBudget` hook.
- **Server**: new `GET /api/projects/:projectId/context-budget` endpoint returning `{ specrailsSpecsTokens, openspecSpecsTokens, codebaseFileCount, codebaseEstimatedTokens, mcpServers }`. `project-router.ts` `POST /tickets/generate-spec` accepts `contextScope` in body; concat specs into system prompt when toggled. `chat-manager.ts` Explore path consumes `contextScope` per-conversation; spawns with disallowed-tools list and cwd selection accordingly. `queue_state` gains key `add_spec_context_scope_last`.
- **Dependencies**: none new. Uses existing `Read/Grep/Glob` tool gating in claude CLI via `--disallowed-tools`, existing `explore-cwd-manager`, existing `ai_invocations` capture for cost validation.
- **No changes to** `specrails-core`, MCP plugin manifests, or migrations beyond `queue_state` keys.
