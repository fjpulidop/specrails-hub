import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { AddProjectDialog } from '../AddProjectDialog'

vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockStartSetupWizard = vi.fn()
const mockSetActiveProjectId = vi.fn()

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    startSetupWizard: mockStartSetupWizard,
    setActiveProjectId: mockSetActiveProjectId,
    projects: [],
    activeProjectId: null,
    isLoading: false,
    addProject: vi.fn(),
    removeProject: vi.fn(),
    setupProjectIds: new Set(),
    completeSetupWizard: vi.fn(),
  }),
}))

describe('AddProjectDialog', () => {
  beforeEach(() => {
    mockStartSetupWizard.mockClear()
    mockSetActiveProjectId.mockClear()
    vi.clearAllMocks()
  })

  it('renders dialog when open=true', () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    // The dialog title and the submit button both contain "Add Project"
    // Use heading to find the dialog title specifically
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Add Project/i })).toBeInTheDocument()
  })

  it('does not render dialog when open=false', () => {
    render(<AddProjectDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('Add Project')).not.toBeInTheDocument()
  })

  it('shows path and name inputs', () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByPlaceholderText('/Users/me/my-project')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('My Project')).toBeInTheDocument()
  })

  it('submit button is disabled when path is empty', () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    expect(addBtn).toBeDisabled()
  })

  it('submit button is enabled when path is filled', async () => {
    const user = userEvent.setup()
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    const pathInput = screen.getByPlaceholderText('/Users/me/my-project')
    await user.type(pathInput, '/some/path')
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    expect(addBtn).not.toBeDisabled()
  })

  it('successful submit calls API and closes dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: { id: 'new-proj', name: 'My Project' },
        has_specrails: true,
      }),
    })

    render(<AddProjectDialog open={true} onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/Users/me/my-project')
    await user.type(pathInput, '/some/path')
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    await user.click(addBtn)

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('error response shows toast.error', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Path not found' }),
    })

    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    const pathInput = screen.getByPlaceholderText('/Users/me/my-project')
    await user.type(pathInput, '/bad/path')
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    await user.click(addBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to add project', expect.objectContaining({ description: 'Path not found' }))
    })
  })

  it('when has_specrails=false, triggers setup wizard and sets active project', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: { id: 'new-proj', name: 'New Project' },
        has_specrails: false,
      }),
    })

    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    const pathInput = screen.getByPlaceholderText('/Users/me/my-project')
    await user.type(pathInput, '/some/path')
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    await user.click(addBtn)

    await waitFor(() => {
      expect(mockSetActiveProjectId).toHaveBeenCalledWith('new-proj')
      expect(mockStartSetupWizard).toHaveBeenCalledWith('new-proj')
    })
  })

  it('cancel button closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<AddProjectDialog open={true} onClose={onClose} />)
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
