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
  { id: 'cmd-1', slug: 'implement', name: 'Implement', description: 'Run implementation' },
  { id: 'cmd-2', slug: 'review', name: 'Review', description: 'Run review' },
]

/** Helper: get all step inputs (input[type=text] inside the dialog) */
function getStepInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'))
}

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
    const inputs = getStepInputs()
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
    expect(getStepInputs().length).toBe(2)
  })

  it('updates command text on input change', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={sampleCommands} />)
    const input = getStepInputs()[0]
    await user.type(input, '/sr:implement')
    expect(input).toHaveValue('/sr:implement')
  })

  it('removes a step when delete button is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.click(screen.getByText('Add Step'))
    expect(getStepInputs().length).toBe(2)
    // Find the enabled delete button (w-7 sized ghost buttons)
    const allButtons = screen.getAllByRole('button')
    const deleteButton = allButtons.find(
      (btn) => !btn.hasAttribute('disabled') && btn.className.includes('w-7')
    )
    if (deleteButton) {
      await user.click(deleteButton)
      expect(getStepInputs().length).toBe(1)
    }
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
    await user.type(getStepInputs()[0], '/sr:implement')
    const submitBtn = screen.getByRole('button', { name: /create pipeline/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('submits pipeline and shows success toast', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(getStepInputs()[0], '/sr:implement')
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
    await user.type(getStepInputs()[0], '/sr:implement')
    await user.click(screen.getByRole('button', { name: /create pipeline/i }))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create pipeline', expect.any(Object))
    })
  })

  it('shows step count in submit button', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    await user.type(getStepInputs()[0], '/sr:implement')
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
    await user.type(getStepInputs()[0], '/sr:implement')
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

  it('moves step up when move button is clicked', async () => {
    const user = userEvent.setup()
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    // Add a second step
    await user.click(screen.getByText('Add Step'))
    const inputs = getStepInputs()
    await user.type(inputs[0], 'step-one')
    await user.type(inputs[1], 'step-two')
    // Click move up on the second step
    const moveButtons = screen.getAllByRole('button', { name: /move step up/i })
    if (moveButtons.length > 1) {
      await user.click(moveButtons[1])
      const updatedInputs = getStepInputs()
      expect(updatedInputs[0]).toHaveValue('step-two')
      expect(updatedInputs[1]).toHaveValue('step-one')
    }
  })

  it('disables delete when only one step exists', () => {
    render(<PipelineBuilder open={true} onClose={onClose} commands={[]} />)
    const allButtons = screen.getAllByRole('button')
    const smallButtons = allButtons.filter((b) => b.className.includes('w-7'))
    expect(smallButtons.length).toBeGreaterThan(0)
    expect(smallButtons[0]).toBeDisabled()
  })
})
