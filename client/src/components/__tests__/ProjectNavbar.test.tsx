import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '../../test-utils'
import { ProjectNavbar } from '../ProjectNavbar'

const cycleLeftMode = vi.fn()
const cycleRightMode = vi.fn()

vi.mock('../../context/SidebarPinContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/SidebarPinContext')>()
  return {
    ...actual,
    useSidebarPin: () => ({
      leftMode: 'unpinned',
      rightMode: 'unpinned',
      setLeftMode: vi.fn(),
      setRightMode: vi.fn(),
      cycleLeftMode,
      cycleRightMode,
    }),
  }
})

describe('ProjectNavbar', () => {
  it('renders as a nav element', () => {
    render(<ProjectNavbar />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('renders the left sidebar pin button', () => {
    render(<ProjectNavbar />)
    expect(screen.getByRole('button', { name: /Pin left sidebar open/i })).toBeInTheDocument()
  })

  it('renders the right sidebar pin button', () => {
    render(<ProjectNavbar />)
    expect(screen.getByRole('button', { name: /Pin right sidebar open/i })).toBeInTheDocument()
  })

  it('clicking left pin button cycles the left mode', () => {
    render(<ProjectNavbar />)
    fireEvent.click(screen.getByRole('button', { name: /Pin left sidebar open/i }))
    expect(cycleLeftMode).toHaveBeenCalledOnce()
  })

  it('clicking right pin button cycles the right mode', () => {
    render(<ProjectNavbar />)
    fireEvent.click(screen.getByRole('button', { name: /Pin right sidebar open/i }))
    expect(cycleRightMode).toHaveBeenCalledOnce()
  })
})
