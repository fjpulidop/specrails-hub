import { describe, it, expect, afterEach } from 'vitest'
import { isCodeExplorerEnabled, isBrowserCaptureEnabled } from './feature-flags'

describe('feature-flags', () => {
  const savedCode = process.env.SPECRAILS_CODE_EXPLORER
  const savedBrowser = process.env.SPECRAILS_BROWSER_CAPTURE

  afterEach(() => {
    if (savedCode === undefined) delete process.env.SPECRAILS_CODE_EXPLORER
    else process.env.SPECRAILS_CODE_EXPLORER = savedCode
    if (savedBrowser === undefined) delete process.env.SPECRAILS_BROWSER_CAPTURE
    else process.env.SPECRAILS_BROWSER_CAPTURE = savedBrowser
  })

  it('isCodeExplorerEnabled defaults ON and opts out on "false"', () => {
    delete process.env.SPECRAILS_CODE_EXPLORER
    expect(isCodeExplorerEnabled()).toBe(true)
    process.env.SPECRAILS_CODE_EXPLORER = 'false'
    expect(isCodeExplorerEnabled()).toBe(false)
    process.env.SPECRAILS_CODE_EXPLORER = 'true'
    expect(isCodeExplorerEnabled()).toBe(true)
  })

  it('isBrowserCaptureEnabled defaults ON and opts out on "false"', () => {
    delete process.env.SPECRAILS_BROWSER_CAPTURE
    expect(isBrowserCaptureEnabled()).toBe(true)
    process.env.SPECRAILS_BROWSER_CAPTURE = 'false'
    expect(isBrowserCaptureEnabled()).toBe(false)
    process.env.SPECRAILS_BROWSER_CAPTURE = '1'
    expect(isBrowserCaptureEnabled()).toBe(true)
  })
})
