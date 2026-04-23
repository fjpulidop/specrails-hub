import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { BatchImplementWizard } from '../BatchImplementWizard'

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
vi.mock('../agents/ProfilePicker', () => ({
  ProfilePicker: () => null,
  selectionToSpawnPayload: () => ({ profileName: null }),
  useDefaultProfileSelection: () => [{ kind: 'legacy' }, () => {}],
  useProjectProfiles: () => [],
}))

// Mock IssuePickerStep and BatchFreeFormStep to avoid heavy dependencies
vi.mock('../IssuePickerStep', () => ({
  IssuePickerStep: ({ onSelectionChange }: { onSelectionChange: (issues: Array<{ id: string; number: number; title: string; body?: string; labels: string[] }>) => void }) => (
    <div data-testid="issue-picker">
      <button
        onClick={() => onSelectionChange([{ id: 'i1', number: 1, title: 'Fix bug', body: '', labels: [] }])}
      >
        Select Issue
      </button>
    </div>
  ),
  BatchFreeFormStep: ({ items, onItemsChange }: {
    items: Array<{ title: string; description: string }>
    onItemsChange: (items: Array<{ title: string; description: string }>) => void
  }) => (
    <div data-testid="free-form-step">
      <input
        data-testid="feature-title-input"
        value={items[0]?.title ?? ''}
        onChange={(e) => onItemsChange([{ title: e.target.value, description: '' }])}
        placeholder="Feature title"
      />
    </div>
  ),
}))

describe('BatchImplementWizard', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'new-job-id' }),
    })
  })

  it('does not render dialog content when open=false', () => {
    render(<BatchImplementWizard open={false} onClose={onClose} />)
    expect(screen.queryByText('Batch Implement')).not.toBeInTheDocument()
  })

  it('renders "Batch Implement" title when open=true', async () => {
    render(<BatchImplementWizard open={true} onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByText('Batch Implement')).toBeInTheDocument()
    })
  })

  it('renders "From Issues" and "Free Form" path selection cards', async () => {
    render(<BatchImplementWizard open={true} onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByText('From Issues')).toBeInTheDocument()
      expect(screen.getByText('Free Form')).toBeInTheDocument()
    })
  })

  it('shows IssuePickerStep when "From Issues" is clicked', async () => {
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('From Issues')).toBeInTheDocument()
    })

    // The "From Issues" card — find by the card containing the text
    const fromIssuesCard = screen.getByText('From Issues').closest('button') as HTMLElement
    await user.click(fromIssuesCard)

    await waitFor(() => {
      expect(screen.getByTestId('issue-picker')).toBeInTheDocument()
    })
  })

  it('shows BatchFreeFormStep when "Free Form" is clicked', async () => {
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Free Form')).toBeInTheDocument()
    })

    const freeFormCard = screen.getByText('Free Form').closest('button') as HTMLElement
    await user.click(freeFormCard)

    await waitFor(() => {
      expect(screen.getByTestId('free-form-step')).toBeInTheDocument()
    })
  })

  it('"Queue Batch Job" button is disabled when no issues selected (from-issues path)', async () => {
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    const fromIssuesCard = screen.getByText('From Issues').closest('button') as HTMLElement
    await user.click(fromIssuesCard)

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
      expect(submitBtn).toBeDisabled()
    })
  })

  it('"Queue Batch Job" button is enabled after selecting an issue (from-issues path)', async () => {
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    const fromIssuesCard = screen.getByText('From Issues').closest('button') as HTMLElement
    await user.click(fromIssuesCard)

    await waitFor(() => expect(screen.getByTestId('issue-picker')).toBeInTheDocument())

    // Click mock "Select Issue" button to trigger onSelectionChange
    await user.click(screen.getByText('Select Issue'))

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
      expect(submitBtn).not.toBeDisabled()
    })
  })

  it('"Queue Batch Job" button is disabled when free-form title is empty', async () => {
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    const freeFormCard = screen.getByText('Free Form').closest('button') as HTMLElement
    await user.click(freeFormCard)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())

    const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
    expect(submitBtn).toBeDisabled()
  })

  it('submits successfully with valid free-form items', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    const freeFormCard = screen.getByText('Free Form').closest('button') as HTMLElement
    await user.click(freeFormCard)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())

    // Fill in a feature title
    const titleInput = screen.getByTestId('feature-title-input')
    fireEvent.change(titleInput, { target: { value: 'New awesome feature' } })

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
      expect(submitBtn).not.toBeDisabled()
    })

    const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spawn',
        expect.objectContaining({ method: 'POST' })
      )
      expect(toast.success).toHaveBeenCalledWith(
        'Batch job queued',
        expect.objectContaining({ description: expect.stringContaining('1') })
      )
    })
  })

  it('shows fetch error toast when spawn fails', async () => {
    const { toast } = await import('sonner')
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Queue full' }),
    })

    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    const freeFormCard = screen.getByText('Free Form').closest('button') as HTMLElement
    await user.click(freeFormCard)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('feature-title-input'), {
      target: { value: 'Some feature' },
    })

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
      expect(submitBtn).not.toBeDisabled()
    })

    const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to queue job',
        expect.objectContaining({ description: 'Queue full' })
      )
    })
  })

  it('"Back" button returns to path selection', async () => {
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Free Form')).toBeInTheDocument())
    const freeFormCard = screen.getByText('Free Form').closest('button') as HTMLElement
    await user.click(freeFormCard)

    await waitFor(() => expect(screen.getByTestId('free-form-step')).toBeInTheDocument())

    // Click Back
    await user.click(screen.getByRole('button', { name: /back/i }))

    await waitFor(() => {
      // Path cards should be visible again
      expect(screen.getByText('From Issues')).toBeInTheDocument()
      expect(screen.getByText('Free Form')).toBeInTheDocument()
    })
  })

  it('calls onClose when X (close) button is clicked', async () => {
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('Batch Implement')).toBeInTheDocument())

    // Radix Dialog X button has an sr-only "Close" span
    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('submits with selected issues (from-issues path)', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    render(<BatchImplementWizard open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('From Issues')).toBeInTheDocument())
    const fromIssuesCard = screen.getByText('From Issues').closest('button') as HTMLElement
    await user.click(fromIssuesCard)

    await waitFor(() => expect(screen.getByTestId('issue-picker')).toBeInTheDocument())

    // Select an issue via the mock button
    await user.click(screen.getByText('Select Issue'))

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
      expect(submitBtn).not.toBeDisabled()
    })

    const submitBtn = screen.getByRole('button', { name: /queue batch job/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/spawn',
        expect.objectContaining({ method: 'POST' })
      )
      expect(toast.success).toHaveBeenCalledWith(
        'Batch job queued',
        expect.objectContaining({ description: expect.stringContaining('1') })
      )
    })
  })
})
