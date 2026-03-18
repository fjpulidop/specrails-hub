---
id: backend-test-coverage
title: "Backend 100% Test Coverage — Technical Design"
date: 2026-03-18
---

# Technical Design

## Testing Strategy

All tests use vitest with `:memory:` SQLite databases. Modules that spawn child processes (chat-manager, queue-manager, setup-manager, proposal-manager) are tested with mocked `child_process` and `tree-kill`. Router tests use supertest with Express app instances.

## Module-by-Module Plan

### hub-db.ts (141 lines, 0% → 100%)
- Test schema migrations with `:memory:` DB
- Test all CRUD: addProject, removeProject, listProjects, getProject, getProjectBySlug, getProjectByPath
- Test UNIQUE constraint violations (duplicate slug, duplicate path)
- Test settings: getHubSetting, setHubSetting, upsert behavior
- Test touchProject timestamp update

### setup-manager.ts (526 lines, 0% → 100%)
- Mock child_process.spawn and tree-kill
- Test checkpoint initialization and progression
- Test detectCheckpointFromText() with various inputs
- Test filesystem checkpoint detection (mock fs)
- Test abort cleans up timers and processes
- Test isInstalling/isSettingUp state tracking
- Test poll timer lifecycle

### project-registry.ts (130 lines, 0% → 100%)
- Mock all dependent managers (QueueManager, ChatManager, etc.)
- Test loadAll, addProject, removeProject
- Test getContext, getContextByPath, listContexts
- Test double-load prevention
- Test error handling in config loading

### hub-router.ts (137 lines, 0% → 100%)
- Use supertest with Express app
- Mock ProjectRegistry and hub-db functions
- Test all 7 routes: GET/POST/DELETE projects, state, resolve, GET/PUT settings
- Test validation errors (missing path, invalid params)
- Test 409 on duplicate project
- Test 404 on non-existent project

### analytics.test.ts expansion (30% → 100%)
- Percentile edge cases: single element, identical values
- Bonus metrics: costPerSuccess, apiEfficiencyPct, failureCostUsd, modelBreakdown
- Custom period with previous period deltas
- Token efficiency and command performance with multiple commands
- Daily throughput with mixed statuses

### project-router.ts expansion (40% → 100%)
- Queue routes: spawn, cancel (404/409), pause, resume, reorder, queue state
- Chat routes: CRUD conversations, send message, abort stream
- Setup routes: install, start, message, checkpoints, abort
- Config routes: GET/POST config
- Issues route: with/without tracker
- Analytics route: validation, all periods

### chat-manager.test.ts expansion (50% → 100%)
- Claude not on path → chat_error broadcast
- Conversation not found → early return
- Auto-title trigger on first turn
- Process exit with non-zero code → chat_error
- Empty response handling

### queue-manager.test.ts expansion (60% → 100%)
- Reorder with invalid job IDs
- Log buffer overflow (>5000 lines)
- Multiple jobs in queue draining sequentially
- Pause/resume with active job
- Phase definitions for commands
