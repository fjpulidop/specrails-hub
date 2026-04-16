---
name: "Refactor Recommender"
description: "Scan the codebase for refactoring opportunities ranked by impact/effort ratio and VPC persona value. Analyzes code for duplicates, long functions, large files, dead code, outdated patterns, and complex logic. Optionally creates GitHub Issues for tracking."
category: Workflow
tags: [workflow, refactoring, code-quality, tech-debt, vpc]
---

Scan the codebase for refactoring opportunities, score each by impact/effort ratio and VPC persona value, and optionally create tickets in Local Tickets.

**Input:** `$ARGUMENTS` — optional: comma-separated paths to scope the analysis. Flags: `--dry-run` (print findings without creating issues).

---

## Phase 0: Pre-flight

Check whether the backlog provider is accessible:

```bash
[[ -f ".specrails/local-tickets.json" ]] && echo "Local tickets storage: OK" || echo "WARNING: .specrails/local-tickets.json not found — run /specrails:setup to initialize"
```

Set `BACKLOG_AVAILABLE=true` if the file exists. Parse `--dry-run` from `$ARGUMENTS` and set `DRY_RUN=true` if present.

---

## Phase 1: Scope

Parse paths from `$ARGUMENTS` after stripping any flags. If no paths are provided, scan the entire repository.

Always exclude: `node_modules/`, `.git/`, `.claude/`, `vendor/`, `dist/`, `build/`

---

## Phase 1.5: VPC Context

Check whether persona files exist at `.claude/agents/personas/`. If found, set `VPC_AVAILABLE=true` and read each persona file to extract:
- **name** — persona display name
- **top_jobs** — up to 3 functional jobs relevant to code quality
- **critical_pains** — up to 3 Critical/High pains related to code reliability
- **high_gains** — up to 3 High gains related to code clarity/speed/confidence

Store as in-memory `VPC_PROFILES`. Otherwise set `VPC_AVAILABLE=false`.

Personas for this project: Alex (Multi-Project Dev), Sam (Solo Dev), Morgan (Tech Lead), Kai (OSS Maintainer).

---

## Phase 2: Analysis

Analyze scoped files across six categories. For each finding record: file, line_range, current_snippet, proposed_snippet, rationale.

### Duplicate Code
Code blocks > 10 lines substantially similar across 2+ files.

### Long Functions
Functions/methods exceeding 50 lines.

### Large Files
Files exceeding 300 lines.

### Dead Code
Unused exports, unreferenced functions, commented-out blocks.

### Outdated Patterns
`var` instead of `let`/`const`, callbacks instead of `async`/`await`, deprecated APIs.

### Complex Logic
Deeply nested conditionals (> 3 levels), high cyclomatic complexity.

---

## Phase 3: Score and Rank

Score every finding:
- **Impact** (1–5): how much the refactoring improves code quality
- **Effort** (1–5): how hard the refactoring is (1 = trivial)
- **VPC Value** (1–5): how directly this addresses persona jobs/pains/gains (3 when `VPC_AVAILABLE=false`)

**Composite score**: `impact * 2 + (6 - effort) + vpc_value`. Sort descending.

---

## Phase 4: Create Tickets

Skip if `BACKLOG_AVAILABLE=false` or `DRY_RUN=true`.

For the **top 5** findings, create a local ticket in `.specrails/local-tickets.json` using the advisory locking protocol:
acquire lock → read file → add ticket with `id = next_id`, increment `next_id`, set all fields, bump `revision` → write → release lock.

Ticket fields:
- `title`: "Refactor: {description}"
- `description`: Full finding markdown with current/proposed snippets and rationale
- `status`: `"todo"`
- `priority`: map score — composite ≥ 12 → `"high"`, ≥ 8 → `"medium"`, else → `"low"`
- `labels`: `["refactor-opportunity", "area:{detected-layer}"]`
- `source`: `"refactor-recommender"`
- `created_by`: `"refactor-recommender"`

Check existing open tickets with label `refactor-opportunity` to avoid duplicates (skip if title matches).

---

## Phase 5: Output Summary

```
## Refactoring Opportunities — specrails-hub

{N} opportunities found | Sorted by composite score
VPC personas loaded: Alex, Sam, Morgan, Kai

| # | Category | File | Impact | Effort | VPC | Score | Description |
|---|----------|------|--------|--------|-----|-------|-------------|

### Top 3 Detailed Recommendations

#### 1. {description}
**File**: {file}:{line_range}
**Category**: {category} | **Score**: {composite}
**VPC Value**: {vpc_value}/5 — {vpc_persona}: {vpc_rationale}

**Current:**
```{lang}
{current_snippet}
```

**Proposed:**
```{lang}
{proposed_snippet}
```

**Rationale:** {rationale}

Tickets created: {N}  (or "dry-run: no tickets created")
```
