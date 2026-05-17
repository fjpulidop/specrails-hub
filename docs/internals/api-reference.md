# API reference

REST endpoints exposed by the hub server at `http://127.0.0.1:4200`. Requests and responses are JSON unless noted. All `/api/*` routes (except `/api/health` and `/api/hub/token`) require the Bearer token from `~/.specrails/hub.token` — the CLI and the desktop app read it automatically.

This page is generated from the actual route declarations in `server/*-router.ts`. If you spot a discrepancy, please file an issue.

---

## Top-level mounts

| Prefix | Router | Auth | Notes |
|--------|--------|------|-------|
| `/api/health` | direct | none | Liveness probe |
| `/api/hub/token` | direct | none | Returns the auth token for local-CLI bootstrapping (loopback-only) |
| `/api/docs` | `docs-router` | Bearer | Documentation portal |
| `/api/hub/*` | `hub-router` | Bearer | Cross-project operations |
| `/api/projects/:projectId/*` | `project-router` | Bearer | Project-scoped operations |
| `/api/projects/:projectId/rails/*` | `rails-router` | Bearer | Rails (execution lanes) |
| `/api/projects/:projectId/profiles/*` | `profiles-router` | Bearer | Agent profiles + studio |
| `/api/projects/:projectId/plugins/*` | `plugins-router` | Bearer | Plugin marketplace |
| `/otlp/v1/{traces,metrics,logs}` | `telemetry-router` | none (gated by job id) | OTLP/JSON receiver |
| `/ws` | WebSocket | Bearer (token in query) | Project + hub event stream |
| `/ws/terminal/:id` | WebSocket | Bearer (token in query) | PTY traffic for terminal panel |

---

## `/api/hub/*`

### Projects

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/projects` | List registered projects |
| `POST` | `/projects` | Register a project. Body `{ path, name? }`. 409 if path already registered |
| `DELETE` | `/projects/:id` | Unregister (does not delete the project directory) |
| `GET` | `/resolve?path=…` | Find a project by filesystem path (parent-path match supported) |

### Hub state

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/state` | `{ mode, version, projectCount, uptime }` |
| `GET` | `/cli-status` | Whether the `specrails-hub` CLI is installed and resolvable on PATH |
| `GET` | `/available-providers` | Provider catalogue (Claude, Codex) used by the setup wizard |
| `GET` | `/setup-prerequisites?diagnostic=1` | Tool checks (`node`/`npm`/`npx`/`git`, optionally `uv`). With `?diagnostic=1` returns `pathSegments`, `pathSources`, `loginShellStatus`, `whichResults` |
| `GET` | `/core-compat` | specrails-core version compatibility probe |

### Settings, budget, theme

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/settings` | Hub-wide settings |
| `PUT` | `/settings` | Update one key: `{ key, value }` |
| `GET` | `/budget` | Hub-wide budget config |
| `PATCH` | `/budget` | Update hub-wide budget |
| `GET` | `/theme` | Current UI theme |
| `PATCH` | `/theme` | Set UI theme (`dracula`, `aurora-light`, `obsidian-dark`) |
| `GET` | `/terminal-settings` | Hub-wide terminal panel defaults |
| `PATCH` | `/terminal-settings` | Update hub terminal defaults |

### Analytics (hub-wide)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/analytics` | Cross-project aggregated metrics |
| `GET` | `/recent-jobs` | Recent jobs across all projects |

### Agents catalogue (hub-wide)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/agents` | List all configured agents |
| `GET` | `/agents/:id` | Get one agent |
| `POST` | `/agents` | Create an agent entry |
| `PATCH` | `/agents/:id` | Update |

