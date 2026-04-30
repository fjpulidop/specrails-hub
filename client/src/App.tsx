import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { _registerRouteForcer } from './lib/route-memory'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'
import SettingsDialog from './pages/GlobalSettingsPage'
import { Dialog, DialogContent } from './components/ui/dialog'
import { useKeyboardShortcuts, useCheatsheetState } from './hooks/useKeyboardShortcuts'
import { KeyboardShortcutsCheatsheet } from './components/KeyboardShortcutsCheatsheet'
import { TitleBar } from './components/TitleBar'

// Lazy-loaded pages — never visible at initial render
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'))
const JobsPage = lazy(() => import('./pages/JobsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const ActivityFeedPage = lazy(() => import('./pages/ActivityFeedPage'))
const AgentsPage = lazy(() => import('./pages/AgentsPage'))
const HubAnalyticsPage = lazy(() => import('./pages/HubAnalyticsPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const DocsDialog = lazy(() => import('./components/DocsDialog'))
import { ProjectLayout } from './components/ProjectLayout'
import { ProjectErrorBoundary } from './components/ProjectErrorBoundary'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SetupWizard } from './components/SetupWizard'
import { OnboardingWizard, hasSeenOnboarding } from './components/OnboardingWizard'
import { ArcSidebar } from './components/ArcSidebar'
import { ProjectRightSidebar } from './components/ProjectRightSidebar'
import { AddProjectDialog } from './components/AddProjectDialog'
import { SidebarPinProvider, useSidebarPin } from './context/SidebarPinContext'
import { CommandPalette } from './components/CommandPalette'
import { SharedWebSocketProvider } from './hooks/useSharedWebSocket'
import { HubProvider, useHub } from './hooks/useHub'
import { SpecGenTrackerProvider } from './hooks/useSpecGenTracker'
import { useOsNotifications } from './hooks/useOsNotifications'
import { useDesktopUpdateNotifier } from './hooks/useDesktopUpdateNotifier'
import { WS_URL } from './lib/ws-url'
import { TerminalsProvider, useTerminals } from './context/TerminalsContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { FEATURE_AGENTS_SECTION, FEATURE_TERMINAL_PANEL } from './lib/feature-flags'

// ─── Per-project route memory (in-memory only — resets on app restart) ───────

// Paths that should never be remembered as a project's "last visited" —
// re-entering a project should never land on a config/admin surface.
const ROUTE_MEMORY_EXCLUDE = new Set<string>(['/settings'])

// One-time cleanup of legacy persisted route memory so users upgrading from a
// version that wrote to localStorage don't keep their stale "last visited" routes.
const LEGACY_ROUTE_MEMORY_KEY = 'specrails-hub:routeMemory'
try { localStorage.removeItem(LEGACY_ROUTE_MEMORY_KEY) } catch { /* ignore */ }

function useProjectRouteMemory(activeProjectId: string | null) {
  const location = useLocation()
  const navigate = useNavigate()

  // Map of projectId → last visited path. In-memory only: deliberately not
  // persisted, so a cold start always lands on Dashboard ('/') for every
  // project, while in-session project switches still restore the last route.
  const routeMemory = useRef<Map<string, string>>(new Map())
  const prevProjectId = useRef<string | null>(null)
  const didColdStartReset = useRef(false)

  // Allow external code (e.g. SpecGenTracker "View" button) to force a route
  // for a project before the switch happens, so route memory restores it.
  useEffect(() => {
    _registerRouteForcer((projectId, route) => {
      routeMemory.current.set(projectId, route)
    })
  }, [])

  // Cold-start reset: on the very first mount, regardless of what URL the
  // browser/Tauri webview restored, force the user back to Dashboard. This
  // makes a closed-and-reopened app always start from a known surface.
  useEffect(() => {
    if (didColdStartReset.current) return
    didColdStartReset.current = true
    if (location.pathname !== '/') {
      navigate('/', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Save the current route for the outgoing project
    if (prevProjectId.current && prevProjectId.current !== activeProjectId) {
      routeMemory.current.set(prevProjectId.current, location.pathname)
    }

    // Restore route for the incoming project (defaults to Dashboard '/' when
    // no in-session memory exists — i.e. first visit this session).
    if (activeProjectId && activeProjectId !== prevProjectId.current) {
      const savedRoute = routeMemory.current.get(activeProjectId)
      const targetRoute = savedRoute ?? '/'
      if (location.pathname !== targetRoute) {
        navigate(targetRoute, { replace: true })
      }
    }

    prevProjectId.current = activeProjectId
  }, [activeProjectId, location.pathname, navigate])

  // Continuously update the in-memory map for the active project so a project
  // switch restores precisely the last surface the user was on.
  useEffect(() => {
    if (activeProjectId && location.pathname !== '/' && !ROUTE_MEMORY_EXCLUDE.has(location.pathname)) {
      routeMemory.current.set(activeProjectId, location.pathname)
    }
  }, [activeProjectId, location.pathname])
}

// ─── Hub app shell ────────────────────────────────────────────────────────────

function HubApp() {
  const { projects, activeProjectId, isLoading, isSwitchingProject, setupProjectIds, completeSetupWizard, setActiveProjectId } = useHub()
  const { setLeftPinned, setRightPinned } = useSidebarPin()
  const navigate = useNavigate()
  const terminals = useTerminals()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasSeenOnboarding())

  // Remember which page each project was on
  useProjectRouteMemory(activeProjectId)

  // Keyboard shortcuts
  const { cheatsheetOpen, setCheatsheetOpen, openCheatsheet } = useCheatsheetState()
  const PROJECT_PAGES = FEATURE_AGENTS_SECTION
    ? ['/', '/jobs', '/analytics', '/agents', '/settings']
    : ['/', '/jobs', '/analytics', '/settings']
  useKeyboardShortcuts({
    onOpenCheatsheet: openCheatsheet,
    onToggleLeftSidebar: () => setLeftPinned((p) => !p),
    onToggleRightSidebar: () => setRightPinned((p) => !p),
    onSwitchProject: (index) => {
      const project = projects[index - 1]
      if (project) setActiveProjectId(project.id)
    },
    onSwitchProjectPage: (index) => {
      const route = PROJECT_PAGES[index - 1]
      if (route) navigate(route)
    },
    onToggleTerminalPanel: FEATURE_TERMINAL_PANEL ? () => {
      if (!activeProjectId) return
      terminals.togglePanel(activeProjectId)
      const state = terminals.getState(activeProjectId)
      // After toggle, state.visibility reflects the NEW value (togglePanel is synchronous to state updater)
      // Focus the active terminal once the panel is opening.
      if (state.visibility !== 'hidden') terminals.focusActive(activeProjectId)
      else {
        // Ensure focus after next tick when panel is now open
        queueMicrotask(() => terminals.focusActive(activeProjectId))
      }
    } : undefined,
  })

  // OS notifications for job completions/failures
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  )
  useOsNotifications({ setActiveProjectId, projectsById })

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const isInSetup = activeProjectId !== null && setupProjectIds.has(activeProjectId)

  if (isLoading) {
    return (
      <div className="flex h-full bg-background">
        <div className="w-11 border-r border-border bg-card/50 animate-pulse flex-shrink-0" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-background font-sans">
      {/* Arc-style collapsible sidebar */}
      <ArcSidebar
        onAddProject={() => setAddDialogOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
        onOpenDocs={() => setDocsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main area — navbar + content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Project switching progress bar */}
        {isSwitchingProject && (
          <div
            className="h-0.5 w-full bg-accent-primary/70 animate-pulse shrink-0"
            data-testid="project-switching-bar"
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isInSetup && activeProject ? (
            <SetupWizard
              key={activeProject.id}
              project={activeProject}
              onComplete={() => completeSetupWizard(activeProject.id)}
              onSkip={() => completeSetupWizard(activeProject.id)}
            />
          ) : (
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading...</p></div>}>
              <Routes>
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/docs/:category/:slug" element={<DocsPage />} />
                {/* Project routes */}
                {projects.length === 0 ? (
                  <Route path="*" element={<WelcomeScreen onAddProject={() => setAddDialogOpen(true)} />} />
                ) : activeProject ? (
                  <Route element={
                    <ProjectErrorBoundary key={activeProject.id} projectName={activeProject.name}>
                      <ProjectLayout project={activeProject} />
                    </ProjectErrorBoundary>
                  }>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/jobs/:id" element={<JobDetailPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/activity" element={<ActivityFeedPage />} />
                    <Route path="/agents" element={<AgentsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                ) : (
                  <Route path="*" element={<WelcomeScreen onAddProject={() => setAddDialogOpen(true)} />} />
                )}
              </Routes>
            </Suspense>
          )}
        </div>
      </div>

      {/* Right sidebar — full height, only when a project is active and not in setup */}
      {activeProject && !isInSetup && <ProjectRightSidebar />}

      <AddProjectDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenOnboarding={() => { setSettingsOpen(false); setOnboardingOpen(true) }} />

      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-40"><p className="text-sm text-muted-foreground">Loading...</p></div>}>
              <HubAnalyticsPage />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <DocsDialog open={docsOpen} onClose={() => setDocsOpen(false)} />
      </Suspense>

      <CommandPalette
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
        onOpenDocs={() => setDocsOpen(true)}
      />
      <KeyboardShortcutsCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
      <OnboardingWizard open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}

// ─── Terminals provider wrapper (reads active project from useHub) ───────────

function TerminalsProviderWithHub({ children }: { children: React.ReactNode }) {
  const { activeProjectId } = useHub()
  return <TerminalsProvider activeProjectId={activeProjectId}>{children}</TerminalsProvider>
}

// ─── Themed Toaster — Sonner palette derived from active theme ───────────────
// Sonner injects its own stylesheet AFTER globals.css, so its built-in tokens
// can't be overridden via plain CSS variables; we have to pass them inline.
// We do this once per theme change by reading the descriptor.

function ThemedToaster() {
  const { theme } = useTheme()
  const accent = theme.previewSwatches.accents[0]
  const success = theme.status.completed
  const danger = theme.status.failed
  const warning = theme.status.canceled
  const info = theme.status.running
  return (
    <Toaster
      position="bottom-right"
      theme={theme.scheme}
      gap={8}
      closeButton
      richColors
      style={{
        '--normal-bg':           'var(--color-card)',
        '--normal-bg-hover':     'var(--color-surface)',
        '--normal-border':       `color-mix(in srgb, ${accent} 18%, transparent)`,
        '--normal-border-hover': `color-mix(in srgb, ${accent} 28%, transparent)`,
        '--normal-text':         'var(--color-foreground)',
        '--success-bg':          `color-mix(in srgb, ${success} 14%, var(--color-card))`,
        '--success-border':      `color-mix(in srgb, ${success} 30%, transparent)`,
        '--success-text':        success,
        '--error-bg':            `color-mix(in srgb, ${danger} 14%, var(--color-card))`,
        '--error-border':        `color-mix(in srgb, ${danger} 30%, transparent)`,
        '--error-text':          danger,
        '--warning-bg':          `color-mix(in srgb, ${warning} 14%, var(--color-card))`,
        '--warning-border':      `color-mix(in srgb, ${warning} 30%, transparent)`,
        '--warning-text':        warning,
        '--info-bg':             `color-mix(in srgb, ${info} 14%, var(--color-card))`,
        '--info-border':         `color-mix(in srgb, ${info} 30%, transparent)`,
        '--info-text':           info,
        '--border-radius':       '0.75rem',
        'fontFamily':            "'DM Mono', 'JetBrains Mono', ui-monospace, monospace",
      } as React.CSSProperties}
    />
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  useDesktopUpdateNotifier()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Main app content — fills remaining height below titlebar */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <SharedWebSocketProvider url={WS_URL}>
          <ThemeProvider>
            <HubProvider>
              {/* Custom frameless titlebar inside HubProvider so it can read active project */}
              <TitleBar />
              <SpecGenTrackerProvider>
                <SidebarPinProvider>
                  <TerminalsProviderWithHub>
                    <HubApp />
                  </TerminalsProviderWithHub>
                </SidebarPinProvider>
              </SpecGenTrackerProvider>
            </HubProvider>
            <ThemedToaster />
          </ThemeProvider>
        </SharedWebSocketProvider>
      </div>
    </div>
  )
}
