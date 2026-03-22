import '@testing-library/jest-dom/vitest'
import { vi, afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Reset fetch mock before each test
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  })
})

// Mock window.matchMedia (required by some Radix components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver (required by Radix and @dnd-kit)
// Use a class so vi.restoreAllMocks() cannot clear the implementation
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock scrollIntoView (not available in jsdom)
window.HTMLElement.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollIntoView = vi.fn()

// localStorage mock (jsdom v25+ does not expose Storage methods by default)
const _localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => _localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { _localStorageStore[key] = String(value) },
  removeItem: (key: string) => { delete _localStorageStore[key] },
  clear: () => { Object.keys(_localStorageStore).forEach((k) => delete _localStorageStore[k]) },
  get length() { return Object.keys(_localStorageStore).length },
  key: (index: number) => Object.keys(_localStorageStore)[index] ?? null,
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: false })

afterEach(() => {
  localStorageMock.clear()
})
