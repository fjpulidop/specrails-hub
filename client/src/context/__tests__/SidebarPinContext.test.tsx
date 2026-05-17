import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SidebarPinProvider, useSidebarPin } from '../SidebarPinContext'

function Harness() {
  const { leftMode, rightMode, cycleLeftMode, cycleRightMode, setLeftMode } = useSidebarPin()
  return (
    <div>
      <span data-testid="left">{leftMode}</span>
      <span data-testid="right">{rightMode}</span>
      <button onClick={cycleLeftMode}>cycle-left</button>
      <button onClick={cycleRightMode}>cycle-right</button>
      <button onClick={() => setLeftMode('pinned-open')}>force-open</button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('SidebarPinContext', () => {
  it('defaults to unpinned for both sidebars', () => {
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    expect(screen.getByTestId('left').textContent).toBe('unpinned')
    expect(screen.getByTestId('right').textContent).toBe('unpinned')
  })

  it('cycles left through pinned-open → pinned-collapsed → unpinned', () => {
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    const btn = screen.getByText('cycle-left')
    fireEvent.click(btn)
    expect(screen.getByTestId('left').textContent).toBe('pinned-open')
    fireEvent.click(btn)
    expect(screen.getByTestId('left').textContent).toBe('pinned-collapsed')
    fireEvent.click(btn)
    expect(screen.getByTestId('left').textContent).toBe('unpinned')
    fireEvent.click(btn)
    expect(screen.getByTestId('left').textContent).toBe('pinned-open')
  })

  it('cycles right independently of left', () => {
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    fireEvent.click(screen.getByText('cycle-left'))
    fireEvent.click(screen.getByText('cycle-left'))
    expect(screen.getByTestId('right').textContent).toBe('unpinned')
    fireEvent.click(screen.getByText('cycle-right'))
    expect(screen.getByTestId('right').textContent).toBe('pinned-open')
    expect(screen.getByTestId('left').textContent).toBe('pinned-collapsed')
  })

  it('persists left mode to localStorage', () => {
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    fireEvent.click(screen.getByText('cycle-left'))
    expect(window.localStorage.getItem('specrails-hub:sidebar-mode:left')).toBe('pinned-open')
  })

  it('restores persisted mode on mount', () => {
    window.localStorage.setItem('specrails-hub:sidebar-mode:left', 'pinned-collapsed')
    window.localStorage.setItem('specrails-hub:sidebar-mode:right', 'pinned-open')
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    expect(screen.getByTestId('left').textContent).toBe('pinned-collapsed')
    expect(screen.getByTestId('right').textContent).toBe('pinned-open')
  })

  it('falls back to unpinned on invalid persisted value', () => {
    window.localStorage.setItem('specrails-hub:sidebar-mode:left', 'wat')
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    expect(screen.getByTestId('left').textContent).toBe('unpinned')
  })

  it('survives localStorage.setItem throwing', () => {
    const originalSet = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('quota') }
    try {
      render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
      expect(() => fireEvent.click(screen.getByText('cycle-left'))).not.toThrow()
      expect(screen.getByTestId('left').textContent).toBe('pinned-open')
    } finally {
      Storage.prototype.setItem = originalSet
    }
  })

  it('setLeftMode escape hatch jumps to a specific mode', () => {
    render(<SidebarPinProvider><Harness /></SidebarPinProvider>)
    act(() => {
      fireEvent.click(screen.getByText('force-open'))
    })
    expect(screen.getByTestId('left').textContent).toBe('pinned-open')
  })
})
