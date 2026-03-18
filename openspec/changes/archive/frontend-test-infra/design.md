# Design: frontend-test-infra

## Test Infrastructure

### Dependencies (client/package.json devDependencies)
- `vitest` (shared from root, already ^3.0.0)
- `@testing-library/react` ^16
- `@testing-library/jest-dom` ^6
- `@testing-library/user-event` ^14
- `jsdom` (latest)

### Configuration
- New `client/vitest.config.ts` using jsdom environment, `@vitejs/plugin-react`
- New `client/src/test-setup.ts` with jest-dom matchers, global mocks (fetch, WebSocket, localStorage, router)
- Root `package.json` gets `test:client` script: `cd client && npx vitest run`
- Root vitest.config stays unchanged (server/CLI only)

### Mock Strategy
- **fetch**: `vi.fn()` in test-setup, each test configures responses
- **WebSocket**: Custom `MockWebSocket` class that simulates open/message/close
- **react-router-dom**: `MemoryRouter` wrapper for all component tests
- **getApiBase()**: Mock `lib/api.ts` module to return predictable base
- **useHub()**: Mock at module level for component tests that depend on hub context
- **localStorage**: jsdom provides this, but reset between tests
- **sonner toast**: Mock `toast` from sonner to assert notifications
- **Radix portals**: jsdom handles these natively

## Bug Fixes Design

### A1: TabBar — Delete without confirmation
**Fix**: Add confirmation state to `ProjectTab`. First click shows "Confirm?" text with a brief timeout (3s) — second click actually removes. No modal needed (too heavy for tab UX).

### A3: useChat — Optimistic message without rollback
**Fix**: On fetch error, remove the optimistic message from conversation and show error toast via a callback or by importing toast directly.

### A5: App.tsx — Hub mode detection without timeout
**Fix**: Add `AbortController` with 5s timeout to the fetch in `useHubMode()`. On timeout, fall back to legacy mode.

### A7: JobDetailPage — No log line limit
**Fix**: Cap `events` array at 10,000 entries. When exceeded, drop oldest 2,000 entries (keep last 8,000). This is a sliding window that preserves recent context.

### A8: useSharedWebSocket — Gives up after 5 retries
**Fix**: After exhausting the initial backoff delays, continue retrying every 30s indefinitely. Set status to `'reconnecting'` (new state) to distinguish from permanent disconnect. Reset retry count on successful connection.

### A2, A4, A6: Deferred
- A2 (path validation): Low risk, server already validates
- A4 (streaming abort text): Edge case, fix in follow-up
- A6 (setup cache persistence): Complex localStorage serialization, follow-up

## Test Organization

```
client/src/
  test-setup.ts                    # Global setup
  test-utils.tsx                   # renderWithProviders helper
  hooks/
    __tests__/
      useProjectCache.test.ts
      useChat.test.ts
      usePipeline.test.ts
      useProposal.test.ts
      useHub.test.tsx
      useSharedWebSocket.test.tsx
  components/
    __tests__/
      TabBar.test.tsx
      AddProjectDialog.test.tsx
      CommandGrid.test.tsx          # Existing file, wire up
      ChatPanel.test.tsx
      ChatInput.test.tsx
      MessageList.test.tsx
      SetupWizard.test.tsx
      PipelineProgress.test.tsx
      LogViewer.test.tsx
      RecentJobs.test.tsx
      StatusBar.test.tsx
      WelcomeScreen.test.tsx
  pages/
    __tests__/
      DashboardPage.test.tsx
      JobDetailPage.test.tsx
      AnalyticsPage.test.tsx
      SettingsPage.test.tsx
  __tests__/
    App.test.tsx
    flows/
      add-project-flow.test.tsx
      project-switch-flow.test.tsx
      chat-flow.test.tsx
      job-lifecycle-flow.test.tsx
```
