import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { CreateTemplateDialog } from '../CreateTemplateDialog'
import type { JobTemplate } from '../../types'

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

function makeTemplate(overrides: Partial<JobTemplate> = {}): JobTemplate {
  return {
    id: 'tpl-1',
    name: 'Full pipeline',
    description: 'Does everything',
    commands: ['/sr:implement #1', '/sr:review #1'],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('CreateTemplateDialog', () => {
  const onClose = vi.fn()
  const onSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ template: makeTemplate() }),
    })
  })

  // ─── Rendering ──────────────────────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    render(<CreateTemplateDialog open={false} onClose={onClose} onSaved={onSaved} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog with "New Template" title when creating', () => {
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Template')).toBeInTheDocument()
  })

  it('renders dialog with "Edit Template" title when editing', () => {
    render(
      <CreateTemplateDialog
        open={true}
        template={makeTemplate()}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
    expect(screen.getByText('Edit Template')).toBeInTheDocument()
  })

  it('pre-fills form fields from template when editing', () => {
    render(
      <CreateTemplateDialog
        open={true}
        template={makeTemplate()}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
    expect(screen.getByDisplayValue('Full pipeline')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Does everything')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/sr:implement #1')).toBeInTheDocument()
  })

  it('starts with one empty command row when creating', () => {
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    const inputs = screen.getAllByPlaceholderText('/sr:implement #42')
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toHaveValue('')
  })

  // ─── Cancel / close ─────────────────────────────────────────────────────────

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // ─── Add / remove / edit commands ───────────────────────────────────────────

  it('adds a new empty command row when Add is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /Add/i }))
    const inputs = screen.getAllByPlaceholderText('/sr:implement #42')
    expect(inputs).toHaveLength(2)
  })

  it('removes a command row when Remove is clicked (only when >1 exist)', async () => {
    const user = userEvent.setup()
    render(
      <CreateTemplateDialog
        open={true}
        template={makeTemplate()}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
    // Template has 2 commands; remove the first one
    const removeButtons = screen.getAllByRole('button', { name: /Remove command/i })
    await user.click(removeButtons[0])
    const inputs = screen.getAllByPlaceholderText('/sr:implement #42')
    expect(inputs).toHaveLength(1)
  })

  it('updates a command value on input change', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    const input = screen.getByPlaceholderText('/sr:implement #42')
    await user.type(input, '/sr:implement #99')
    expect(input).toHaveValue('/sr:implement #99')
  })

  it('moves command up via the move button', async () => {
    const user = userEvent.setup()
    render(
      <CreateTemplateDialog
        open={true}
        template={makeTemplate()}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
    // Click "Move up" on the second command (index 1)
    const moveUpButtons = screen.getAllByRole('button', { name: /Move up/i })
    // First "Move up" is disabled (index 0), second is for index 1
    await user.click(moveUpButtons[1])
    const inputs = screen.getAllByPlaceholderText('/sr:implement #42')
    expect(inputs[0]).toHaveValue('/sr:review #1')
    expect(inputs[1]).toHaveValue('/sr:implement #1')
  })

  it('does not move command when already at boundary (first item up / last item down)', async () => {
    const user = userEvent.setup()
    render(
      <CreateTemplateDialog
        open={true}
        template={makeTemplate()}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
    const inputsBefore = screen.getAllByPlaceholderText('/sr:implement #42')
    const valuesBefore = inputsBefore.map((i) => (i as HTMLInputElement).value)

    // Click "Move up" on first command — should be no-op (disabled)
    const moveUpButtons = screen.getAllByRole('button', { name: /Move up/i })
    // First button is disabled; clicking disabled doesn't fire but let's verify order unchanged
    await user.click(moveUpButtons[0])

    const inputsAfter = screen.getAllByPlaceholderText('/sr:implement #42')
    expect(inputsAfter[0]).toHaveValue(valuesBefore[0])
    expect(inputsAfter[1]).toHaveValue(valuesBefore[1])
  })

  // ─── Validation ─────────────────────────────────────────────────────────────

  it('shows toast error and does not submit when name is empty', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /Create/i }))
    expect(toast.error).toHaveBeenCalledWith('Name is required')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows toast error when all commands are blank', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)
    await user.type(screen.getByPlaceholderText('e.g. Full pipeline'), 'My Template')
    // Leave command empty, click Create
    await user.click(screen.getByRole('button', { name: /Create/i }))
    expect(toast.error).toHaveBeenCalledWith('At least one command is required')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // ─── Successful submit ───────────────────────────────────────────────────────

  it('POSTs and calls onSaved + onClose on successful create', async () => {
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)

    await user.type(screen.getByPlaceholderText('e.g. Full pipeline'), 'My Template')
    await user.type(screen.getByPlaceholderText('/sr:implement #42'), '/sr:implement #1')
    await user.click(screen.getByRole('button', { name: /Create/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates'),
        expect.objectContaining({ method: 'POST' })
      )
    })
    expect(toast.success).toHaveBeenCalledWith('Template created')
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('PATCHes when editing an existing template', async () => {
    const user = userEvent.setup()
    render(
      <CreateTemplateDialog
        open={true}
        template={makeTemplate()}
        onClose={onClose}
        onSaved={onSaved}
      />
    )
    await user.click(screen.getByRole('button', { name: /Update/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-1'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
    expect(toast.success).toHaveBeenCalledWith('Template updated')
  })

  // ─── API error ───────────────────────────────────────────────────────────────

  it('shows toast error when API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Name already taken' }),
    })
    const user = userEvent.setup()
    render(<CreateTemplateDialog open={true} onClose={onClose} onSaved={onSaved} />)

    await user.type(screen.getByPlaceholderText('e.g. Full pipeline'), 'My Template')
    await user.type(screen.getByPlaceholderText('/sr:implement #42'), '/sr:implement #1')
    await user.click(screen.getByRole('button', { name: /Create/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Name already taken')
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
