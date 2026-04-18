## Context

The `AgentSelectionStep` component inside `client/src/components/SetupWizard.tsx` renders a footer with `flex items-center justify-between`. This pushes "Skip for now" to the left edge and the install CTA (`Button`, Radix-wrapped) to the right edge. The CTA text is tier-sensitive but the layout is identical for `quick` and `full` tiers. There is a single CTA — no per-tier variants.

`AgentSelector` prevents core agents from being toggled off and `buildDefaultConfig` seeds `selectedAgents` with `DEFAULT_SELECTED` (which includes all core agents). As a consequence, `config.selectedAgents.length === 0` is unreachable via the UI, and the button's `disabled` branch is defensive dead code in practice.

The design objective is to emphasize the install CTA as the wizard's primary forward action.

## Goals / Non-Goals

**Goals:**
- Render the install CTA centered horizontally in the footer.
- Keep "Skip for now" visible and anchored to the left.
- Keep the footer single-row and the existing border/padding unchanged.
- Preserve tier-agnostic behaviour (both `quick` and `full` labels follow the same rule).

**Non-Goals:**
- No changes to agent selection, model selection, or tier selection logic.
- No changes to the installing step, progress, or summary screens.
- No new footer widgets or tooltips.
- No design-token or global style changes.
- No change to the disabled-state styling of the `Button` itself — it remains disabled when `selectedAgents.length === 0`, even though that state is unreachable through normal UI interaction.

## Decisions

### Decision 1 — Anchor "Skip for now" with `absolute`, center CTA with `mx-auto`

Use a relatively-positioned footer where "Skip for now" is absolutely positioned at the left edge of the footer content box and the CTA uses `mx-auto` for horizontal centering.

Rationale: keeps the CTA optically centered against the footer's own width (not shifted by the skip link's width), which is what "centered" means to the eye. A pure `justify-center` on a flex row with Skip as a sibling would offset the CTA by half the Skip width.

Alternatives considered:
- `justify-center` + Skip as sibling → CTA is offset, not truly centered.
- Three-column grid (Skip / CTA / spacer) → works, but adds grid-template-columns for a two-item footer that is otherwise flex-driven.

### Decision 2 — Always centered, no conditional layout

The CTA is always centered. No branching on `selectedAgents.length`. The disabled styling of the `Button` is sufficient if the unreachable zero-selection state ever does occur; there is no product benefit to moving a disabled button to the right edge.

Rationale: matches real UI reachability (zero-selection is unreachable due to core agents). Removes dead branching. Single source of truth for layout.

Alternatives considered:
- Conditional centering (center when enabled, right when disabled) → adds code for an unreachable state.
- Always right-aligned → does not satisfy the change.

### Decision 3 — CSS-only, no animation

Apply the layout as a static class set; no `transition-*` utility on layout properties. The `Button` keeps its existing hover/active transitions.

Rationale: there is no state change to animate. Animating layout risks jank and adds noise.

## Risks / Trade-offs

- [Risk] Absolute positioning of "Skip for now" could overlap the centered CTA on very narrow viewports → Mitigation: the wizard dialog has a min-width well above the combined widths of the two controls; rely on existing modal min-width and `whitespace-nowrap` on both controls if visual QA flags overlap.
- [Risk] Snapshot / DOM-based tests asserting strict class strings could break → Mitigation: update the existing `SetupWizard.test.tsx` to assert layout behaviourally (e.g., the install button is a descendant of a centered wrapper identified by `data-testid`) rather than exact class strings.
