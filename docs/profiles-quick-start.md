# Profiles — Quick start

Profiles let you save a named combination of orchestrator model, agent
chain, per-agent models, and routing rules, and pick one per rail at
launch time. Different rails on the Dashboard can run different profiles
simultaneously — useful for batch runs where each feature needs a
different flavor of pipeline.

Requires **`specrails-core >= 4.1.0`** in the target project. Without
it, the hub still lets you create/edit profiles but the pipeline runs in
legacy mode (a yellow banner on the Agents page tells you when this is
the case).

---

## 1. Open the Agents section

From any project, click **Agents** in the right sidebar (next to
Dashboard/Jobs/Analytics/Settings).

- **Profiles** tab — create and edit profiles.
- **Usage** tab — see which profiles are actually being used.
- **Catalog** tab — read the upstream `sr-*` agents or author custom
  `custom-*` ones via the Studio.

If the project already has agents installed with per-agent model choices,
the empty state offers **Migrate from current agents**: one click creates
a `default` profile mirroring today's frontmatter.

## 2. Saved profiles vs selection

Two orthogonal concepts:

- **Saved profiles** — the set of profiles in the project (`.specrails/profiles/*.json`).
  Committed to git, shared with the team.
- **Selection** — which profile this particular invocation uses. Per-rail,
  per-launch.

Resolution order when no explicit selection is passed:

1. The profile named `default` (or `project-default`).
2. Legacy mode (no profile active).

## 3. Pick a profile at launch

- **Single feature** (Implement Wizard): the footer has a Profile dropdown
  preselected to the project default profile when one exists. Picking a
  different one only affects that launch.
- **Batch** (Batch Implement Wizard): the footer has a batch-level picker
  that applies to every rail, plus a per-feature override table when you
  select more than one issue. Override the rows that need it; leave the
  rest to inherit.
- **Dashboard rails**: each rail has a compact profile dropdown in its
  header. Pick once and it persists across launches of that rail.

The "No profile" option is always available — use it to run a
rail exactly as it did pre-4.1.0.

## 4. Author a custom agent (Agent Studio)

From the Catalog tab, create a new custom agent via:

- **Template** — pick from Security Reviewer, Data Engineer, Performance
  Profiler, or UI/UX Polisher.
- **Generate** — describe the agent in natural language; Claude drafts the
  full `.md` for you to review and edit before saving.
- **Blank** — start from a minimal template.
- **Duplicate** — copy any existing agent (upstream or custom).

Custom agents live at `.claude/agents/custom-*.md` and are never touched
by `specrails-core`'s installer/update scripts. Every save appends a new
version row; open **History** in the Studio to browse and restore.

Click **Test** in the Studio to run the current draft against a sample
task in an isolated `claude` invocation — no files are written, and you
see output, token count, and duration inline.

## 5. Observe

- A purple **profile badge** appears on each job row showing which profile
  it ran under.
- The **Usage** tab shows usage per profile for the last 7/30/90 days:
  jobs, success rate, avg tokens, avg duration.
- The **diagnostic ZIP export** on a job includes `profile.json` with
  the exact snapshot that rail used.

## 6. Troubleshooting

- **Upgrade banner on Agents page** — `npx specrails-core@latest update`
  in the project to bring it to ≥ 4.1.0.
- **Save disabled with "N issues to resolve"** — the live validator
  enforces the baseline trio (`sr-architect`, `sr-developer`, `sr-reviewer`)
  and routing ordering. Fix the listed issues and Save re-enables.
- **"agent 'xyz' already exists" (409)** — the name collides with an
  existing file in `.claude/agents/`. Pick a different name.

## 7. Reserved paths

`specrails-core`'s installer guarantees it will never touch:

- `.specrails/profiles/**` — your profile catalog.
- `.claude/agents/custom-*.md` — your custom agents.

Everything else under `.specrails/` (install-config, specrails-version,
setup-templates) is managed by the installer and may be overwritten on
update.
