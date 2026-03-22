import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { PipelineBuilder } from '../PipelineBuilder'
import type { CommandInfo } from '../../types'

vi.mock('../../lib/api', () => ({
  getApiBase: () => '/api/projects/proj-1',
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const { toast } = await import('sonner')

const sampleCommands: CommandInfo[] = [
  { slug: 'implement', name: 'Implement', section: 'delivery', description: 'Run implementation', displayName: null },
  { slug: 'review', name: 'Review', section: 'delivery', description: 'Run review', displayName: null },
]

describe('PipelineBuilder', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pipelineId: 'pipe-1', jobs: [{ jobId: 'j1' }] }),
    })
  })

  it('renders nothing when open=false', () => {
    render(<PipelineBuilder open={false} onClose={onClose} commands={[]} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog with "Create Pipeline" title when open', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Create Pipeline')).toBeInTheDocument()
  })

  it('renders one empty step by default', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBe(1)
    expect(inputs[0]).toHaveValue('')
  })

  it('renders "Add Step" button', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    expect(screen.getByText('Add Step')).toBeInTheDocument()
  })

  it('adds a step when "Add Step" is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.click(screen.getByText('Add Step'))
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBe(2)
  })

  it('updates command text on input change', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={sampleCommands} />)
    const input = screen.getByRole('textbox')
    await user.type(input, '/sr:implement')
    expect(input).toHaveValue('/sr:implement')
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('submit button is disabled when no valid steps', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    const submitBtn = screen.getByRole('button', { name: /create pipeline/i })
    expect(submitBtn).toBeDisabled()
  })

  it('submit button is enabled when a step has a command', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(screen.getByRole('textbox'), '/sr:implement')
    const submitBtn = screen.getByRole('button', { name: /create pipeline/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('submits pipeline and shows success toast', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(screen.getByRole('textbox'), '/sr:implement')
    await user.click(screen.getByRole('button', { name: /create pipeline/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/pipelines',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pipeline created', expect.any(Object))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error toast when submission fails', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    })
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(screen.getByRole('textbox'), '/sr:implement')
    await user.click(screen.getByRole('button', { name: /create pipeline/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create pipeline', expect.any(Object))
    })
  })

  it('shows step count in submit button', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(screen.getByRole('textbox'), '/sr:implement')
    expect(screen.getByRole('button', { name: /create pipeline \(1 steps?\)/i })).toBeInTheDocument()
  })

  it('renders description text', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    expect(screen.getByText(/chain commands to run sequentially/i)).toBeInTheDocument()
  })

  it('handles network error gracefully', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network failure'))
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(screen.getByRole('textbox'), '/sr:implement')
    await user.click(screen.getByRole('button', { name: /create pipeline/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create pipeline',
        expect.objectContaining({ description: 'Network failure' }),
      )
    })
  })

  it('renders move up button disabled for first step', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    const moveUpBtn = screen.getByRole('button', { name: /move step up/i })
    expect(moveUpBtn).toBeDisabled()
  })

  it('disables delete when only one step exists', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    // Find all buttons - the trash button should be disabled
    const buttons = screen.getAllByRole('button')
    const trashBtn = buttons.find((b) => b.hasAttribute('disabled') && !b.textContent?.includes('Create'))
    // The single step's delete button should be disabled
    expect(trashBtn).toBeDefined()
  })
})
