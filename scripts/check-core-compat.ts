#!/usr/bin/env tsx
/**
 * scripts/check-core-compat.ts
 *
 * Validates that the integration contract from specrails-core matches the
 * hardcoded constants in specrails-hub (CHECKPOINTS + KNOWN_VERBS).
 *
 * Exit 0 — compatible, or contract not found (treated as a no-op)
 * Exit 1 — contract found but mismatch detected
 *
 * Usage:
 *   npx tsx scripts/check-core-compat.ts
 *   npm run check-core-compat
 */

import { checkCoreCompat } from '../server/core-compat'

async function main(): Promise<void> {
  const result = await checkCoreCompat()

  if (!result.contractFound) {
    console.log('[check-core-compat] specrails-core not installed — skipping compat check')
    process.exit(0)
  }

  console.log(
    `[check-core-compat] specrails-core@${result.coreVersion} vs specrails-hub@${result.hubVersion}`
  )

  let hasErrors = false

  if (result.missingCheckpoints.length > 0) {
    console.error(
      `  ✗ Checkpoints in Core but missing in Hub: ${result.missingCheckpoints.join(', ')}`
    )
    hasErrors = true
  }
  if (result.extraCheckpoints.length > 0) {
    console.error(
      `  ✗ Checkpoints in Hub but not in Core: ${result.extraCheckpoints.join(', ')}`
    )
    hasErrors = true
  }
  if (result.missingCommands.length > 0) {
    console.error(
      `  ✗ Commands in Core but missing in Hub (KNOWN_VERBS): ${result.missingCommands.join(', ')}`
    )
    hasErrors = true
  }
  if (result.extraCommands.length > 0) {
    console.error(
      `  ✗ Commands in Hub (KNOWN_VERBS) but not in Core: ${result.extraCommands.join(', ')}`
    )
    hasErrors = true
  }

  if (hasErrors) {
    console.error(
      '[check-core-compat] ✗ Contract mismatch — update hub constants to match specrails-core'
    )
    process.exit(1)
  }

  console.log('[check-core-compat] ✓ Compatible')
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('[check-core-compat] fatal error:', (err as Error).message ?? String(err))
  process.exit(1)
})
