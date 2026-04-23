import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '../../test-utils'
import { AiEditDiffView } from '../AiEditDiffView'

describe('AiEditDiffView', () => {
  it('renders unchanged text as plain spans', () => {
    render(<AiEditDiffView original="hello world" proposed="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
    expect(screen.queryByLabelText('inserted')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('removed')).not.toBeInTheDocument()
  })

  it('marks inserted words', () => {
    render(<AiEditDiffView original="hello" proposed="hello world" />)
    expect(screen.getByLabelText('inserted')).toHaveTextContent('world')
  })

  it('marks removed words', () => {
    render(<AiEditDiffView original="hello world" proposed="hello" />)
    expect(screen.getByLabelText('removed')).toHaveTextContent('world')
  })

  it('suppresses whitespace-only deletions', () => {
    render(<AiEditDiffView original="hello  world" proposed="hello world" />)
    // Extra space removed — should not show removed span for whitespace only
    const removed = screen.queryAllByLabelText('removed')
    removed.forEach(el => {
      expect(el.textContent?.trim()).not.toBe('')
    })
  })

  it('applies className prop', () => {
    const { container } = render(
      <AiEditDiffView original="a" proposed="b" className="custom-class" />,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders both insertions and deletions in same diff', () => {
    render(<AiEditDiffView original="foo bar" proposed="foo baz" />)
    expect(screen.getByLabelText('inserted')).toHaveTextContent('baz')
    expect(screen.getByLabelText('removed')).toHaveTextContent('bar')
  })
})
