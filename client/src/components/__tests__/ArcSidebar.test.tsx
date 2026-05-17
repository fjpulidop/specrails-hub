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

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('ArcSidebar', () => {
  it('renders collapsed (unpinned) by default', () => {
    render(<ArcSidebar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Pin left sidebar open/i })).toBeInTheDocument()
    expect(screen.queryByText('Hub')).not.toBeInTheDocument()
  })

  it('cycle from unpinned → pinned-open expands and updates label', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    expect(screen.getByText('Hub')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Collapse left sidebar \(keep pinned\)/i })).toBeInTheDocument()
  })

  it('cycle from pinned-open → pinned-collapsed collapses and keeps lit label', () => {
    render(<ArcSidebar {...defaultProps} />)
    const btn = screen.getByRole('button', { name: /Pin left sidebar open/i })
    fireEvent.click(btn) // → pinned-open
    fireEvent.click(screen.getByRole('button', { name: /Collapse left sidebar/i })) // → pinned-collapsed
    expect(screen.queryByText('Hub')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unpin left sidebar/i })).toBeInTheDocument()
  })

  it('cycle wraps pinned-collapsed → unpinned → pinned-open', () => {
    render(<ArcSidebar {...defaultProps} />)
    const btn = () => screen.getByRole('button', { name: /sidebar/i })
    fireEvent.click(btn()) // pinned-open
    fireEvent.click(btn()) // pinned-collapsed
    fireEvent.click(btn()) // unpinned
    expect(screen.getByRole('button', { name: /Pin left sidebar open/i })).toBeInTheDocument()
    fireEvent.click(btn()) // pinned-open
    expect(screen.getByText('Hub')).toBeInTheDocument()
  })

  it('expands on mouse enter when unpinned', () => {
    const { container } = render(<ArcSidebar {...defaultProps} />)
    fireEvent.mouseEnter(container.firstChild as Element)
    expect(screen.getByText('Hub')).toBeInTheDocument()
  })

  it('collapses on mouse leave when unpinned', () => {
    const { container } = render(<ArcSidebar {...defaultProps} />)
    fireEvent.mouseEnter(container.firstChild as Element)
    fireEvent.mouseLeave(container.firstChild as Element)
    expect(screen.queryByText('Hub')).not.toBeInTheDocument()
  })

  it('does not expand on mouse enter when pinned-collapsed', () => {
    const { container } = render(<ArcSidebar {...defaultProps} />)
    const btn = () => screen.getByRole('button', { name: /sidebar/i })
    fireEvent.click(btn()) // pinned-open
    fireEvent.click(btn()) // pinned-collapsed
    expect(screen.queryByText('Hub')).not.toBeInTheDocument()
    fireEvent.mouseEnter(container.firstChild as Element)
    expect(screen.queryByText('Hub')).not.toBeInTheDocument()
  })

  it('stays expanded on mouse leave when pinned-open', () => {
    const { container } = render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    fireEvent.mouseLeave(container.firstChild as Element)
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

  it('renders project list buttons when expanded', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('calls setActiveProjectId when a project is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    fireEvent.click(screen.getByText('Project Beta'))
    expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-2')
  })

  it('renders hub nav items when expanded', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    expect(screen.getByRole('button', { name: /Docs/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Analytics$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Settings$/i })).toBeInTheDocument()
  })

  it('calls onOpenAnalytics when Analytics is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Analytics$/i }))
    expect(defaultProps.onOpenAnalytics).toHaveBeenCalledOnce()
  })

  it('calls onOpenSettings when Settings is clicked', () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }))
    expect(defaultProps.onOpenSettings).toHaveBeenCalledOnce()
  })

  it('shows confirm prompt then removes project on second click', async () => {
    render(<ArcSidebar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))

    const removeBtn = screen.getByRole('button', { name: /Remove Project Beta/i })
    fireEvent.click(removeBtn)
    expect(screen.getByRole('button', { name: /Confirm remove Project Beta/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Confirm remove Project Beta/i }))
    expect(mockRemoveProject).toHaveBeenCalledWith('proj-2')
  })
})
