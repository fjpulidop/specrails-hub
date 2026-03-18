# Proposal: frontend-test-infra

## Problem

The specrails-hub frontend has **zero test coverage**: 57 React components, 6 custom hooks, 2 context providers, and 4 pages — all untested. The only client test file (`CommandGrid.test.tsx`) isn't wired up (no vitest config, no jsdom, no testing-library installed).

Users are experiencing multiple broken flows in production. Without tests, regressions ship silently.

## Category A Bugs Identified

| ID | Component | Bug | Impact |
|----|-----------|-----|--------|
| A1 | `TabBar.tsx` | Delete project without confirmation, error silently swallowed | Data loss |
| A2 | `AddProjectDialog.tsx` | No path validation before POST | Confusing server errors |
| A3 | `useChat.ts` | Optimistic message add without rollback on failure | Lost messages |
| A4 | `useChat.ts` | Streaming abort leaves partial text visible | Broken UI state |
| A5 | `App.tsx` | Hub mode detection has no timeout | App hangs if server slow |
| A6 | `SetupWizard.tsx` | Module-level cache lost on page refresh | Setup progress lost |
| A7 | `JobDetailPage.tsx` | No max log line limit | Browser OOM on long jobs |
| A8 | `useSharedWebSocket.tsx` | Gives up after 5 retries permanently | Dead app without notice |

## Solution

1. **Install test infrastructure**: vitest client config, jsdom, @testing-library/react, user-event
2. **Write hook unit tests**: All 6 custom hooks with mocked fetch/WS
3. **Write component tests**: All critical user-facing components
4. **Fix Category A bugs**: Each fix accompanied by a regression test
5. **Write integration flow tests**: End-to-end user flows with mocked APIs

## Scope

- **In scope**: Client-side tests only (`client/src/**`), bug fixes for Category A issues
- **Out of scope**: Server tests, E2E/Cypress tests, Category B edge cases (follow-up change)

## Success Criteria

- All frontend tests pass in CI (`npm run test:client`)
- Category A bugs fixed with regression tests
- Coverage of all 12 critical user flows
