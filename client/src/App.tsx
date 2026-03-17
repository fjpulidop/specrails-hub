import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { RootLayout } from './components/RootLayout'
import DashboardPage from './pages/DashboardPage'
import JobDetailPage from './pages/JobDetailPage'
import SettingsPage from './pages/SettingsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsDialog from './pages/GlobalSettingsPage'
import { ProjectLayout } from './components/ProjectLayout'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SetupWizard } from './components/SetupWizard'
import { TabBar } from './components/TabBar'
import { AddProjectDialog } from './components/AddProjectDialog'
import { SharedWebSocketProvider } from './hooks/useSharedWebSocket'
import { HubProvider, useHub } from './hooks/useHub'
import { WS_URL } from './lib/ws-url'

// ─── Hub mode detection ───────────────────────────────────────────────────────

function useHubMode(): boolean {
  const [isHub, setIsHub] = useState(false)

  useEffect(() => {
    async function detect() {
      try {
        const res = await fetch('/api/hub/state')
        setIsHub(res.ok)
      } catch {
        setIsHub(false)
      }
    }
    detect()
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
  const { projects, activeProjectId, isLoading, setupProjectIds, completeSetupWizard } = useHub()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Remember which page each project was on
  useProjectRouteMemory(activeProjectId)

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
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Settings
        </button>
      </div>

      {/* Project tabs */}
      {projects.length > 0 && (
        <TabBar onAddProject={() => setAddDialogOpen(true)} />
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
          <Routes>
            {projects.length === 0 ? (
              <Route path="*" element={<WelcomeScreen onAddProject={() => setAddDialogOpen(true)} />} />
            ) : activeProject ? (
              <Route element={<ProjectLayout project={activeProject} />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/jobs/:id" element={<JobDetailPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
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
        )}
      </div>

      <AddProjectDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
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
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </SharedWebSocketProvider>
  )
}
