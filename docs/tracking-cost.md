# Tracking cost

specrails-hub tracks every Claude CLI invocation it spawns and surfaces the totals in one Analytics page per project. This page walks through what's tracked, what's not, and how to read the dashboard.

## What gets tracked

Four surfaces, all per-project:

| Surface | What it captures |
|---------|------------------|
| **`job`** | Every rail run (Architect → Developer → Reviewer → Ship pipelines) |
| **`quick-spec`** | One-shot Quick spec generation |
| **`explore-spec`** | Every Explore conversation turn (including Contract Refine runs) |
| **`ai-edit`** | Continue Editing (refining an existing spec) |

Each invocation row carries: model, status, started/finished timestamps, duration (wall clock + API-only), tokens (in / out / cache read / cache create), total USD cost, turn count, and (when applicable) the ticket and conversation IDs it touched.

## What's NOT tracked (intentionally)

- **Sidebar chat** — the general-purpose chat panel in the right sidebar. It spawns a Claude process but is not pipeline work, so the hub excludes it from analytics by design.
- **Setup wizard** — the `npx specrails-core init` install run. Not a Claude invocation; it's an installer.

If you want the absolute total of what your Anthropic key has cost you, the Anthropic console is the source of truth.

## The Analytics page

Click **Analytics** in the project navbar.

### Sticky filter header

- **Period** — `24h`, `7d`, `30d`, or **Custom** (calendar picker).
- **Surface** — toggle which of the four surfaces are included. By default all four are on.

Both are URL-synced so you can share or bookmark a view.

### Hero burn meter

Big number at the top: total spend in the selected period, plus a `vs prev` delta (same period length ending at the same time the previous interval). A sparkline shows the daily trend.

When the project has zero invocations in the period (e.g. just started), the hero shows "Tracking started YYYY-MM-DD" — the date of the first invocation ever recorded.

### Daily stacked timeline

A daily bar chart for the period, stacked by surface. Days with zero activity are zero-filled so the x-axis is regular.

Surface colours (consistent across the page):

- `job` → blue (`accent-info`)
- `quick-spec` → purple (`accent-secondary`)
- `explore-spec` → highlight (`accent-highlight`)
- `ai-edit` → green (`accent-success`)

### Quick vs Explore card

Share-of-spend between Quick spec generation and Explore conversations. If Explore has fewer than 5 runs in the period, a CTA prompts you to try it.

### Top models

Top 10 models used in the period with their share of spend. Click a row to filter the rest of the page by that model.

### Cost-vs-turns scatter

A scatter plot of the last 500 invocations: x = turns, y = cost. Helps spot the outlier "this Explore session burned 4×" runs.

### Top tickets

Top 10 tickets by total spend across all surfaces. Two synthetic buckets always shown:

- **Deleted tickets** — invocations whose `ticket_id` no longer resolves.
- **Unattributed** — invocations with no `ticket_id` (mostly mid-Explore turns before commit).

### Raw invocations table

Bottom of the page. Paginated 50 rows at a time. Secondary filters scoped to the table only (date range narrower than the period, status, min cost).

Columns: timestamp, surface, model, status, turns, tokens, cost, duration, ticket link.

## Per-ticket spending

Inside any spec's detail modal there's a one-line spending summary just below the title:

```
$0.42 · 3 turns · 4m 12s active · Job: $0.30 · Explore: $0.08 · AI Edit: $0.04
```

Clicking the line opens Analytics filtered to that ticket (`?ticketId=<id>` in the URL).

## Exports

Top-right of the Analytics page → **Export** dropdown. Four options:

| Export | Format | What's included |
|--------|--------|-----------------|
| **Summary CSV** | Multi-section CSV | Totals, daily timeline, by-surface, by-model, top tickets |
| **Summary JSON** | JSON | Same data, structured |
| **Raw CSV** | CSV | One row per invocation, capped at 10 000 rows |
| **Raw JSON** | JSON | Same |

Filename pattern: `<project-slug>-analytics-<period>[-<surface>]-<YYYY-MM-DD>.{csv,json}`.

Raw exports above 10 000 rows append a `# truncated_at=N of M` comment line. If you need more, narrow the period filter or the surface filter.

Tauri webview note: exports use the standard `fetch → Blob → URL.createObjectURL → anchor.click()` pattern — works the same as in a browser. On failure a sonner `Export failed` toast surfaces.

## Setting a budget

Open **Settings** in the project navbar:

- **Daily budget (USD)** — the hub pauses the queue when the rolling 24-hour spend exceeds this. New rail launches get queued; in-flight jobs aren't killed.
- **Per-job alert threshold** — emits a notification when a single job exceeds the threshold.

Either field can be left blank to disable the limit.

When the budget is hit, a banner appears on the Dashboard and the rail Play buttons grey out. Resume by raising the budget, clearing it, or waiting for the rolling window to slide.

See [Customising the hub](customizing.md#budget) for the full setup.

## Hub-wide analytics

For the cross-project view, open **Hub Analytics** from the Arc sidebar at the bottom of the screen. Same blocks but aggregated across all your registered projects.

## Where to go next

- [Customising the hub](customizing.md) — set the budget, configure notifications.
- [Creating specs](creating-specs.md) — every spec you create now adds rows to your analytics.
