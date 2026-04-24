## Context

Routing rules live inside agent profile JSON (`<project>/.specrails/profiles/*.json`) and are consumed by specrails-core at implement time. The hub is the only editor for these files. Current UI in `ProfileEditor.tsx` exposes add / reorder / delete / change-target but not tag-edit — a real gap that forces delete+re-add.

Separately, the `default: true` rule is the pipeline's last-resort fallback. Core assumes `sr-developer` handles unrouted tasks. Letting users retarget default → custom agent is structurally legal today but semantically dangerous: custom agents are task-specific and may silently take over every non-tagged task. With zero users on 1.39.0 we can lock this without a migration.

## Goals / Non-Goals

**Goals:**
- Tag-edit on any non-default routing rule, on every profile type (default, project-default, custom).
- Default catch-all rule is immutable: agent pinned to `sr-developer`, no delete, no edit.
- Server-side validation enforces the default-rule invariant (defense in depth against hand-edited JSON / direct API calls).
- No user data migration.

**Non-Goals:**
- Redesigning the Agents section (separate, larger effort).
- Filesystem existence check for `.claude/agents/custom-*.md`.
- Per-job routing outcome telemetry.
- Changing the schema JSON file itself (kept in sync with specrails-core upstream; structural check in `validateStructural` is enough).

## Decisions

### Reuse `RoutingRuleDialog` with a `mode` prop
Alternatives: inline chip editor, inline CSV swap, separate `EditRoutingRuleDialog`.

Chosen: add `mode: 'add' | 'edit'` + `initial?: { tags: string[]; agent: string }` to the existing dialog.

Why: validation logic, tag parsing, and agent-select are already solved there — duplicating risks drift. Inline chip UX is better but much bigger scope (focus, paste CSV, a11y) and is better deferred to the Agents section redesign.

### Lock default rule client-side AND server-side
Client: `RoutingRow` hides the agent `<select>`, hides ✕, shows a "core" hint; pencil button is suppressed (default rule has no tags).

Server: `validateStructural` rejects profiles whose default rule has `agent !== 'sr-developer'`. Applied on create/update. No schema change — keeps `profile.v1.json` identical to upstream specrails-core.

Why both layers: schema is shared, UI can be bypassed via REST or hand edits. Server check is the real enforcement; UI guard is the fast-path.

### New handler `setRoutingRuleTags(idx, tags[])`
Alternatives: generic `updateRoutingRule(idx, partial)`.

Chosen: explicit single-purpose handler, mirrors existing `setRoutingRuleAgent` style. `moveRoutingRule` / `removeRoutingRule` / `setRoutingRuleAgent` short-circuit when the target is the default rule.

### No toast / banner when default rule is locked
Feedback is structural: controls are simply absent, plus a "core" badge. Over-signaling reduces polish.

## Risks / Trade-offs

- **Risk**: users want to retarget default to custom agent (power use case). → **Mitigation**: they add a tag rule matching `*` — wait, no wildcard exists. Document that custom agents attach via tag rules only. If real demand emerges, revisit default-rule lock.
- **Risk**: editing tags on a rule that's mid-pipeline for a running job. → **N/A**: profile is snapshotted per-job at spawn time; edits only affect future jobs.
- **Risk**: dialog `useEffect` reset logic flips unexpectedly between add/edit uses. → **Mitigation**: reset on `open && mode` transition only; unit-tested.
- **Risk**: existing profiles in users' repos have `default → custom-*`. → **N/A**: zero users on 1.39.0 (released 2026-04-23, confirmed by maintainer 2026-04-24).

## Migration Plan

None. Zero-user release. Ship directly.

Rollback: revert the PR. No data artifacts to clean up.

## Open Questions

- Should the dialog's "Save changes" also allow empty-tags (effectively delete)? **No** — delete is a separate button, keeps intent clear.
- Pencil button placement: left of reorder arrows or right? **Left** — edit is a higher-frequency op than reorder.
