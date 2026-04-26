import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { TabBar } from '../TabBar'
import type { HubProject } from '../../hooks/useHub'

const mockSetActiveProjectId = vi.fn()
const mockRemoveProject = vi.fn().mockResolvedValue(undefined)

const mockProjects: HubProject[] = [
  {
    id: 'proj-1',
    slug: 'project-one',
    name: 'Project One',
    path: '/path/one',
    db_path: '/path/one/.db',
    added_at: '2024-01-01T00:00:00Z',
    last_seen_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'proj-2',
    slug: 'project-two',
    name: 'Project Two',
    path: '/path/two',
    db_path: '/path/two/.db',
    added_at: '2024-01-01T00:00:00Z',
    last_seen_at: '2024-01-01T00:00:00Z',
  },
]

let mockHubValue = {
  projects: mockProjects,
  activeProjectId: 'proj-1',
  setActiveProjectId: mockSetActiveProjectId,
  removeProject: mockRemoveProject,
  addProject: vi.fn(),
  isLoading: false,
  setupProjectIds: new Set<string>(),
  startSetupWizard: vi.fn(),
  completeSetupWizard: vi.fn(),
}

vi.mock('../../hooks/useHub', () => ({
  useHub: () => mockHubValue,
}))

describe('TabBar', () => {
  beforeEach(() => {
    mockSetActiveProjectId.mockClear()
    mockRemoveProject.mockClear()
  })

  it('renders project tabs from useHub context', () => {
    render(<TabBar onAddProject={vi.fn()} />)
    expect(screen.getByText('Project One')).toBeInTheDocument()
    expect(screen.getByText('Project Two')).toBeInTheDocument()
  })

  it('active tab has distinct styling (bg-background class)', () => {
    render(<TabBar onAddProject={vi.fn()} />)
    // Active project is proj-1 = "Project One"
    const activeBtn = screen.getByText('Project One').closest('[role="button"]')
    expect(activeBtn).toHaveClass('bg-background')
  })

  it('inactive tab does not have bg-background class', () => {
    render(<TabBar onAddProject={vi.fn()} />)
    const inactiveBtn = screen.getByText('Project Two').closest('[role="button"]')
    expect(inactiveBtn).not.toHaveClass('bg-background')
  })

  it('clicking a tab calls setActiveProjectId with correct id', async () => {
    const user = userEvent.setup()
    render(<TabBar onAddProject={vi.fn()} />)
    const tab = screen.getByText('Project Two').closest('[role="button"]')!
    await user.click(tab)
    expect(mockSetActiveProjectId).toHaveBeenCalledWith('proj-2')
  })

  it('clicking add button calls onAddProject', async () => {
    const user = userEvent.setup()
    const onAddProject = vi.fn()
    render(<TabBar onAddProject={onAddProject} />)
    const addBtn = screen.getByRole('button', { name: /Add project/i })
    await user.click(addBtn)
    expect(onAddProject).toHaveBeenCalledTimes(1)
  })

  it('remove button exists with proper aria-label for each project', () => {
    render(<TabBar onAddProject={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Remove Project One' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Project Two' })).toBeInTheDocument()
  })

  it('clicking remove button requires confirmation (double click)', async () => {
    const user = userEvent.setup()
    render(<TabBar onAddProject={vi.fn()} />)
    const removeBtn = screen.getByRole('button', { name: 'Remove Project One' })

    // First click enters confirmation state
    await user.click(removeBtn)
    expect(mockRemoveProject).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm remove Project One' })).toBeInTheDocument()

    // Second click actually removes
    const confirmBtn = screen.getByRole('button', { name: 'Confirm remove Project One' })
    await user.click(confirmBtn)
    expect(mockRemoveProject).toHaveBeenCalledWith('proj-1')
  })

  it('renders add project button', () => {
    render(<TabBar onAddProject={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Add project/i })).toBeInTheDocument()
  })
})
