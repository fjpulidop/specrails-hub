import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { Separator } from '../separator'

describe('Separator', () => {
  it('renders horizontal by default with horizontal sizing classes', () => {
    const { container } = render(<Separator />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('data-orientation', 'horizontal')
    expect(el.className).toContain('h-[1px]')
    expect(el.className).toContain('w-full')
    expect(el.className).toContain('bg-border')
    // decorative by default → no semantic separator role
    expect(el).toHaveAttribute('role', 'none')
  })

  it('renders vertical orientation with vertical sizing classes', () => {
    const { container } = render(<Separator orientation="vertical" />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveAttribute('data-orientation', 'vertical')
    expect(el.className).toContain('h-full')
    expect(el.className).toContain('w-[1px]')
  })

  it('exposes the separator role when not decorative', () => {
    const { getByRole } = render(<Separator decorative={false} />)
    expect(getByRole('separator')).toBeInTheDocument()
  })

  it('merges a custom className and forwards refs', () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(<Separator ref={ref} className="my-custom-class" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('my-custom-class')
    expect(el.className).toContain('bg-border')
    expect(ref.current).toBe(el)
  })
})
