# Tasks: frontend-test-infra

## Phase 0: Infrastructure

- [ ] Install test dependencies in client/package.json
- [ ] Create client/vitest.config.ts (jsdom, react plugin, setup file)
- [ ] Create client/src/test-setup.ts (jest-dom, fetch mock, WS mock, localStorage reset)
- [ ] Create client/src/test-utils.tsx (renderWithProviders: MemoryRouter + HubProvider + WSProvider wrappers)
- [ ] Add `test:client` script to root package.json
- [ ] Verify infrastructure by running existing CommandGrid.test.tsx

## Phase 1: Hook Unit Tests

- [ ] useSharedWebSocket.test.tsx — connect, message fan-out, reconnect backoff, disposed cleanup
- [ ] useHub.test.tsx — load projects, add/remove, WS updates (hub.project_added/removed), setActiveProjectId syncs API context
- [ ] useProjectCache.test.ts — cache hit on project switch, stale-while-revalidate, race condition (cancelled flag), polling
- [ ] useChat.test.ts — load conversations, send message (optimistic), receive stream, abort, project switch cache, command proposals
- [ ] usePipeline.test.ts — init message, phase transitions, log accumulation, queue state, project switch cache
- [ ] useProposal.test.ts — state machine (idle→exploring→review→refining→created), streaming, cancel, project switch reset

## Phase 2: Component Tests

- [ ] TabBar.test.tsx — render tabs, switch project, remove with confirmation (A1 fix)
- [ ] AddProjectDialog.test.tsx — validate inputs, submit, handle errors, trigger setup wizard
- [ ] CommandGrid.test.tsx — wire up existing tests, add click-to-spawn, wizard trigger
- [ ] ChatPanel.test.tsx — collapsed/expanded toggle, tab switching, badge count
- [ ] ChatInput.test.tsx — type message, Enter to send, Shift+Enter newline, disabled while streaming
- [ ] MessageList.test.tsx — render messages, auto-scroll, streaming text display
- [ ] PipelineProgress.test.tsx — render all phase states (idle/running/done/error)
- [ ] LogViewer.test.tsx — render events, filter, auto-scroll, jump-to-bottom
- [ ] RecentJobs.test.tsx — render job list, status filter, date filter, click to navigate, clear jobs
- [ ] StatusBar.test.tsx — connection status display, stats polling
- [ ] WelcomeScreen.test.tsx — render, add project button
- [ ] SetupWizard.test.tsx — phase transitions (proposal→installing→setup→complete), WS messages, error/retry

## Phase 3: Bug Fixes + Regression Tests

- [ ] Fix A1: TabBar delete confirmation — add confirm state with 3s timeout
- [ ] Fix A3: useChat optimistic rollback — remove message on fetch error, show toast
- [ ] Fix A5: useHubMode timeout — AbortController with 5s timeout
- [ ] Fix A7: JobDetailPage log cap — sliding window at 10,000 entries
- [ ] Fix A8: useSharedWebSocket indefinite retry — 30s interval after backoff exhausted
- [ ] Write regression tests for each fix

## Phase 4: Page & Integration Flow Tests

- [ ] App.test.tsx — hub mode detection, legacy fallback, timeout fallback
- [ ] DashboardPage.test.tsx — commands load, jobs load, wizard open/close, proposal detail
- [ ] JobDetailPage.test.tsx — load job, live WS updates, cancel, not-found state
- [ ] AnalyticsPage.test.tsx — period selector, data fetch, cache on project switch, error/retry
- [ ] SettingsPage.test.tsx — load config, save config, tracker selection
- [ ] add-project-flow.test.tsx — add dialog → API → setup wizard trigger
- [ ] project-switch-flow.test.tsx — switch tabs → route memory → cache restore
- [ ] chat-flow.test.tsx — create conversation → send → stream → command proposal → confirm
- [ ] job-lifecycle-flow.test.tsx — spawn → queue → running → logs → complete
