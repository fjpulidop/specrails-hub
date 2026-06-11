import { describe, it, expect } from 'vitest'
import { withdrawMdns } from './mobile-mdns'

// advertiseMdns opens a real multicast socket, so it is exercised only in the
// bundled-app smoke test (scripts), not here. withdrawMdns must be a safe no-op
// when nothing was advertised — that is the path the gateway hits on every
// stop()/disable when mDNS was off or failed.
describe('mobile-mdns', () => {
  it('withdrawMdns is a safe no-op when nothing is advertised', async () => {
    await expect(withdrawMdns()).resolves.toBeUndefined()
    // Idempotent.
    await expect(withdrawMdns()).resolves.toBeUndefined()
  })
})
