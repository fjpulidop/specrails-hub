import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// We need to mock useSharedWebSocket before importing the hook
const mockRegisterHandler = vi.fn()
const mockUnregisterHandler = vi.fn()
let capturedHandler: ((data: unknown) => void) | null = null

vi.mock('../useSharedWebSocket', () => ({
  useSharedWebSocket: () => ({
    registerHandler: (id: string, fn: (data: unknown) => void) => {
      capturedHandler = fn
      mockRegisterHandler(id, fn)
    },
    unregisterHandler: (id: string) => {
      capturedHandler = null
      mockUnregisterHandler(id)
    },
    connectionStatus: 'connected',
  }),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...(actual as object),
    useNavigate: () => mockNavigate,
  }
})

import { useOsNotifications } from '../useOsNotifications'

// ─── Notification API mock ────────────────────────────────────────────────────

class MockNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn().mockResolvedValue('granted')

  title: string
  options: NotificationOptions
  onclick: (() => void) | null = null

  constructor(title: string, options: NotificationOptions = {}) {
    this.title = title
    this.options = options
    MockNotification.instances.push(this)
  }

  close = vi.fn()

  static instances: MockNotification[] = []
  static clearInstances() {
    MockNotification.instances = []
  }
}

function setupNotificationMock(permission: NotificationPermission = 'granted') {
  MockNotification.permission = permission
  MockNotification.requestPermission = vi.fn().mockResolvedValue(permission)
  MockNotification.clearInstances()
  Object.defineProperty(window, 'Notification', {
    value: MockNotification,
    writable: true,
    configurable: true,
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children)
}

function renderOsNotifications(opts: Parameters<typeof useOsNotifications>[0] = {}) {
  return renderHook(() => useOsNotifications(opts), { wrapper })
}

function sendQueueMessage(jobs: Array<{ id: string; status: string; command?: string }>, projectId?: string) {
  act(() => {
    capturedHandler?.({
      type: 'queue',
      projectId,
      jobs,
    })
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useOsNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
    capturedHandler = null
    setupNotificationMock('granted')
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers and unregisters a WS handler', () => {
    const { unmount } = renderOsNotifications()
    expect(mockRegisterHandler).toHaveBeenCalledWith('os-notifications', expect.any(Function))
    unmount()
    expect(mockUnregisterHandler).toHaveBeenCalledWith('os-notifications')
  })

  it('does not fire notification when no jobs transition', () => {
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'queued' }])
    sendQueueMessage([{ id: 'job-1', status: 'running' }])
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('fires notification when job transitions running → completed', () => {
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running', command: '/architect' }])
    sendQueueMessage([{ id: 'job-1', status: 'completed', command: '/architect' }])

    expect(MockNotification.instances).toHaveLength(1)
    expect(MockNotification.instances[0].title).toBe('Job completed')
  })

  it('fires notification when job transitions running → failed', () => {
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running', command: '/developer' }])
    sendQueueMessage([{ id: 'job-1', status: 'failed', command: '/developer' }])

    expect(MockNotification.instances).toHaveLength(1)
    expect(MockNotification.instances[0].title).toBe('Job failed')
  })

  it('does not fire notification for jobs already completed on first message', () => {
    renderOsNotifications()
    // First message: job already completed (e.g. page loaded after job finished)
    sendQueueMessage([{ id: 'job-1', status: 'completed', command: '/architect' }])
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('does not fire notification for canceled jobs', () => {
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running' }])
    sendQueueMessage([{ id: 'job-1', status: 'canceled' }])
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('includes command in notification body', () => {
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running', command: '/architect --spec SPEA-100' }])
    sendQueueMessage([{ id: 'job-1', status: 'completed', command: '/architect --spec SPEA-100' }])

    expect(MockNotification.instances[0].options.body).toContain('/architect --spec SPEA-100')
  })

  it('includes project name in body when projectsById is provided', () => {
    const projectsById = new Map([['proj-1', 'my-project']])
    renderOsNotifications({ projectsById })

    sendQueueMessage([{ id: 'job-1', status: 'running', command: '/architect' }], 'proj-1')
    sendQueueMessage([{ id: 'job-1', status: 'completed', command: '/architect' }], 'proj-1')

    expect(MockNotification.instances[0].options.body).toContain('[my-project]')
  })

  it('uses tag to deduplicate notifications', () => {
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running' }])
    sendQueueMessage([{ id: 'job-1', status: 'completed' }])

    expect(MockNotification.instances[0].options.tag).toBe('specrails-job:job-1:completed')
  })

  it('does not fire when Notification permission is denied', () => {
    setupNotificationMock('denied')
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running' }])
    sendQueueMessage([{ id: 'job-1', status: 'completed' }])
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('requests permission when permission is default', async () => {
    setupNotificationMock('default')
    renderOsNotifications()
    sendQueueMessage([{ id: 'job-1', status: 'running' }])
    sendQueueMessage([{ id: 'job-1', status: 'completed' }])

    expect(MockNotification.requestPermission).toHaveBeenCalled()
  })

  it('navigates to job detail on notification click (same project)', () => {
    const setActiveProjectId = vi.fn()
    renderOsNotifications({ setActiveProjectId })

    sendQueueMessage([{ id: 'job-42', status: 'running' }])
    sendQueueMessage([{ id: 'job-42', status: 'completed' }])

    expect(MockNotification.instances).toHaveLength(1)

    // Simulate click without projectId (legacy or same project)
    act(() => {
      MockNotification.instances[0].onclick?.()
    })

    // No projectId → navigate immediately
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-42')
    expect(setActiveProjectId).not.toHaveBeenCalled()
  })

  it('switches project and navigates after delay on cross-project click', () => {
    const setActiveProjectId = vi.fn()
    renderOsNotifications({ setActiveProjectId })

    sendQueueMessage([{ id: 'job-99', status: 'running', command: '/ship' }], 'proj-B')
    sendQueueMessage([{ id: 'job-99', status: 'completed', command: '/ship' }], 'proj-B')

    act(() => {
      MockNotification.instances[0].onclick?.()
    })

    expect(setActiveProjectId).toHaveBeenCalledWith('proj-B')
    // Navigation delayed by 100ms
    expect(mockNavigate).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-99')
  })

  it('ignores non-queue WS message types', () => {
    renderOsNotifications()
    act(() => {
      capturedHandler?.({ type: 'phase', phase: 'architect', state: 'running' })
      capturedHandler?.({ type: 'hub.projects', projects: [] })
    })
    expect(MockNotification.instances).toHaveLength(0)
  })

  it('handles missing Notification API gracefully', () => {
    const original = (window as Record<string, unknown>)['Notification']
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (window as Record<string, unknown>)['Notification']

    expect(() => {
      renderOsNotifications()
      sendQueueMessage([{ id: 'job-1', status: 'running' }])
      sendQueueMessage([{ id: 'job-1', status: 'completed' }])
    }).not.toThrow()

    // Restore
    Object.defineProperty(window, 'Notification', { value: original, writable: true, configurable: true })
  })

  it('truncates long commands to 80 chars in body', () => {
    renderOsNotifications()
    const longCommand = '/architect ' + 'x'.repeat(100)
    sendQueueMessage([{ id: 'job-1', status: 'running', command: longCommand }])
    sendQueueMessage([{ id: 'job-1', status: 'completed', command: longCommand }])

    const body = MockNotification.instances[0].options.body as string
    expect(body.length).toBeLessThanOrEqual(80)
  })
})
