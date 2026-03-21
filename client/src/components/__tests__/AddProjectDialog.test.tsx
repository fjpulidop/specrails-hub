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

/** Advance from provider step to path input step */
async function advanceToInputStep(user: ReturnType<typeof userEvent.setup>) {
  const continueBtn = screen.getByRole('button', { name: /Continue/i })
  await user.click(continueBtn)
}

describe('AddProjectDialog', () => {
  beforeEach(() => {
    mockStartSetupWizard.mockClear()
    mockSetActiveProjectId.mockClear()
    vi.clearAllMocks()
    mockFetchSequence()
  })

  it('renders dialog when open=true — shows provider step first', () => {
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Choose AI Provider/i })).toBeInTheDocument()
  })

  it('does not render dialog when open=false', () => {
    render(<AddProjectDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('Choose AI Provider')).not.toBeInTheDocument()
  })

  it('shows path and name inputs after advancing past provider step', async () => {
    const user = userEvent.setup()
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
    expect(screen.getByPlaceholderText('/Users/me/my-project')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('My Project')).toBeInTheDocument()
  })

  it('submit button is disabled when path is empty', async () => {
    const user = userEvent.setup()
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    expect(addBtn).toBeDisabled()
  })

  it('submit button is enabled when path is filled', async () => {
    const user = userEvent.setup()
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
    const pathInput = screen.getByPlaceholderText('/Users/me/my-project')
    await user.type(pathInput, '/some/path')
    const addBtn = screen.getByRole('button', { name: /Add Project/i })
    expect(addBtn).not.toBeDisabled()
  })

  it('successful submit calls API and closes dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockFetchSequence({
      ok: true,
      json: async () => ({
        project: { id: 'new-proj', name: 'My Project' },
        has_specrails: true,
      }),
    })

    render(<AddProjectDialog open={true} onClose={onClose} />)
    await advanceToInputStep(user)
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
    mockFetchSequence({
      ok: false,
      json: async () => ({ error: 'Path not found' }),
    })

    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
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
    mockFetchSequence({
      ok: true,
      json: async () => ({
        project: { id: 'new-proj', name: 'New Project' },
        has_specrails: false,
      }),
    })

    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
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

  it('back button returns to provider step from input step', async () => {
    const user = userEvent.setup()
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
    expect(screen.getByPlaceholderText('/Users/me/my-project')).toBeInTheDocument()
    const backBtn = screen.getByRole('button', { name: /Back/i })
    await user.click(backBtn)
    expect(screen.getByRole('heading', { name: /Choose AI Provider/i })).toBeInTheDocument()
  })

  it('provider badge shows in input step title', async () => {
    const user = userEvent.setup()
    render(<AddProjectDialog open={true} onClose={vi.fn()} />)
    await advanceToInputStep(user)
    expect(screen.getByText(/Claude/i, { selector: 'span' })).toBeInTheDocument()
  })
})
