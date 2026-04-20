## Context

Specrails pipeline jobs are orchestrated by a Claude Code session (the "hub" skill, `/specrails:implement`, which lives in the specrails-core repo). The hub spawns subagents (architects, developers, reviewers). When any phase stalls or the hub's context fills, the session exits cleanly (`exit 0`) mid-pipeline with almost no diagnostic trail. The only evidence of a 2h 8min architect stall in the recent bug report came from wall-clock log timestamps.

This repo (`specrails-hub`) is the dashboard + Express server that spawns `claude` child processes via `QueueManager` for each job. Because `QueueManager` owns the spawn, it controls the environment of the pipeline session — making it the natural injection point for Claude Code's built-in OpenTelemetry support.

Claude Code emits OTEL when `CLAUDE_CODE_ENABLE_TELEMETRY=1` and OTLP endpoint env vars are set. Every nested subagent inherits the env and reports under the same session. No changes are needed in specrails-core.

The user has hard product constraints for this feature:
- OFF by default
- Zero config: toggle on, it works — no collector to install, no endpoints to enter
- No new visualizations in the hub UI
- Data usable for bug reports (shareable zip)

## Goals / Non-Goals

**Goals:**
- Provide opt-in, zero-config capture of pipeline subagent telemetry (tokens, tool calls, durations, errors, costs).
- Surface captured data only through a single "Export diagnostic" action, producing a shareable zip.
- Preserve raw fidelity for a bounded window (7d) so real failures can be reconstructed; auto-compact afterwards.
- Store data in the existing per-project data layout (`~/.specrails/projects/<slug>/`).

**Non-Goals:**
- No in-app timeline, chart, or dashboard UI. The user rejected this explicitly.
- No instrumentation of `ChatManager` or `SetupManager` spawns.
- No changes to `specrails-core` or the `/specrails:implement` skill.
- No telemetry for legacy (single-project) mode initially — hub mode only.
- No external OTEL collector support. The hub is the only accepted receiver.
- No sampling. Either fully on for a run, or fully off.

## Decisions

### Decision 1: OpenTelemetry over custom heartbeat files

**Choice:** Use Claude Code's built-in OTEL emission.

**Alternatives considered:**
- *Custom NDJSON heartbeat files written by subagents via prompt instructions.* Rejected — requires prompt changes in specrails-core, LLMs drift from instructions, quality of capture uneven.
- *Wrap Agent calls in the skill with timing only.* Rejected — requires skill changes, gives only black-box wall-clock, no per-tool-call insight.
- *Spawn `claude -p` as subprocess and parse stream-json.* Rejected — big refactor of the orchestration model; out of scope.

**Rationale:** OTEL is already emitted natively with zero code changes. The data includes per-session token counts, tool decisions, API request durations, errors, and cost — exactly the signals needed to diagnose the bug case.

### Decision 2: Embedded OTLP/JSON receiver on the Express server

**Choice:** Accept OTLP via HTTP+JSON at `/otlp/v1/traces`, `/otlp/v1/metrics`, `/otlp/v1/logs` on the existing hub port (4200).

**Alternatives considered:**
- *Local `otelcol` collector process.* Rejected — violates "zero config".
- *OTLP/protobuf.* Rejected — needs protobuf schema dependency.
- *Separate port.* Rejected — more firewall / packaging surface for the desktop build.

**Rationale:** JSON transport has a stable public schema, parseable with no new dependencies. Reusing port 4200 keeps the desktop sidecar packaging unchanged.

### Decision 3: Per-project toggle (not hub-global)

**Choice:** Setting lives in the project `SettingsPage`, persisted in the per-project SQLite.

**Alternatives considered:**
- *Hub-global setting.* Simpler, but you pay the telemetry cost on every project even when only one is flaky. User preference is per-project.

**Rationale:** Telemetry in this product is a debugging aid, not a default. Per-project lets a user enable it only where needed.

