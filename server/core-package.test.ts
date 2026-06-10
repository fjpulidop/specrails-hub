import { describe, it, expect } from 'vitest'
import { CORE_PACKAGE_SPEC } from './core-package'

describe('CORE_PACKAGE_SPEC (H5)', () => {
  it('pins specrails-core to a caret major range, never a floating tag', () => {
    // Guard against regressing to `specrails-core@latest`: a breaking core
    // major must never auto-land on users via npx.
    expect(CORE_PACKAGE_SPEC).toMatch(/^specrails-core@\^\d+\.\d+\.\d+$/)
  })
})
