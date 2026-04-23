import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { ImplementWizard } from '../ImplementWizard'

vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api',
}))

vi.mock('../../hooks/useHub', () => ({
  useHub: () => ({
    activeProjectId: 'proj-1',
    projects: [],
    isLoading: false,
    setupProjectIds: new Set(),
    setActiveProjectId: vi.fn(),
    startSetupWizard: vi.fn(),
    completeSetupWizard: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}))

// Mock the profile picker — it fetches and can block rendering in tests.
// The picker itself is exercised by its own unit tests; here we just want it
// out of the way so the wizard's path-selection behavior remains testable.
vi.mock('../agents/ProfilePicker', () => ({
  ProfilePicker: () => null,
  selectionToSpawnPayload: () => ({ profileName: null }),
  useDefaultProfileSelection: () => [{ kind: 'legacy' }, () => {}],
  useProjectProfiles: () => [],
}))

// Mock IssuePickerStep and FreeFormStep to avoid heavy dependencies
vi.mock('../IssuePickerStep', () => ({
  IssuePickerStep: ({ onSelectionChange }: { onSelectionChange: (issues: Array<{ id: string; number: number; title: string; body?: string; labels: string[] }>) => void }) => (
    <div data-testid="issue-picker">
      <button onClick={() => onSelectionChange([{ id: 'i1', number: 1, title: 'Fix bug', body: '', labels: [] }])}>
        Select Issue
      </button>
      <button onClick={() => onSelectionChange([
        { id: 'i1', number: 1, title: 'Fix bug', body: '', labels: [] },
        { id: 'i2', number: 2, title: 'Add feature', body: '', labels: [] },
      ])}>
        Select Two Issues
      </button>
    </div>
  ),
  FreeFormStep: ({ title, onTitleChange, onDescriptionChange }: {
    title: string
    description: string
    onTitleChange: (v: string) => void
    onDescriptionChange: (v: string) => void
  }) => (
    <div data-testid="free-form-step">
      <input
        data-testid="title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Feature title"
      />
      <input
        data-testid="desc-input"
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Description"
      />
    </div>
  ),
}))

describe('ImplementWizard', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'new-job-id' }),
    })
  })

  it('does not render dialog content when open=false', () => {
    render(<ImplementWizard open={false} onClose={onClose} />)
    expect(screen.queryByText('Implement Feature')).not.toBeInTheDocument()
  })

  it('renders "Implement Feature" title when open=true', async () => {
    render(<ImplementWizard open={true} onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByText('Implement Feature')).toBeInTheDocument()
    })
  })

  it('renders "From Issues" and "Free Form" path selection cards', async () => {
    render(<ImplementWizard open={true} onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByText('From Issues')).toBeInTheDocument()
      expect(screen.getByText('Free Form')).toBeInTheDocument()
    })
  })

  it('shows IssuePickerStep when "From Issues" is clicked', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    await user.click(screen.getByText('From Issues').closest('button') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('issue-picker')).toBeInTheDocument()
    })
  })

  it('shows FreeFormStep when "Free Form" is clicked', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    await user.click(screen.getByText('Free Form').closest('button') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('free-form-step')).toBeInTheDocument()
    })
  })

  it('"Queue Job" button is disabled when no issues selected (from-issues path)', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    await user.click(screen.getByText('From Issues').closest('button') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /queue job/i })).toBeDisabled()
    })
  })

  it('"Queue Job" button enabled after selecting one issue', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    await user.click(screen.getByText('From Issues').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('issue-picker')).toBeInTheDocument())
    await user.click(screen.getByText('Select Issue'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /queue job/i })).not.toBeDisabled()
    })
  })

  it('shows "Queue 2 Jobs" when two issues are selected', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    await user.click(screen.getByText('From Issues').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('issue-picker')).toBeInTheDocument())
    await user.click(screen.getByText('Select Two Issues'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /queue 2 jobs/i })).toBeInTheDocument()
    })
  })

  it('"Queue Job" button is disabled when free-form title is empty', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    await user.click(screen.getByText('Free Form').closest('button') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /queue job/i })).toBeDisabled()
    })
  })

  it('"Queue Job" button enabled when free-form title is filled', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    await user.click(screen.getByText('Free Form').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'My feature' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /queue job/i })).not.toBeDisabled()
    })
  })

  it('submits successfully with free-form title', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    await user.click(screen.getByText('Free Form').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'My new feature' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /queue job/i })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /queue job/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/spawn', expect.objectContaining({ method: 'POST' }))
      expect(toast.success).toHaveBeenCalledWith('Job queued', expect.objectContaining({ description: expect.stringContaining('My new feature') }))
    })
  })

  it('shows error toast when spawn fails', async () => {
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Server busy' }),
    })

    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    await user.click(screen.getByText('Free Form').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('title-input'), { target: { value: 'Some feature' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /queue job/i })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /queue job/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to queue job',
        expect.objectContaining({ description: 'Server busy' })
      )
    })
  })

  it('"Back" button returns to path selection', async () => {
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    await user.click(screen.getByText('Free Form').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /back/i }))

    await waitFor(() => {
      expect(screen.getByText('From Issues')).toBeInTheDocument()
      expect(screen.getByText('Free Form')).toBeInTheDocument()
    })
  })

  it('calls onClose when X (close) button is clicked', async () => {
    render(<ImplementWizard open={true} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Implement Feature')).toBeInTheDocument())

    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('submits with selected issue (from-issues path)', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    render(<ImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    await user.click(screen.getByText('From Issues').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('issue-picker')).toBeInTheDocument())
    await user.click(screen.getByText('Select Issue'))

    await waitFor(() => expect(screen.getByRole('button', { name: /queue job/i })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /queue job/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spawn',
        expect.objectContaining({ method: 'POST' })
      )
      expect(toast.success).toHaveBeenCalledWith('Job queued', expect.anything())
    })
  })
})