### Webhooks

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/webhooks` | List webhooks |
| `POST` | `/webhooks` | Create |
| `PATCH` | `/webhooks/:id` | Update |
| `DELETE` | `/webhooks/:id` | Delete |
| `POST` | `/webhooks/:id/test` | Fire a test payload |

---

## `/api/projects/:projectId/*`

All routes below are prefixed with `/api/projects/:projectId/`. In the client, use `getApiBase()` as the prefix — it injects the active project ID for you.

### Spawn / commands / config

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/spawn` | Queue a command job. Body `{ command, profileName? }` |
| `GET` | `/config` | List discovered `/specrails:*` and `/opsx:*` commands |
| `POST` | `/config` | Force re-discovery |
| `GET` | `/default-spec-model` | Default model for Quick spec generation in this project |

### Pipelines and jobs

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/pipelines/:pipelineId` | One pipeline (group of jobs) |
| `GET` | `/state` | Active job, queue depth, paused flag |
| `GET` | `/activity` | Chronological event log |
| `GET` | `/issues` | GitHub issues linked to the project |
| `GET` | `/jobs` | Job list (`?limit=&offset=&status=`) |
| `GET` | `/jobs/export` | CSV/JSON export |
| `GET` | `/jobs/:id` | One job (with full log) |
| `GET` | `/jobs/compare` | Compare metrics between two jobs |
| `DELETE` | `/jobs/:id` | Cancel a running job |
| `DELETE` | `/jobs` | Clear completed jobs |
| `PATCH` | `/jobs/:id/priority` | Re-rank a queued job |
| `GET` | `/jobs/:jobId/diagnostic` | Stream a diagnostic ZIP (telemetry + profile + plugins snapshots) |

### Queue

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/queue` | Current queue state |
| `POST` | `/queue/pause` | Pause |
| `POST` | `/queue/resume` | Resume |
| `PUT` | `/queue/reorder` | Reorder. Body `{ jobIds: string[] }` |

### Analytics + spending

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/stats` | Summary (total jobs, tokens, cost) |
| `GET` | `/metrics` | Raw metrics |
| `GET` | `/spending` | Burn-rate / timeline / by-surface / by-model / top-tickets — powers the Analytics page |
| `GET` | `/invocations` | Paginated raw `ai_invocations` rows |
| `GET` | `/tickets/:id/spending-summary` | Per-ticket cross-surface aggregate (powers `TicketSpendingLine`) |
| `GET` | `/analytics/export?format=csv\|json&mode=summary\|raw&…` | Multi-section summary CSV/JSON or raw rows (10 000 cap) |

### Budget

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/budget` | Daily cap + per-job alert |
| `PATCH` | `/budget` | Update |

### Tickets

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/tickets` | Filters: `?status=`, `?label=`, `?q=` |
| `GET` | `/tickets/:id` | One ticket |
| `POST` | `/tickets` | Create |
| `PATCH` | `/tickets/:id` | Update any subset of fields |
| `DELETE` | `/tickets/:id` | Delete (cascades draft conversation if last reference) |
| `POST` | `/tickets/generate-spec` | Quick mode generation. Body `{ title, model?, contractRefine? }`. Streams progress over WS |
| `POST` | `/tickets/save-as-draft` | Persist Explore conversation as draft (idempotent on `conversationId`) |
| `POST` | `/tickets/from-draft` | Commit a draft (flip-in-place) or insert a new ticket |
| `POST` | `/tickets/:id/contract-refine` | Retry Contract Refine for an existing ticket (202 / 404 / 409) |
| `POST` | `/tickets/:id/smash` | SMASH an epic into sub-specs |
| `POST` | `/tickets/:id/smash/undo` | Undo a SMASH operation |
| `DELETE` | `/tickets/:id/children` | Delete all children of an epic |
| `POST` | `/tickets/:id/ai-edit` | Open an AI edit session against the ticket |
| `DELETE` | `/tickets/:id/ai-edit` | Cancel an AI edit session |
| `GET` | `/tickets/:ticketId/attachments` | List attachments |
| `GET` | `/tickets/:ticketId/attachments/:attachmentId` | Download |
| `DELETE` | `/tickets/:ticketId/attachments/:attachmentId` | Delete one |
| `DELETE` | `/tickets/:ticketId/attachments` | Delete all |

### Chat / Explore

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/chat/conversations` | List (filter by `?kind=sidebar\|explore`) |
| `POST` | `/chat/conversations` | Create. Body `{ kind?, model? }` |
| `GET` | `/chat/conversations/:id` | One conversation |
| `PATCH` | `/chat/conversations/:id` | Update metadata (title, contextScope, etc.) |
| `DELETE` | `/chat/conversations/:id` | Delete (cascades into draft tickets' `origin_conversation_id`) |
| `GET` | `/chat/conversations/:id/messages` | List messages |
| `POST` | `/chat/conversations/:id/messages` | Send a turn; streams over WS |
| `DELETE` | `/chat/conversations/:id/messages/stream` | Cancel an in-progress turn |
| `GET` | `/chat/conversations/:id/spec-draft` | Live spec draft state |
| `POST` | `/chat/conversations/:id/minimize` | Park session (arms idle-kill timer) |
| `POST` | `/chat/conversations/:id/restore` | Cancel the idle-kill timer |

### Setup wizard

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/setup/install-config` | Write `install-config.yaml` to the project |
| `POST` | `/setup/install` | Run `npx specrails-core init --from-config` |
| `POST` | `/setup/quick-install` | Convenience: write config + install in one call |
| `GET` | `/setup/checkpoints` | Checkpoint state + last log lines |
| `POST` | `/setup/abort` | Abort the wizard |

### Proposals

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/propose` | List spec proposals |
| `POST` | `/propose` | Create |
| `GET` | `/propose/:id` | One proposal |
| `POST` | `/propose/:id/refine` | Refine with feedback |
| `POST` | `/propose/:id/create-issue` | Convert proposal to GitHub issue |
| `DELETE` | `/propose/:id` | Delete |

### OpenSpec changes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/changes` | List active changes in `.specrails/changes/` |
| `GET` | `/changes/:changeId/artifacts/:artifact` | Get one artifact |

### Spec launcher (batch)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/spec-launcher/start` | Launch a batch run |
| `DELETE` | `/spec-launcher/:launchId` | Cancel a launch |

### Templates

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/templates` | List templates |
| `POST` | `/templates` | Create |
| `GET` | `/templates/:templateId` | One template |
| `PATCH` | `/templates/:templateId` | Update |
| `DELETE` | `/templates/:templateId` | Delete |
| `POST` | `/templates/:templateId/run` | Run the template against the project |

### Integration contract

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/integration-contract` | Read the project's `integration-contract.json` |

### Terminals

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/terminals` | List PTY sessions |
| `POST` | `/terminals` | Create a session |
| `PATCH` | `/terminals/:id` | Rename |
| `DELETE` | `/terminals/:id` | Kill |
| `GET` | `/terminals/:id/marks` | Persisted command marks (OSC 133) |

### Project settings

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/settings` | Project settings |
| `PATCH` | `/settings` | Update |
| `GET` | `/terminal-settings` | Per-project terminal overrides |
| `PATCH` | `/terminal-settings` | Update |
| `GET` | `/agent-models` | Per-agent model overrides |
| `PATCH` | `/agent-models` | Update |
| `GET` | `/context-budget` | Context-window budget per surface |
| `GET` | `/context-scope-last` | Last-used context scope per surface (sticky preset) |
| `PATCH` | `/context-scope-last` | Update sticky preset |
| `GET` | `/add-spec-quick-contract-refine-last` | Last-used Quick mode Contract Refine toggle |
| `PATCH` | `/add-spec-quick-contract-refine-last` | Update toggle |

---

## `/api/projects/:projectId/rails/*`

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | List rails |
| `PUT` | `/:railIndex/tickets` | Assign tickets to a rail. Body `{ ticketIds: number[] }` |
| `PUT` | `/:railIndex/profile` | Set the rail's default profile |
| `POST` | `/:railIndex/launch` | Launch the rail (Play) |

---

## `/api/projects/:projectId/profiles/*`

### Profile CRUD

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | List profiles |
| `POST` | `/` | Create (validator enforces baseline trio + routing ordering) |
| `GET` | `/:name` | One profile |
| `PATCH` | `/:name` | Update |
| `DELETE` | `/:name` | Delete |
| `POST` | `/:name/duplicate` | Duplicate. Body `{ newName }` |
| `POST` | `/:name/rename` | Rename. Body `{ newName }` |
| `GET` | `/resolve?profile=…` | Preview resolution (which profile would run given a selection) |

### Bootstrap and analytics

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/migrate-from-settings` | Seed `default.json` from existing agent frontmatter |
| `GET` | `/analytics?windowDays=30` | Per-profile usage analytics |
| `GET` | `/core-version` | specrails-core version probe (drives the upgrade banner) |

### Agents catalogue + studio

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/catalog` | Read upstream `sr-*` + custom `custom-*` agents |
| `GET` | `/catalog/:agentId` | One agent |
| `POST` | `/catalog` | Create a custom agent (template/blank/duplicate) |
| `PATCH` | `/catalog/:agentId` | Update a custom agent |
| `DELETE` | `/catalog/:agentId` | Delete a custom agent |
| `POST` | `/catalog/test` | Test-run a draft against a sample task (no FS writes) |
| `POST` | `/catalog/generate` | Generate `.md` via Claude from natural-language description |
| `GET` | `/catalog/:agentId/versions` | Version history |

### Agent refine sessions

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/catalog/:agentId/refine` | Open a refine session |
| `GET` | `/catalog/:agentId/refine` | List sessions |
| `GET` | `/catalog/:agentId/refine/:refineId` | One session |
| `PATCH` | `/catalog/:agentId/refine/:refineId` | Update |
| `DELETE` | `/catalog/:agentId/refine/:refineId` | Cancel |
| `POST` | `/catalog/:agentId/refine/:refineId/turn` | Send a turn |
| `POST` | `/catalog/:agentId/refine/:refineId/apply` | Apply the diff to the agent file |

---

## `/api/projects/:projectId/plugins/*`

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | List bundled plugins with installed/orphan/degraded state |
| `GET` | `/:name/preview-install` | Diff of what would be added to `.mcp.json` and agents/ |
| `POST` | `/:name/install` | Install (streams progress over WS) |
| `DELETE` | `/:name` | Uninstall or remove orphan |
| `POST` | `/:name/activate` | Activate (post-install) |
| `POST` | `/:name/deactivate` | Deactivate |
| `POST` | `/:name/update` | Update to the latest bundled version |
| `GET` | `/:name/health` | On-demand verify (2 s timeout) |
| `POST` | `/_prerequisites/:prereq/install` | Install a plugin prerequisite (e.g. `uv` for Serena) |
| `POST` | `/_marketplace/disable` | Hide the integrations marketplace for this project |

---

## `/api/docs/*`

The bundled documentation portal (served by `docs-router`).

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/` | List categories. Top-level `.md` files → synthetic `guides` category; each subdirectory becomes its own category |
| `GET` | `/:category/:slug` | Fetch one document (`{ title, content, category, slug }`) |

Source resolution: `~/.specrails/docs/` (user-editable) wins if present; otherwise the bundled `docs/` from the install.

---

## `/otlp/v1/{traces,metrics,logs}`

OTLP/JSON receiver used by the pipeline-telemetry feature. Reads `specrails.job_id` and `specrails.project_id` from `resource.attributes`. Returns:

- `400` — attributes missing
- `404` — unknown project or job
- `200` — payload accepted

10 MB cap per blob. Once a log payload pushes a blob over the cap, further logs are dropped (a one-shot `logs_truncated` control line is written).

---

## WebSocket — `/ws`

A single connection at `ws://127.0.0.1:4200/ws?token=<authToken>`. The token query param is required.

Every project-scoped message includes a `projectId` field. Hub-level messages have no `projectId` and reach every handler.

### Outbound events (server → client)

| Type | Scope | Notes |
|------|-------|-------|
| `init` | project | Job started |
| `log` | project | Streaming log line |
| `phase` | project | Pipeline phase transition |
| `done` | project | Job exit (`{ jobId, exitCode, duration, cost, tokens }`) |
| `queue` | project | Queue snapshot |
| `queue_update` | project | Queue mutation |
| `cost_alert` | project | Job exceeded per-job alert threshold |
| `daily_budget_exceeded` | project | Daily budget hit; queue paused |
| `hub_daily_budget_exceeded` | hub | Hub-level daily budget hit |
| `pipeline_status` | project | Pipeline finished |
| `ticket_created` | project | New ticket (`{ ticket, timestamp }`) |
| `ticket_updated` | project | Ticket changed. `ticket.id === 0` signals a full external refetch |
| `ticket_deleted` | project | Ticket removed |
| `spec_gen_stream` | project | Quick generation streaming chunk |
| `spec_gen_done` | project | Quick generation finished |
| `spec_gen_error` | project | Quick generation failed |
| `spending.invalidated` | project | Analytics cache should refetch (no payload) |
| `agent.changed` | project | Agent catalog updated |
| `profile.changed` | project | Profile catalog updated |
| `plugin.health_changed` | project | A plugin's health status flipped |
| `plugin.prereq_installed` | project | A plugin prerequisite was installed |
| `setup_log` | project | Setup wizard streaming log line |
| `setup_chat` | project | Setup wizard assistant chunk |
| `setup_checkpoint` | project | Setup checkpoint state change |
| `setup_install_done` | project | `npx init` finished |
| `setup_complete` | project | Setup wizard wrapping up |
| `setup_turn_done` | project | One setup chat turn finished |
| `setup_error` | project | Setup wizard failed |
| `hub.project_added` | hub | New project registered |
| `hub.project_removed` | hub | Project unregistered |
| `hub.projects` | hub | Bulk project list refresh |

### Client filtering pattern

WS handlers use a ref (not state) to avoid stale closures:

```tsx
const activeProjectIdRef = useRef(activeProjectId)
useEffect(() => { activeProjectIdRef.current = activeProjectId }, [activeProjectId])

// In WS message handler:
if (msg.projectId && msg.projectId !== activeProjectIdRef.current) return
```

Hub-level messages (no `projectId`) are processed by every handler.

---

## WebSocket — `/ws/terminal/:id`

A dedicated WebSocket for terminal PTY traffic. Separate from `/ws` so a chatty shell can never starve project events.

Connect with `?token=<authToken>&projectId=<id>`.

Attach protocol:

1. Server sends the existing scrollback as one binary frame.
2. Server sends a `{ type: "ready", cols, rows }` JSON frame.
3. Live PTY output streams as binary frames.
4. Shell-integration marks (OSC 133/1337) parsed server-side stream as JSON `{ type: "mark", kind, … }` frames.

Client → server: text input as binary; `{ type: "resize", cols, rows }` JSON on viewport changes.

---

## Errors

The hub uses standard HTTP status codes. Notable conventions:

- `400` — malformed body / invalid params
- `401` — missing or invalid Bearer token
- `403` — request from outside loopback (rare; defence-in-depth)
- `404` — resource not found
- `409` — write conflict (file lock contention on tickets, plugin name collision, project path already registered)
- `500` — unhandled exception (logged to stdout)

Error responses are always `{ "error": "<message>" }`.

---

## Caveats

- **Surface drift**: This file is hand-maintained against `git grep router.[a-z]+\(` over `server/*-router.ts`. The hub adds endpoints regularly; if a route exists in code but not here, please open an issue.
- **Stability**: routes under `/api/hub/*` and `/api/projects/:projectId/*` are considered stable. The hub holds a few additional legacy endpoints (proxy routes, the unused AI-enrich setup flow) that are not exposed in the UI and are intentionally not documented here.