### Decision 4: Raw NDJSON.gz blobs on disk, pointer rows in SQLite

**Choice:** Per-job raw telemetry stored as a single gzipped NDJSON file at `~/.specrails/projects/<slug>/telemetry/<jobId>.ndjson.gz`. SQLite table `telemetry_blobs` stores `(jobId, path, byteSize, startedAt, endedAt, state)`.

**Alternatives considered:**
- *Inline rows in `jobs.sqlite`.* Rejected — 10 MB × 30 jobs bloats the DB, vacuums become heavy.
- *Per-event rows.* Rejected — write amplification; OTEL bursts can be thousands of events per second.

**Rationale:** Append-only gzipped file is cheap to write, trivial to zip for export, and decouples retention from DB lifecycle.

### Decision 5: Tiered retention, no sampling

**Choice:** Capture everything. Raw blob retained 7 days. After 7 days, compact to per-phase summary rows (`telemetry_summaries` table) and delete the blob. Hard cap: 10 MB per job blob; overflow drops the oldest log lines but keeps all metrics.

**Rationale:** The user prioritized "more information when things fail" over storage economy. Failures are rare and recent; historical trends only need summaries.

### Decision 6: Export button visibility decoupled from current setting state

**Choice:** `[Export diagnostic]` button on a job card is visible iff a telemetry blob exists for that job, not based on the current setting value.

**Rationale:** If a user runs a job with telemetry ON, later toggles OFF, the historical data is still valuable. Gating the button on live setting state would hide recoverable bug reports after a toggle flip.

### Decision 7: Job identity binding via `OTEL_RESOURCE_ATTRIBUTES`

**Choice:** `QueueManager` injects `OTEL_RESOURCE_ATTRIBUTES=specrails.job_id=<jobId>,specrails.project_id=<projectId>` so the receiver can route incoming OTLP payloads to the correct job blob without needing to correlate by PID or session_id.

**Rationale:** The OTEL resource is emitted on every payload. Route at ingestion, no post-hoc correlation.

## Risks / Trade-offs

- **[Risk] OTLP payload from Claude Code changes shape across versions.** → Mitigation: store raw payload unchanged; parse only `resource.attributes` (for job routing) at ingestion. Summary extraction is a separate offline step, safe to evolve.
- **[Risk] Receiver runs in the same Express process; a flood of metrics could slow API responses.** → Mitigation: route handler writes to the blob file asynchronously via a bounded append queue; drops events (logged) if queue > 10k.
- **[Risk] `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at localhost fails inside sandboxed / restricted network environments.** → Mitigation: treat network failure as non-fatal on the claude side (OTEL SDK is best-effort by default). Document limitation.
- **[Risk] 10 MB cap silently drops log events.** → Mitigation: include a `truncated: true` marker in `summary.md` when cap is hit, so bug reports flag it explicitly.
- **[Trade-off] No live UI.** A future user may ask "what is the hub doing right now?" — the answer is "wait for the zip, or tail the ndjson file manually." Acceptable per current product scope.
- **[Trade-off] No specrails-core changes.** If Claude Code's OTEL emission turns out to miss a signal we need, we cannot add it via prompt. Acceptable: native OTEL already covers the identified gaps (duration, tokens, tool calls, errors).

## Migration Plan

- No migration required. New capability only.
- New SQLite tables are created by a migration in the per-project DB when a project is loaded post-upgrade. Absence is harmless for projects without telemetry.
- Rollback: toggle off; uninstall is a file deletion of `telemetry/` directory. No schema destruction needed.

## Open Questions

- Should the `[Export diagnostic]` button also be available when telemetry is OFF but logs exist, to produce a reduced zip (metadata + logs + summary with a "telemetry not captured" note)? Default answer: no — keep scope tight; this can be added later without breaking the contract.
- Compaction job trigger: run on server startup and daily via `setInterval`, or only on startup? Default answer: startup only; keeps the server simple. If disks fill in practice, add a scheduled pass.
