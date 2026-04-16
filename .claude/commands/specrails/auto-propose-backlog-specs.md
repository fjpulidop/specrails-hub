---
name: "Update Product-Driven Backlog"
description: "Generate new feature ideas through product discovery, create Local Tickets"
category: Workflow
tags: [workflow, explore, priorities, backlog, product-discovery]
model: opus
---

Analyze the project from a **product perspective** to generate new feature ideas. Syncs results to Local Tickets. Use `/specrails:get-backlog-specs` to view current ideas.

**Input:** $ARGUMENTS (optional: comma-separated areas to focus on. If empty, analyze all areas.)

**IMPORTANT: This command only creates tickets.** You may read files and search code to understand current capabilities, but you must NEVER write application code.

---

## Areas

| Area | Description | Key Files |
|------|-------------|-----------|
| backend | Express server, API routes, SQLite, WebSocket | server/ |
| frontend | React dashboard, components, pages | client/src/ |
| cli | CLI bridge commands | cli/ |
| analytics | Job cost/duration/token metrics | server/analytics.ts, client/src/pages/AnalyticsPage.tsx |
| tickets | Local ticket management, kanban views | .specrails/local-tickets.json, client/src/components/ |
| pipeline | AI pipeline phases (Architect/Developer/Reviewer) | server/queue-manager.ts |

---

## Execution

Launch a **single** explorer subagent (`subagent_type: Explore`, `run_in_background: true`) for product discovery.

The Explore agent receives this prompt:

> You are a product strategist analyzing the **specrails-hub** project to generate new feature ideas using the **Value Proposition Canvas** framework.
>
> **Your goal:** For each area, propose 2-4 new features that would significantly improve the user experience. Every feature MUST be evaluated against the project's personas.
>
> **Areas to analyze:** {all areas or filtered by user input}
>
> ### Step 0: Read Personas
>
> **Before anything else**, read all persona files:
> - Read `.claude/agents/personas/the-multi-project-developer.md`
> - Read `.claude/agents/personas/the-solo-dev.md`
> - Read `.claude/agents/personas/the-tech-lead.md`
> - Read `.claude/agents/personas/the-maintainer.md`
>
> These contain full Value Proposition Canvas profiles (jobs, pains, gains).
>
> ### Research steps
>
> 1. **Understand current capabilities** — Read codebase structure
> 2. **Check existing backlog** — Avoid duplicating existing issues
> 3. **Think through each persona's day** — For each area:
>    - What does each persona need here?
>    - What would a competitive tool offer?
>    - What data is available but not surfaced?
>
> 4. **For each idea, produce a VPC evaluation:**
>    - **Feature name** (short, descriptive)
>    - **User story** ("As a [user type], I want to [action] so that [benefit]")
>    - **Feature description** (2-3 sentences)
>    - **VPC Fit** per persona: Jobs, Pains relieved, Gains created, Score (0-5)
>    - **Total Persona Score**: sum of all persona scores / 20
>    - **Effort** (High/Medium/Low)
>    - **Inspiration** (competitor or product pattern)
>    - **Prerequisites**
>    - **Area**

---

## Assembly — Backlog Sync

After the Explore agent completes:

1. **Display** results to the user.

2. Read `.claude/backlog-config.json` and extract:
   - `BACKLOG_PROVIDER` (`local`, `github`, `jira`, or `none`)
   - `BACKLOG_WRITE` (from `write_access`)

### If `BACKLOG_WRITE=false` — Display only (no sync)

Display all proposed features in a structured format. Do NOT create any tickets.

```
## Product Discovery Results (not synced)

Backlog access is set to **read-only**. The following features were discovered
but NOT created. Create them manually if desired.

### Feature 1: {name}
- **Area:** {area}
- **Persona Fit:** Alex: X/5, Sam: X/5, Morgan: X/5, Kai: X/5
- **Effort:** {level}
- **User Story:** As a {user}, I want to {action} so that {benefit}
- **Description:** {2-3 sentences}
```

