import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test-utils'
import { CollapsibleSection } from '../CollapsibleSection'
import {
  DndContext,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

function renderInDndContext(ui: React.ReactElement) {
  const handleDragEnd = (_event: DragEndEvent) => {}
  return render(
    <DndContext onDragEnd={handleDragEnd}>
      <SortableContext items={['health']} strategy={verticalListSortingStrategy}>
        {ui}
      </SortableContext>
    </DndContext>
  )
}

describe('CollapsibleSection', () => {
  const defaultProps = {
    id: 'health' as const,
    title: 'Health',
    expanded: false,
    pinned: false,
    onToggleExpand: vi.fn(),
    onTogglePin: vi.fn(),
    children: <div data-testid="child-content">Health content here</div>,
  }

  it('renders the section title', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} />)
    expect(screen.getByText('Health')).toBeInTheDocument()
  })

  it('renders the section test id', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} />)
    expect(screen.getByTestId('section-health')).toBeInTheDocument()
  })

  it('does not render children when collapsed', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} expanded={false} />)
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('content-health')).not.toBeInTheDocument()
  })

  it('renders children when expanded', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} expanded={true} />)
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    expect(screen.getByTestId('content-health')).toBeInTheDocument()
  })

  it('calls onToggleExpand when the toggle button is clicked', () => {
    const onToggleExpand = vi.fn()
    renderInDndContext(<CollapsibleSection {...defaultProps} onToggleExpand={onToggleExpand} />)

    fireEvent.click(screen.getByTestId('toggle-health'))
    expect(onToggleExpand).toHaveBeenCalledOnce()
  })

  it('calls onTogglePin when the pin button is clicked', () => {
    const onTogglePin = vi.fn()
    renderInDndContext(<CollapsibleSection {...defaultProps} onTogglePin={onTogglePin} />)

    fireEvent.click(screen.getByTestId('pin-health'))
    expect(onTogglePin).toHaveBeenCalledOnce()
  })

  it('renders the indicator next to the title', () => {
    renderInDndContext(
      <CollapsibleSection
        {...defaultProps}
        indicator={<span data-testid="health-badge">85</span>}
      />
    )
    expect(screen.getByTestId('health-badge')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
  })

  it('renders the trailing element', () => {
    renderInDndContext(
      <CollapsibleSection
        {...defaultProps}
        trailing={<button data-testid="export-btn">Export</button>}
      />
    )
    expect(screen.getByTestId('export-btn')).toBeInTheDocument()
  })

  it('renders the drag handle', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} />)
    expect(screen.getByTestId('drag-handle-health')).toBeInTheDocument()
  })

  it('sets aria-expanded correctly when collapsed', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} expanded={false} />)
    expect(screen.getByTestId('toggle-health')).toHaveAttribute('aria-expanded', 'false')
  })

  it('sets aria-expanded correctly when expanded', () => {
    renderInDndContext(<CollapsibleSection {...defaultProps} expanded={true} />)
    expect(screen.getByTestId('toggle-health')).toHaveAttribute('aria-expanded', 'true')
  })

  it('applies different pin styling when pinned vs unpinned', () => {
    const { rerender } = renderInDndContext(
      <CollapsibleSection {...defaultProps} pinned={false} />
    )
    const unpinnedBtn = screen.getByTestId('pin-health')
    expect(unpinnedBtn.className).toContain('text-muted-foreground/30')

    rerender(
      <DndContext onDragEnd={() => {}}>
        <SortableContext items={['health']} strategy={verticalListSortingStrategy}>
          <CollapsibleSection {...defaultProps} pinned={true} />
        </SortableContext>
      </DndContext>
    )
    const pinnedBtn = screen.getByTestId('pin-health')
    expect(pinnedBtn.className).toContain('text-accent-info')
  })
})
