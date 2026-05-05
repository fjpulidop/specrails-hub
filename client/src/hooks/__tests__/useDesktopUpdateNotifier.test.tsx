import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '../../test-utils'

const customMock = vi.fn()
const dismissMock = vi.fn()
const checkMock = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    custom: (...args: unknown[]) => customMock(...args),
    dismiss: (...args: unknown[]) => dismissMock(...args),
  },
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => checkMock(...args),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

import { useDesktopUpdateNotifier } from '../useDesktopUpdateNotifier'

function createTauriUpdate() {
  return {
    currentVersion: '1.50.0',
    version: '99.0.0-test',
    downloadAndInstall: vi.fn(async () => {}),
  }
}

describe('useDesktopUpdateNotifier', () => {
  beforeEach(() => {
    customMock.mockReset()
    dismissMock.mockReset()
    checkMock.mockReset()
    localStorage.clear()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    checkMock.mockResolvedValue(createTauriUpdate())
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('calls toast.custom with unstyled:true and the documented options', async () => {
    renderHook(() => useDesktopUpdateNotifier())

    await waitFor(() => {
      expect(customMock).toHaveBeenCalled()
    })

    const [, options] = customMock.mock.calls[0]
    expect(options).toMatchObject({
      id: 'specrails-hub-desktop-update',
      duration: Infinity,
      dismissible: false,
      unstyled: true,
    })
  })

  it('does not surface a toast for a previously-dismissed version', async () => {
    localStorage.setItem('specrails-hub:dismissedDesktopUpdateVersion', '99.0.0-test')
    renderHook(() => useDesktopUpdateNotifier())

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(customMock).not.toHaveBeenCalled()
  })
})