### If provider=local — Sync to Local Tickets

Local tickets are always read-write.

3. **Fetch existing local tickets** to avoid duplicates:
   Read `.specrails/local-tickets.json`. Parse the `tickets` map and return all entries regardless of status.
   Collect all ticket titles into a duplicate-check set.

4. **Initialize labels** (idempotent):
   No label initialization required. Local tickets use freeform label strings. Standard label conventions: `area:frontend`, `area:backend`, `area:api`, `effort:low`, `effort:medium`, `effort:high`.

5. **For each proposed feature, create a local ticket** (skip if title matches an existing ticket):
   Write to `.specrails/local-tickets.json` using the advisory locking protocol:
   acquire lock → read file → set `id = next_id`, increment `next_id`, set all ticket fields, set `created_at` and `updated_at` to now, bump `revision`, update `last_updated` → write → release lock.

   Set the following fields:
   - `title`: Feature name
   - `description`: Full VPC body markdown
   - `status`: `"todo"`
   - `priority`: Map effort — Low → `"high"`, Medium → `"medium"`, High → `"low"`
   - `labels`: `["product-driven-backlog", "area:{area}"]`
   - `metadata.vpc_scores`: Per-persona scores from VPC evaluation
   - `metadata.effort_level`: `"High"`, `"Medium"`, or `"Low"`
   - `metadata.user_story`: The user story text
   - `metadata.area`: The area name
   - `prerequisites`: Array of ticket IDs for dependencies (empty if none)
   - `source`: `"get-backlog-specs"`
   - `created_by`: `"sr-product-manager"`

6. **Report** sync results:
   ```
   Product discovery complete:
   - Created: {N} new feature ideas as local tickets
   - Skipped: {N} duplicates (already exist)
   ```

### If provider=github and BACKLOG_WRITE=true — Sync to GitHub Issues

3. Fetch existing product-driven backlog items:
   ```bash
   gh issue list --label "product-driven-backlog" --state open --limit 100 --json number,title
   ```

4. Initialize labels:
   ```bash
   gh label create "product-driven-backlog" --color "6E40C9" --force
   ```

5. For each proposed feature, create a GitHub Issue (skip duplicates):
   ```bash
   gh issue create --title "{feature name}" --label "product-driven-backlog,area:{area}" --body "..."
   ```

6. Report sync results.

### If provider=jira and BACKLOG_WRITE=true — Sync to JIRA

Read `.claude/backlog-config.json` for JIRA config, authenticate, and create Story tickets using the JIRA REST API.

### VPC Body Format

The description/body for each ticket:

```markdown
> **This is a product feature idea.** Generated through VPC-based product discovery.

## Overview

| Field | Value |
|-------|-------|
| **Area** | {Area} |
| **Persona Fit** | Alex: X/5, Sam: X/5, Morgan: X/5, Kai: X/5 |
| **Effort** | {High/Medium/Low} — {justification} |
| **Inspiration** | {source or "Original idea"} |
| **Prerequisites** | {list or "None"} |

## User Story

As a **{user type}**, I want to **{action}** so that **{benefit}**.

## Feature Description

{2-3 sentence description}

## Value Proposition Canvas

### "Alex" — The Multi-Project Developer (X/5)
- **Jobs addressed**: {list}
- **Pains relieved**: {list with severity}
- **Gains created**: {list with impact}

### "Sam" — The Solo Dev (X/5)
- **Jobs addressed**: {list}
- **Pains relieved**: {list with severity}
- **Gains created**: {list with impact}

### "Morgan" — The Tech Lead (X/5)
- **Jobs addressed**: {list}
- **Pains relieved**: {list with severity}
- **Gains created**: {list with impact}

### "Kai" — The Maintainer (X/5)
- **Jobs addressed**: {list}
- **Pains relieved**: {list with severity}
- **Gains created**: {list with impact}

## Implementation Notes

{Brief notes on existing infrastructure and what needs to be built}

---
_Auto-generated by `/specrails:auto-propose-backlog-specs` on {DATE}_
```
