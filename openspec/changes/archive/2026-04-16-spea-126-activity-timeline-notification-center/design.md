## Context

specrails-hub stores job lifecycle data in two per-project SQLite tables: `jobs` (one row per CLI invocation with status, timestamps, cost) and `events` (streaming log events tied to a job via `job_id`). There is currently no single endpoint that aggregates these into a human-readable activity feed.

The client has an established WebSocket fan-out architecture where all messages are broadcast to all connected clients; per-project handlers filter by `projectId`. The navbar (`ProjectNavbar`) and layout (`ProjectLayout`) have clear extension points. `localStorage` is already used for UI state persistence elsewhere in the client.

## Goals / Non-Goals

**Goals:**
- Single REST endpoint returning a deduplicated activity feed per project
- Cursor-based pagination (`after` param) so the client can load older items
- Real-time updates by reusing existing WebSocket messages (`phase`, `queue`, `event`)
- Bell icon with unread badge in `ProjectNavbar`; dropdown with recent items; mark-as-read on click; read state in `localStorage`
- Dedicated `/activity` page with a full chronological feed
- Server-side tests for the new endpoint

**Non-Goals:**
- Push notifications or browser notification API
- Cross-project activity aggregation (that's `HubOverviewPage`'s job)
- Storing read state server-side
- New WebSocket message types (reuse existing)

## Decisions

### 1. Activity feed is a projection query, not a new table

The activity feed is computed on demand by querying `jobs` and synthesizing activity items from job status transitions. We do NOT store a separate `activity` table.

**Rationale:** A separate table would require write-path changes to `QueueManager` and `hooks.ts`. The existing `jobs` table already records `started_at`, `finished_at`, and `status`, which is enough to reconstruct a timeline. For event-level granularity we can optionally join `events` for notable markers (e.g., `agent_start`/`agent_stop` events per phase).

**Query strategy:**
```sql
SELECT
  j.id        AS job_id,
  j.command,
  j.status,
  j.started_at,
  j.finished_at,
  j.total_cost_usd,
  j.duration_ms
FROM jobs j
ORDER BY j.started_at DESC
LIMIT :limit
-- optional: WHERE j.started_at < :after for cursor pagination
```

Each job row maps to 1–2 activity items: `job_started` (from `started_at`) and `job_finished` / `job_failed` / `job_canceled` (from `finished_at` + `status`). Running jobs only emit `job_started`.

**Alternative considered:** Joining `events` table for phase-level activity (e.g., "Architect phase started"). Decided against for the initial implementation — the events table stores raw log lines, not structured phase markers. Phase activity comes via WebSocket `phase` messages in real-time, not from DB.

### 2. Cursor pagination via `before` timestamp

Use `before=<ISO timestamp>` as the cursor parameter (maps to `started_at < :before`). This is simpler than offset pagination and safe for append-only data.

Default `limit=50`, max `100`.

### 3. NotificationCenter reads state from `localStorage`

Read state key: `specrails:notifications:<projectId>`. Value: the `started_at` timestamp of the last-read item (items older than this are "read").

**Rationale:** Avoids a server round-trip and a new DB table. Read state is a UX affordance; losing it on browser clear is acceptable. Already consistent with how other UI state is persisted in the app.

### 4. Real-time updates via existing WS messages

`useActivity` subscribes to three message types:
- `phase` → synthesize a `phase_transition` activity item
- `queue` → detect newly added/completed jobs and prepend `job_started` / `job_finished` items
- `event` — ignored at this layer (too granular for the activity feed)

No new WS message types needed.

### 5. ActivityFeedPage as a standalone route, not a sidebar

Route: `/` (project root) remains the `DashboardPage`. Activity is at `/activity`. Added to `ProjectNavbar` nav links alongside existing ones.

**Rationale:** The feed can grow long; a full page gives it room. The `NotificationCenter` dropdown handles the "quick glance" use case without navigation.

## Risks / Trade-offs

- **Large job history** → Mitigation: default limit=50 + cursor pagination; server enforces max 100.
- **Clock skew in cursor** → Mitigation: use `started_at` which is set by server at job creation time; safe for single-machine use.
- **stale WS items** → Notification Center appends WS items without deduplication against the REST fetch. Mitigation: use `job_id` + `type` as a composite key in the client-side list to deduplicate.
- **localStorage per-project key collision** → Mitigation: key includes `projectId` slug.

## Migration Plan

No database migrations required. The endpoint is read-only against existing tables.

Deployment: ship server + client together (standard `npm run build`). No rollback strategy needed — the new endpoint and components are purely additive.

## Open Questions

None — scope is well-defined.
