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

When the project has no profiles yet, the empty state offers two entry
points:

- **Migrate from current agents** — reads your existing
  `.claude/agents/` frontmatter models and creates a `default` profile
  mirroring today's behavior (zero-loss). It requires the baseline trio
  `sr-architect`, `sr-developer`, and `sr-reviewer` to be present — the
  server rejects the migration if any is missing.
- **Blank profile** — start from scratch.

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

Profiles are picked on the **Dashboard rails board**, not in a separate
wizard. Each rail header has a compact profile dropdown
(`RailProfileSelector`):

- Pick a profile once and it persists across launches of that rail
  (stored per rail; sent inline on `POST /rails/:i/launch`, or set on its
  own via `PUT /rails/:i/profile`).
- Concurrent rails can run different profiles at the same time, so a batch
  spread across rails can give each feature its own flavor of pipeline.
- The selector **self-hides** when the project has no profiles, so it never
  leaves an empty gap in the rail header.

The "No profile" option is always available — use it to run a
rail exactly as it did pre-4.1.0.

### Codex / multi-provider

Agent profiles are a **Claude-only** feature. When a rail's AI engine is
Codex, the hub force-nulls the profile and runs the rail in legacy mode —
Codex has no agent-profile concept. The profile selector is hidden for
Codex rails, so a profile picked on one engine never silently applies to
the other.

## 4. Author a custom agent (Agent Studio)

From the Catalog tab, create a new custom agent via:

- **Template** — start from one of ~50 curated templates spanning many
  categories (engineering, product, data, security, …) — for example
  Security Reviewer, Performance Profiler, Data Engineer, or UI/UX Polisher.
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

- A **profile badge** (themed with the `accent-primary` color) appears on
  each job row showing which profile it ran under.
- The **Usage** tab shows usage per profile for the last 7/30/90 days:
  jobs, success rate, avg duration, avg tokens, and avg cost.
- The **diagnostic ZIP export** on a job includes `profile.json` with
  the exact snapshot that rail used.

## 6. Troubleshooting

- **Upgrade banner on Agents page** — `npx specrails-core@latest update`
  in the project to bring it to ≥ 4.1.0.
- **Save disabled with "N issues to resolve"** — the live validator
  enforces the baseline trio (`sr-architect`, `sr-developer`, `sr-reviewer`)
  and routing ordering. Among the rules: a `default: true` routing rule (if
  present) must be the **last** entry in `routing` and must target
  `sr-developer`. Fix the listed issues and Save re-enables.
- **"agent 'xyz' already exists" (409)** — the name collides with an
  existing file in `.claude/agents/`. Pick a different name.
- **The whole Agents section is missing** — it can be disabled server-side
  with `SPECRAILS_AGENTS_SECTION=false`, which 404s the entire
  `/profiles` router. Unset it (or leave it at its default) to restore the
  section.

## 7. Reserved paths

`specrails-core`'s installer guarantees it will never touch:

- `.specrails/profiles/**` — your profile catalog.
- `.claude/agents/custom-*.md` — your custom agents.

Everything else under `.specrails/` (install-config, specrails-version,
setup-templates) is managed by the installer and may be overwritten on
update.

## 8. For developers

A few internals worth knowing if you're working on this surface:

- **Version gate.** Profile-aware spawns are gated by
  `projectSupportsProfiles()` (`server/queue-manager.ts`), which reads the
  project's `.specrails/specrails-version` and requires
  `specrails-core >= 4.1.0`. Below that, the rail spawns in legacy mode and
  no profile env var is injected.
- **Snapshot per job.** When a rail launches with a profile, the resolved
  profile is written to
  `~/.specrails/projects/<slug>/jobs/<jobId>/profile.json` (chmod `400`, so
  mid-run edits are impossible) before the `claude` process spawns. The
  spawn env then carries `SPECRAILS_PROFILE_PATH` pointing at that file.
  The same snapshot is persisted to the `job_profiles` table for the Usage
  analytics.
- **REST surface.** All profile operations live under
  `/api/projects/:projectId/profiles` — list/get/create/update/delete,
  `/:name/duplicate`, `/:name/rename`, `/resolve`, `/migrate-from-settings`,
  `/analytics`, `/core-version`, and the catalog routes under `/catalog`.
  The router 404s entirely when `SPECRAILS_AGENTS_SECTION=false`. See
  [api-reference.md](api-reference.md) for the full route list.
