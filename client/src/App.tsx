import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RootLayout } from './components/RootLayout'
import DashboardPage from './pages/DashboardPage'
import SettingsPage from './pages/SettingsPage'
import SettingsDialog from './pages/GlobalSettingsPage'
import { Dialog, DialogContent } from './components/ui/dialog'

// Lazy-loaded pages — never visible at initial render
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const ActivityFeedPage = lazy(() => import('./pages/ActivityFeedPage'))
const HubAnalyticsPage = lazy(() => import('./pages/HubAnalyticsPage'))
const HubOverviewPage = lazy(() => import('./pages/HubOverviewPage'))
const DocsPage = lazy(() => import('./pages/DocsPage'))
const DocsDialog = lazy(() => import('./components/DocsDialog'))
import { ProjectLayout } from './components/ProjectLayout'
import { ProjectErrorBoundary } from './components/ProjectErrorBoundary'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SetupWizard } from './components/SetupWizard'
import { TabBar } from './components/TabBar'
import { AddProjectDialog } from './components/AddProjectDialog'
import { CommandPalette } from './components/CommandPalette'
import { SharedWebSocketProvider } from './hooks/useSharedWebSocket'
import { HubProvider, useHub } from './hooks/useHub'
import { useOsNotifications } from './hooks/useOsNotifications'
import { WS_URL } from './lib/ws-url'

// ─── Hub mode detection ───────────────────────────────────────────────────────

function useHubMode(): boolean {
  const [isHub, setIsHub] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    async function detect() {
      try {
        const res = await fetch('/api/hub/state', { signal: controller.signal })
        setIsHub(res.ok)
      } catch {
        setIsHub(false)
      } finally {
        clearTimeout(timeout)
      }
    }

    detect()
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [])

  return isHub
}

// ─── Per-project route memory ─────────────────────────────────────────────────

function useProjectRouteMemory(activeProjectId: string | null) {
  const location = useLocation()
  const navigate = useNavigate()

  // Map of projectId → last visited path
  const routeMemory = useRef<Map<string, string>>(new Map())
  const prevProjectId = useRef<string | null>(null)

  useEffect(() => {
    // Save the current route for the outgoing project
    if (prevProjectId.current && prevProjectId.current !== activeProjectId) {
      routeMemory.current.set(prevProjectId.current, location.pathname)
    }

    // Restore route for the incoming project
    if (activeProjectId && activeProjectId !== prevProjectId.current) {
      const savedRoute = routeMemory.current.get(activeProjectId)
      const targetRoute = savedRoute ?? '/'
      if (location.pathname !== targetRoute) {
        navigate(targetRoute, { replace: true })
      }
    }

    prevProjectId.current = activeProjectId
  }, [activeProjectId, location.pathname, navigate])
}

// ─── Hub app shell ────────────────────────────────────────────────────────────

function HubApp() {
  const { projects, activeProjectId, isLoading, isSwitchingProject, setupProjectIds, completeSetupWizard, setActiveProjectId } = useHub()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)

  // Remember which page each project was on
  useProjectRouteMemory(activeProjectId)

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
      <div className="flex flex-col h-screen bg-background">
        <div className="h-11 border-b border-border bg-card/50 animate-pulse" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background font-sans">
      {/* Hub top bar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
        <span className="font-mono text-sm font-bold">
          <span className="text-dracula-purple">spec</span>
          <span className="text-dracula-pink">rails</span>
          <span className="text-muted-foreground text-xs font-normal ml-1">/ hub</span>
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOverviewOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setAnalyticsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Analytics
          </button>
          <button
            type="button"
            onClick={() => setDocsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Project tabs */}
      {projects.length > 0 && (
        <TabBar onAddProject={() => setAddDialogOpen(true)} />
      )}

      {/* Project switching progress bar */}
      {isSwitchingProject && (
        <div
          className="h-0.5 w-full bg-dracula-purple/70 animate-pulse shrink-0"
          data-testid="project-switching-bar"
        />
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {isInSetup && activeProject ? (
          <SetupWizard
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
                  <Route path="/jobs/:id" element={<JobDetailPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/activity" element={<ActivityFeedPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              ) : (
                <Route path="*" element={
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">Select a project</p>
                  </div>
                } />
              )}
            </Routes>
          </Suspense>
        )}
      </div>

      <AddProjectDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-40"><p className="text-sm text-muted-foreground">Loading...</p></div>}>
              <HubOverviewPage />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

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
        onOpenOverview={() => setOverviewOpen(true)}
        onOpenAnalytics={() => setAnalyticsOpen(true)}
        onOpenDocs={() => setDocsOpen(true)}
      />
    </div>
  )
}

// ─── Legacy mode OS notification hook ────────────────────────────────────────

function LegacyOsNotifications() {
  useOsNotifications()
  return null
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const isHub = useHubMode()

  return (
    <SharedWebSocketProvider url={WS_URL}>
      {isHub ? (
        <HubProvider>
          <HubApp />
        </HubProvider>
      ) : (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading...</p></div>}>
          <LegacyOsNotifications />
          <Routes>
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:category/:slug" element={<DocsPage />} />
            <Route element={<RootLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/activity" element={<ActivityFeedPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <CommandPalette />
        </Suspense>
      )}
      <Toaster position="bottom-right" richColors />
    </SharedWebSocketProvider>
  )
}
