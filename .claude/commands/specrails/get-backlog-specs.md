---
name: "Product Backlog"
description: "View product-driven backlog from Local Tickets and propose top 3 for implementation"
category: Workflow
tags: [workflow, backlog, viewer, product-driven]
---

Display the product-driven backlog by reading issues/tickets from the configured backlog provider (Local Tickets). These are feature ideas generated through VPC-based product discovery — evaluated against user personas. Use `/specrails:auto-propose-backlog-specs` to generate new ideas.

**Input:** $ARGUMENTS (optional: comma-separated areas to filter. If empty, show all.)

---

## Phase 0: Environment Pre-flight

Verify the backlog provider is accessible:

```bash
[[ -f ".specrails/local-tickets.json" ]] && echo "Local tickets storage: OK" || echo "WARNING: .specrails/local-tickets.json not found — run /specrails:setup to initialize"
```

If the backlog provider is unavailable, stop and inform the user.

---

## Execution

Launch a **single** sr-product-analyst agent (`subagent_type: sr-product-analyst`) to read and prioritize the backlog.

The product-analyst receives this prompt:

> You are reading the product-driven backlog from Local Tickets and producing a prioritized view.

1. **Fetch all open product-driven backlog items:**
   Read `.specrails/local-tickets.json`. Parse the `tickets` map and return all entries where `status` is `"todo"` or `"in_progress"`.

2. **Parse each ticket** to extract metadata from the body:
   - **Area**: from `area:*` label
   - **Persona Fit**: from the body's Overview table — extract per-persona scores and total
   - **Effort**: from `metadata.effort_level` (High/Medium/Low)
   - **Description**: from the body's "Feature Description" section
   - **User Story**: from `metadata.user_story`

3. **Parse prerequisites** from `prerequisites` array field.

4. **Build dependency graph** and detect cycles (DFS cycle detection). Compute `in_degree` for all issues.

5. **Compute safe implementation order** (Kahn's topological sort), sorting by Total Persona Score descending within each wave.

6. **Group by area**, sort within each area by Total Persona Score descending, Effort (Low > Medium > High) as tiebreaker.

7. **Display** as formatted table per area, then **propose the top 3 items from WAVE_1** for implementation.

   Personas: Alex (Multi-Project Dev), Sam (Solo Dev), Morgan (Tech Lead), Kai (OSS Maintainer)

   ```
   ## Product-Driven Backlog

   {N} open tickets | Source: VPC-based product discovery
   Personas: Alex (Multi-Project Dev), Sam (Solo Dev), Morgan (Tech Lead), Kai (OSS Maintainer)

   ### {Area Name}

   | # | Ticket | Alex | Sam | Morgan | Kai | Total | Effort | Prereqs |
   |---|--------|------|-----|--------|-----|-------|--------|---------|
   | 1 | #42 Feature name [blocked] | ... | ... | ... | ... | X/20 | Low | #12, #17 |
   | 2 | #43 Other feature | ... | ... | ... | ... | X/20 | High | — |

   ---

   ## Recommended Next Sprint (Top 3)

   Ranked by VPC persona score / effort ratio:

   | Priority | Ticket | Area | Alex | Sam | Morgan | Kai | Total | Effort | Rationale |
   |----------|--------|------|------|-----|--------|-----|-------|--------|-----------|

   Run `/specrails:implement` to start implementing these items.
   ```

8. **Render Safe Implementation Order section** after the Recommended Next Sprint table.

9. If no tickets exist:
   ```
   No product-driven backlog tickets found. Run `/specrails:auto-propose-backlog-specs` to generate feature ideas.
   ```

---

## Cache Update

After the product-analyst completes, write ticket snapshots to `.claude/backlog-cache.json`.

Read `.specrails/local-tickets.json` and parse the `tickets` map. For each ticket with `"product-driven-backlog"` in its `labels` array and `status` not `"cancelled"`, build a snapshot object and write to `.claude/backlog-cache.json`:

```json
{
  "schema_version": "1",
  "provider": "local",
  "last_updated": "<ISO 8601 timestamp>",
  "written_by": "get-backlog-specs",
  "issues": { "<id>": { <snapshot> }, ... }
}
```

If the write fails: print `[backlog-cache] Warning: could not write cache. Continuing.` Do not abort.
