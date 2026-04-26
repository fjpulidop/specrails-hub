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
const mockAddProject = vi.fn()

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    startSetupWizard: mockStartSetupWizard,
    setActiveProjectId: mockSetActiveProjectId,
    projects: [],
    activeProjectId: null,
    isLoading: false,
    addProject: mockAddProject,
    removeProject: vi.fn(),
    setupProjectIds: new Set(),
    completeSetupWizard: vi.fn(),
  }),
}))

/** Mock fetch to return available-providers and optionally a project response */
function mockFetchSequence(projectResponse?: { ok: boolean; json: () => Promise<unknown> }) {
  const providersResponse = {
    ok: true,
    json: async () => ({ claude: true, codex: false }),
  }
  if (!projectResponse) {
    global.fetch = vi.fn().mockResolvedValue(providersResponse)
    return
  }
  global.fetch = vi.fn()
    .mockResolvedValueOnce(providersResponse)
    .mockResolvedValueOnce(projectResponse)
}

describe('AddProjectDialog', () => {
  beforeEach(() => {
    mockStartSetupWizard.mockClear()
    mockSetActiveProjectId.mockClear()
    mockAddProject.mockReset()
    mockAddProject.mockResolvedValue({
      project: { id: 'new-proj', name: 'My Project' },
      has_specrails: true,
    })
    vi.clearAllMocks()
    mockFetchSequence()
  })

  it('renders dialog when open=true — shows path input directly', () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('/Users/me/my-project')).toBeInTheDocument()
  })

  it('does not render dialog when open=false', () => {
    render(<AddProjectDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByPlaceholderText('/Users/me/my-project')).not.toBeInTheDocument()
  })

  it('shows path and name inputs immediately on open', async () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByPlaceholderText('/Users/me/my-project')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('My Project')).toBeInTheDocument()
  })

  it('submit button is disabled when path is empty', async () => {
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

    render(<AddProjectDialog open={true} onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/Users/me/my-project')
    await user.type(pathInput, '/some/path')
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    await user.click(addBtn)

    await waitFor(() => {
      expect(mockAddProject).toHaveBeenCalledWith('/some/path', undefined, 'claude')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('error response shows toast.error', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')
    mockAddProject.mockRejectedValueOnce(new Error('Path not found'))

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
    mockAddProject.mockResolvedValueOnce({
      project: { id: 'new-proj', name: 'New Project' },
      has_specrails: false,
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

  it('shows Claude and Codex provider buttons', async () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Claude/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Codex/i })).toBeInTheDocument()
  })

  it('Codex button is disabled with "Coming Soon" label (coming soon — in lab)', async () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    const codexBtn = screen.getByRole('button', { name: /Codex/i })
    expect(codexBtn).toBeDisabled()
    expect(codexBtn).toHaveTextContent(/Coming Soon/i)
  })

  it('shows Add Project dialog title', async () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /Add Project/i })).toBeInTheDocument()
  })

  it('when only codex is reported by server, codex remains disabled (forced to false client-side)', async () => {
    // Server may say codex=true, but client forces it to unavailable until the lab feature ships.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ claude: true, codex: true }),
    })

    render(<AddProjectDialog open={true} onClose={vi.fn()} />)

    await waitFor(() => {
      const codexBtn = screen.getByRole('button', { name: /Codex/i })
      expect(codexBtn).toBeDisabled()
    })
  })
})
