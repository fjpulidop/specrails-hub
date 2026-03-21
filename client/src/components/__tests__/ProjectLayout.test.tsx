import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test-utils'
import { ProjectLayout } from '../ProjectLayout'
import type { HubProject } from '../../hooks/useHub'

// Mock Toaster from sonner
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), promise: vi.fn() },
  Toaster: () => null,
}))

// Mock usePipeline
vi.mock('../../hooks/usePipeline', () => ({
  usePipeline: () => ({
    connectionStatus: 'connected',
    phases: {},
    queue: { jobs: [], activeJobId: null, paused: false },
    logs: [],
    commands: [],
    activeJobId: null,
  }),
}))

// Mock useSharedWebSocket
vi.mock('../../hooks/useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: vi.fn(),
    unregisterHandler: vi.fn(),
    connectionStatus: 'connected',
  }),
}))

// Mock useChat
vi.mock('../../hooks/useChat', () => ({
  useChat: () => ({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isLoading: false,
    isSending: false,
    isPanelOpen: false,
    canCreateNew: false,
    hasActiveConversation: false,
    activeTitle: null,
    toggle: vi.fn(),
    sendMessage: vi.fn(),
    selectConversation: vi.fn(),
    newConversation: vi.fn(),
    deleteConversation: vi.fn(),
  }),
  ChatContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}))

// Mock child components
vi.mock('../StatusBar', () => ({
  StatusBar: ({ connectionStatus }: { connectionStatus: string }) => (
    <div data-testid="status-bar">{connectionStatus}</div>
  ),
}))

vi.mock('../ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}))

vi.mock('../ProjectNavbar', () => ({
  ProjectNavbar: ({ project }: { project: HubProject }) => (
    <nav data-testid="project-navbar">{project.name}</nav>
  ),
}))

const mockProject: HubProject = {
  id: 'proj-1',
  slug: 'my-project',
  name: 'My Project',
  path: '/home/user/my-project',
  db_path: '/home/user/.specrails/projects/my-project/jobs.sqlite',
  added_at: '2024-01-01T00:00:00Z',
  last_seen_at: '2024-01-02T00:00:00Z',
}

describe('ProjectLayout', () => {
  it('renders ProjectNavbar with the project prop', () => {
    render(<ProjectLayout project={mockProject} />)
    expect(screen.getByTestId('project-navbar')).toBeInTheDocument()
    expect(screen.getByTestId('project-navbar')).toHaveTextContent('My Project')
  })

  it('renders StatusBar', () => {
    render(<ProjectLayout project={mockProject} />)
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
  })

  it('renders ChatPanel', () => {
    render(<ProjectLayout project={mockProject} />)
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })

  it('renders a main content area', () => {
    render(<ProjectLayout project={mockProject} />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
