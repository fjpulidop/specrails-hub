---
id: backend-test-coverage
title: "Backend 100% Test Coverage & Bug Fixes"
status: proposed
date: 2026-03-18
---

# Backend 100% Test Coverage & Bug Fixes

## Summary

Achieve 100% test coverage across all server/ modules. Add tests for the 4 untested modules (hub-db, setup-manager, project-registry, hub-router), expand coverage for undertested modules (analytics, project-router, chat-manager, queue-manager), and fix all bugs discovered during analysis.

## Motivation

Current backend test coverage is uneven:
- **4 modules have 0% coverage:** hub-db.ts, setup-manager.ts, project-registry.ts, hub-router.ts (934 lines of untested code)
- **4 modules are undertested:** analytics.ts (~30%), project-router.ts (~40%), chat-manager.ts (~50%), queue-manager.ts (~60%)
- Several bugs identified during analysis need fixing

## Scope

### New test files to create:
- `hub-db.test.ts` — Schema migrations, CRUD operations, settings, constraints
- `setup-manager.test.ts` — Checkpoint detection, process management, polling, abort
- `project-registry.test.ts` — Context loading, project lifecycle, error handling
- `hub-router.test.ts` — All 7 API endpoints, validation, error responses

### Existing test files to expand:
- `analytics.test.ts` — Percentile edge cases, date bounds, bonus metrics
- `project-router.test.ts` — Queue, chat, setup, config, issues routes
- `chat-manager.test.ts` — Auto-title, claude not found, empty responses
- `queue-manager.test.ts` — Error recovery, reorder, log buffer

### Bugs to fix:
- setup-manager: Filesystem poll timer leak potential
- analytics: Percentile handling edge cases already handled but untested

## Non-Goals

- No changes to client/ code
- No changes to CLI code
- No new features — only tests and bug fixes
- No refactoring beyond what's needed for testability
