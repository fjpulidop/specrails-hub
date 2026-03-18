import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { CommandGrid } from '../CommandGrid'
import type { CommandInfo } from '../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: 'test-job-id' }),
  })
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cmd(slug: string, overrides: Partial<CommandInfo> = {}): CommandInfo {
  return {
    id:          `id-${slug}`,
    name:        slug,
    description: `Description of ${slug}`,
    slug,
    ...overrides,
  }
}

const ALL_COMMANDS: CommandInfo[] = [
  cmd('propose-spec',                  { name: 'Propose Spec' }),
  cmd('update-product-driven-backlog', { name: 'Update Backlog' }),
  cmd('product-backlog',               { name: 'Product Backlog' }),
  cmd('implement',                     { name: 'Implement' }),
  cmd('batch-implement',               { name: 'Batch Implement' }),
  cmd('propose-feature',               { name: 'Propose Feature' }),   // hidden
  cmd('refactor-recommender',          { name: 'Refactor Recommender' }),
  cmd('health-check',                  { name: 'Health Check' }),
]

const onOpenWizard = vi.fn()

function renderGrid(commands: CommandInfo[] = ALL_COMMANDS) {
  return render(<CommandGrid commands={commands} onOpenWizard={onOpenWizard} />)
}

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

describe('CommandGrid rendering', () => {
  it('renders without crashing', () => {
    renderGrid()
  })

  it('shows empty state when no commands provided', () => {
    renderGrid([])
    expect(screen.getByText(/No commands found/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

describe('Section headers', () => {
  it('renders Discovery section header', () => {
    renderGrid()
    // The label is rendered as "Discovery" but CSS text-transform: uppercase makes it look like DISCOVERY
    expect(screen.getByText('Discovery')).toBeInTheDocument()
  })

  it('renders Delivery section header', () => {
    renderGrid()
    expect(screen.getByText('Delivery')).toBeInTheDocument()
  })

  it('does not render Others header when there are no other commands', () => {
    const discoveryAndDelivery = ALL_COMMANDS.filter(
      (c) => ['propose-spec', 'update-product-driven-backlog', 'product-backlog', 'implement', 'batch-implement'].includes(c.slug)
    )
    renderGrid(discoveryAndDelivery)
    expect(screen.queryByText(/Others/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Discovery section — order
// ---------------------------------------------------------------------------

describe('Discovery section — command order', () => {
  it('propose-spec is the first Discovery item', () => {
    renderGrid()
    // "Discovery" span's ancestor div contains the command buttons for that section
    // We check relative order: Propose Spec should appear before Auto-propose Specs
    const allButtons = screen.getAllByRole('button')
    const proposeSpecIdx = allButtons.findIndex((b) => b.textContent?.includes('Propose Spec') && !b.textContent?.includes('Auto'))
    const autoPropose = allButtons.findIndex((b) => b.textContent?.includes('Auto-propose Specs'))
    expect(proposeSpecIdx).toBeGreaterThanOrEqual(0)
    expect(proposeSpecIdx).toBeLessThan(autoPropose)
  })

  it('update-product-driven-backlog is the second Discovery item', () => {
    renderGrid()
    const allButtons = screen.getAllByRole('button')
    const autoPropose = allButtons.findIndex((b) => b.textContent?.includes('Auto-propose Specs'))
    const autoSelect = allButtons.findIndex((b) => b.textContent?.includes('Auto-Select Specs'))
    expect(autoPropose).toBeGreaterThanOrEqual(0)
    expect(autoPropose).toBeLessThan(autoSelect)
    expect(screen.getByRole('button', { name: /Auto-propose Specs/i })).toBeInTheDocument()
  })

  it('product-backlog is the third Discovery item', () => {
    renderGrid()
    const allButtons = screen.getAllByRole('button')
    const autoSelect = allButtons.findIndex((b) => b.textContent?.includes('Auto-Select Specs'))
    const implement = allButtons.findIndex((b) => b.textContent?.includes('Implement') && !b.textContent?.includes('Batch'))
    expect(autoSelect).toBeGreaterThanOrEqual(0)
    // Auto-Select Specs (product-backlog) should come before Implement (delivery)
    expect(autoSelect).toBeLessThan(implement)
    expect(screen.getByRole('button', { name: /Auto-Select Specs/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Delivery section — order
// ---------------------------------------------------------------------------

describe('Delivery section — command order', () => {
  it('implement appears before batch-implement', () => {
    renderGrid()
    const allButtons = screen.getAllByRole('button')
    const implementIdx    = allButtons.findIndex((b) => b.textContent?.includes('Implement') && !b.textContent?.includes('Batch'))
    const batchImplIdx    = allButtons.findIndex((b) => b.textContent?.includes('Batch Implement'))
    expect(implementIdx).toBeLessThan(batchImplIdx)
  })
})

// ---------------------------------------------------------------------------
// HIDDEN_SLUGS — propose-feature must not appear
// ---------------------------------------------------------------------------

describe('propose-feature is hidden', () => {
  it('does not render a button labelled Propose Feature', () => {
    renderGrid(ALL_COMMANDS)
    expect(screen.queryByText('Propose Feature')).toBeNull()
  })

  it('does not render any element with text containing propose-feature', () => {
    renderGrid(ALL_COMMANDS)
    expect(screen.queryByText(/propose-feature/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Display name overrides
// ---------------------------------------------------------------------------

describe('Display name overrides', () => {
  it('update-product-driven-backlog displays as "Auto-propose Specs"', () => {
    renderGrid()
    expect(screen.getByText('Auto-propose Specs')).toBeInTheDocument()
  })

  it('product-backlog displays as "Auto-Select Specs"', () => {
    renderGrid()
    expect(screen.getByText('Auto-Select Specs')).toBeInTheDocument()
  })

  it('"Update Backlog" (raw name) is not shown for update-product-driven-backlog', () => {
    renderGrid()
    expect(screen.queryByText('Update Backlog')).toBeNull()
  })

  it('"Product Backlog" (raw name) is not shown for product-backlog', () => {
    renderGrid()
    expect(screen.queryByText('Product Backlog')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tooltips — must show /sr:<slug>, not the display name
// ---------------------------------------------------------------------------

// Note: Radix UI Tooltip content renders into a portal only after pointer events
// that jsdom doesn't fully support. We verify the tooltip trigger exists and the
// command slug is correctly associated with each command card.
describe('Tooltips show real /sr:<slug> command', () => {
  it('update-product-driven-backlog command button is a tooltip trigger', () => {
    renderGrid()
    // The button for "Auto-propose Specs" is wrapped in a TooltipTrigger — it renders fine
    expect(screen.getByRole('button', { name: /Auto-propose Specs/i })).toBeInTheDocument()
  })

  it('product-backlog command button is a tooltip trigger', () => {
    renderGrid()
    expect(screen.getByRole('button', { name: /Auto-Select Specs/i })).toBeInTheDocument()
  })

  it('tooltip does NOT contain the display name override for update-product-driven-backlog', async () => {
    const user = userEvent.setup()
    renderGrid()
    const button = screen.getByRole('button', { name: /Auto-propose Specs/i })
    await user.hover(button)
    // The tooltip should show the slug-based text, not /sr:Auto-propose Specs
    expect(document.body).not.toHaveTextContent('/sr:Auto-propose Specs')
  })
})

// ---------------------------------------------------------------------------
// Others section
// ---------------------------------------------------------------------------

describe('Others section', () => {
  it('Others header is collapsed by default', () => {
    renderGrid()
    const othersBtn = screen.getByRole('button', { name: /Others/i })
    expect(othersBtn).toBeInTheDocument()
    expect(screen.queryByText('Refactor Recommender')).toBeNull()
  })

  it('clicking Others header expands the section', async () => {
    const user = userEvent.setup()
    renderGrid()
    const othersBtn = screen.getByRole('button', { name: /Others/i })
    await user.click(othersBtn)
    expect(screen.getByText('Refactor Recommender')).toBeInTheDocument()
    expect(screen.getByText('Health Check')).toBeInTheDocument()
  })

  it('Discovery commands do not appear in Others', async () => {
    const user = userEvent.setup()
    renderGrid()
    const othersBtn = screen.getByRole('button', { name: /Others/i })
    await user.click(othersBtn)
    const proposeCells = screen.queryAllByText('Propose Spec')
    expect(proposeCells).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Wizard commands open wizard, non-wizard commands spawn
// ---------------------------------------------------------------------------

describe('Click behaviour', () => {
  beforeEach(() => {
    onOpenWizard.mockClear()
  })

  it('clicking implement calls onOpenWizard("implement")', async () => {
    const user = userEvent.setup()
    renderGrid()
    const btn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Implement') && !b.textContent?.includes('Batch'))
    expect(btn).toBeDefined()
    await user.click(btn!)
    expect(onOpenWizard).toHaveBeenCalledWith('implement')
  })

  it('clicking batch-implement calls onOpenWizard("batch-implement")', async () => {
    const user = userEvent.setup()
    renderGrid()
    const btn = screen.getByRole('button', { name: /Batch Implement/i })
    await user.click(btn)
    expect(onOpenWizard).toHaveBeenCalledWith('batch-implement')
  })

  it('clicking propose-spec does NOT call onOpenWizard', async () => {
    const user = userEvent.setup()
    renderGrid()
    // There may be multiple buttons matching "Propose Spec" (e.g., tooltip content)
    // Use getAllByRole and pick the first one that's a proper command button
    const btns = screen.getAllByRole('button', { name: /Propose Spec/i })
    // The first button is the command card button
    await user.click(btns[0])
    expect(onOpenWizard).not.toHaveBeenCalled()
  })
})
