import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { ArcSidebar } from '../ArcSidebar'
import type { HubProject } from '../../hooks/useHub'

const mockProjects: HubProject[] = [
  { id: 'proj-1', slug: 'proj-1', name: 'Project Alpha', path: '/alpha', db_path: '/alpha/.db', added_at: '', last_seen_at: '' },
  { id: 'proj-2', slug: 'proj-2', name: 'Project Beta', path: '/beta', db_path: '/beta/.db', added_at: '', last_seen_at: '' },
]

const mockSetActiveProjectId = vi.fn()
const mockRemoveProject = vi.fn()

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    projects: mockProjects,
    activeProjectId: 'proj-1',
    setActiveProjectId: mockSetActiveProjectId,
    removeProject: mockRemoveProject,
    isLoading: false,
    setupProjectIds: new Set(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
  }),
}))

const defaultProps = {
  onAddProject: vi.fn(),
  onOpenAnalytics: vi.fn(),
  onOpenDocs: vi.fn(),
  onOpenSettings: vi.fn(),
}

describe('ArcSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders in collapsed state by default', () => {
    render(<ArcSidebar {...defaultProps} />)
    const sidebar = screen.getByRole('button', { name: /Pin left sidebar|Unpin left sidebar/i }).closest('div')!.parentElement
    expect(sidebar).toBeTruthy()
  })

  it('renders the pin/unpin toggle button', () => {
    render(<ArcSidebar {...defaultProps} />)
    const toggleBtn = screen.getByRole('button', { name: /Pin left sidebar/i })
    expect(toggleBtn).toBeInTheDocument()
  })

  it('toggles to pinned state on click', () => {
    render(<ArcSidebar {...defaultProps} />)
    const pinBtn = screen.getByRole('button', { name: /Pin left sidebar/i })
    fireEvent.click(pinBtn)
    expect(screen.getByRole('button', { name: /Unpin left sidebar/i })).toBeInTheDocument()
  })

  it('renders the Hub label when expanded (pinned)', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))
    expect(screen.getByText('Hub')).toBeInTheDocument()
  })

  it('renders Add project button', () => {
    render(<ArcSidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Add project/i })).toBeInTheDocument()
  })

  it('calls onAddProject when Add project button is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Add project/i }))
    expect(defaultProps.onAddProject).toHaveBeenCalledOnce()
  })

  it('renders project list buttons', () => {
    render(<ArcSidebar {...defaultProps} />)
    // Pin to expand and see project names
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('calls setActiveProjectId when a project is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))
    fireEvent.click(screen.getByText('Project Beta'))
    expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-2')
  })

  it('renders hub nav items when expanded', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))
    expect(screen.getByRole('button', { name: /Docs/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Analytics$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Settings$/i })).toBeInTheDocument()
  })

  it('calls onOpenAnalytics when Analytics is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Analytics$/i }))
    expect(defaultProps.onOpenAnalytics).toHaveBeenCalledOnce()
  })

  it('calls onOpenSettings when Settings is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }))
    expect(defaultProps.onOpenSettings).toHaveBeenCalledOnce()
  })

  it('shows confirm prompt then removes project on second click', async () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar/i }))

    // Click remove button for Project Beta (not active)
    const removeBtn = screen.getByRole('button', { name: /Remove Project Beta/i })
    fireEvent.click(removeBtn)
    // Now shows confirm prompt
    expect(screen.getByRole('button', { name: /Confirm remove Project Beta/i })).toBeInTheDocument()

    // Confirm
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove Project Beta/i }))
    expect(mockRemoveProject).toHaveBeenCalledWith('proj-2')
  })
})
