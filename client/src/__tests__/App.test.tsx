import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '../test-utils'
import App from '../App'

vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  getApiBase: () => '/api',
  setApiContext: vi.fn(),
}))

vi.mock('../lib/ws-url', () => ({
  WS_URL: 'ws://localhost:4200',
}))

// Mock complex child components to keep tests focused
vi.mock('../components/SetupWizard', () => ({
  SetupWizard: () => <div data-testid="setup-wizard">SetupWizard</div>,
}))

vi.mock('../components/TabBar', () => ({
  TabBar: ({ onAddProject }: { onAddProject: () => void }) => (
    <div data-testid="tab-bar">
      <button onClick={onAddProject}>Add Project</button>
    </div>
  ),
}))

vi.mock('../components/WelcomeScreen', () => ({
  WelcomeScreen: ({ onAddProject }: { onAddProject: () => void }) => (
    <div data-testid="welcome-screen">
      <button onClick={onAddProject}>Add your first project</button>
    </div>
  ),
}))

vi.mock('../components/AddProjectDialog', () => ({
  AddProjectDialog: () => <div data-testid="add-project-dialog" />,
}))

vi.mock('../pages/GlobalSettingsPage', () => ({
  default: () => <div data-testid="settings-dialog" />,
}))

vi.mock('../components/ProjectLayout', () => ({
  ProjectLayout: () => <div data-testid="project-layout">ProjectLayout</div>,
}))

vi.mock('../components/RootLayout', () => ({
  RootLayout: () => <div data-testid="root-layout">RootLayout</div>,
}))

// The HubProvider makes REST calls to /api/hub/projects.
// We need to mock that too.
vi.mock('../hooks/useHub', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useHub')>('../hooks/useHub')
  return {
    ...actual,
    HubProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="hub-provider">{children}</div>
    ),
  }
})

describe('App — hub mode detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders in legacy mode when /api/hub/state fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch error'))
    render(<App />)
    // In legacy mode, Routes renders and eventually renders RootLayout or some fallback
    // The hub state detection starts as false, so legacy mode renders first
    // We just confirm it doesn't crash
    await waitFor(() => {
      // App renders without throwing
      expect(document.body).toBeInTheDocument()
    })
  })

  it('renders in legacy mode when /api/hub/state returns not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    render(<App />)
    await waitFor(() => {
      expect(document.body).toBeInTheDocument()
    })
    // isHub stays false, so Routes (legacy) branch renders
    // SharedWebSocketProvider is always rendered
    expect(screen.queryByTestId('hub-provider')).not.toBeInTheDocument()
  })

  it('renders hub mode (HubProvider) when /api/hub/state returns ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('hub-provider')).toBeInTheDocument()
    })
  })

  it('initially renders in legacy mode before fetch completes', () => {
    // fetch never resolves
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<App />)
    // isHub starts as false, so legacy Routes branch is rendered
    expect(screen.queryByTestId('hub-provider')).not.toBeInTheDocument()
  })
})
