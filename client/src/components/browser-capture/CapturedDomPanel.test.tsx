import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render, screen } from '../../test-utils'
import { CapturedDomPanel } from './CapturedDomPanel'
import type { CapturedDom } from '../../lib/browser-capture'

function makeDom(over: Partial<CapturedDom> = {}): CapturedDom {
  return {
    url: 'https://example.com/pricing',
    title: 'Pricing',
    viewport: { width: 1280, height: 800 },
    rect: { x: 0, y: 0, width: 10, height: 10 },
    html: '<button class="cta">Buy</button>',
    htmlTruncated: false,
    css: '.cta { color: red; }',
    cssTruncated: false,
    nodes: [
      { tag: 'button', role: 'button', text: 'Buy', rect: { x: 0, y: 0, width: 1, height: 1 }, attributes: {}, styles: {} },
      { tag: 'div', role: null, text: null, rect: { x: 0, y: 0, width: 1, height: 1 }, attributes: {}, styles: {} },
    ],
    capturedAt: '2026-06-07T00:00:00.000Z',
    ...over,
  }
}

describe('CapturedDomPanel', () => {
  it('renders the title and element count, collapsed by default', () => {
    render(<CapturedDomPanel dom={makeDom()} />)
    expect(screen.getByText(/Captured page · Pricing/)).toBeInTheDocument()
    expect(screen.getByText(/2 elements/)).toBeInTheDocument()
    expect(screen.queryByTestId('captured-dom-html')).not.toBeInTheDocument()
  })

  it('expands to show the captured HTML and the url', () => {
    render(<CapturedDomPanel dom={makeDom()} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const pre = screen.getByTestId('captured-dom-html')
    expect(pre.textContent).toContain('<button class="cta">Buy</button>')
    expect(screen.getByText('https://example.com/pricing')).toBeInTheDocument()
  })

  it('syntax-highlights the HTML (tag spans rendered)', () => {
    const { container } = render(<CapturedDomPanel dom={makeDom()} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const pre = screen.getByTestId('captured-dom-html')
    // The full HTML text is preserved across the colored spans…
    expect(pre.textContent).toContain('<button class="cta">Buy</button>')
    // …and at least one tag-colored span exists.
    expect(container.querySelector('.text-accent-info')).toBeTruthy()
  })

  it('reveals the applied CSS in its own disclosure', () => {
    render(<CapturedDomPanel dom={makeDom()} />)
    fireEvent.click(screen.getByRole('button', { name: /Captured page/ }))
    expect(screen.queryByTestId('captured-dom-css')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Applied CSS/ }))
    expect(screen.getByTestId('captured-dom-css').textContent).toContain('.cta { color: red; }')
  })

  it('marks the element count with a CSS badge when css is present', () => {
    render(<CapturedDomPanel dom={makeDom()} />)
    expect(screen.getByText(/· CSS/)).toBeInTheDocument()
  })

  it('shows a truncated marker when the html was capped', () => {
    render(<CapturedDomPanel dom={makeDom({ htmlTruncated: true })} />)
    expect(screen.getByText(/truncated/)).toBeInTheDocument()
  })

  it('falls back to the host when there is no title', () => {
    render(<CapturedDomPanel dom={makeDom({ title: '' })} />)
    expect(screen.getByText(/Captured page · example\.com/)).toBeInTheDocument()
  })

  it('invokes onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn()
    render(<CapturedDomPanel dom={makeDom()} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText('Remove captured page context'))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('omits the remove control when no handler is given', () => {
    render(<CapturedDomPanel dom={makeDom()} />)
    expect(screen.queryByLabelText('Remove captured page context')).not.toBeInTheDocument()
  })
})
