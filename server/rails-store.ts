import type { DbInstance } from './db'

export interface RailState {
  railIndex: number
  ticketIds: number[]
  mode: string
  /** Optional agent profile to use when launching this rail. null/undefined = default resolution. */
  profileName?: string | null
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getRails(db: DbInstance): RailState[] {
  const rows = db
    .prepare(
      'SELECT rail_index, ticket_id, position, mode, profile_name FROM rails ORDER BY rail_index, position'
    )
    .all() as {
      rail_index: number
      ticket_id: number
      position: number
      mode: string
      profile_name: string | null
    }[]

  const map = new Map<number, { ticketIds: number[]; mode: string; profileName: string | null }>()
  for (const row of rows) {
    if (!map.has(row.rail_index)) {
      map.set(row.rail_index, {
        ticketIds: [],
        mode: row.mode,
        profileName: row.profile_name,
      })
    }
    map.get(row.rail_index)!.ticketIds.push(row.ticket_id)
  }

  return [0, 1, 2].map((railIndex) => {
    const rail = map.get(railIndex)
    return {
      railIndex,
      ticketIds: rail?.ticketIds ?? [],
      mode: rail?.mode ?? 'implement',
      profileName: rail?.profileName ?? null,
    }
  })
}

export function getRail(db: DbInstance, railIndex: number): RailState {
  const rows = db
    .prepare(
      'SELECT ticket_id, position, mode, profile_name FROM rails WHERE rail_index = ? ORDER BY position'
    )
    .all(railIndex) as {
      ticket_id: number
      position: number
      mode: string
      profile_name: string | null
    }[]

  return {
    railIndex,
    ticketIds: rows.map((r) => r.ticket_id),
    mode: rows[0]?.mode ?? 'implement',
    profileName: rows[0]?.profile_name ?? null,
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function setRailTickets(
  db: DbInstance,
  railIndex: number,
  ticketIds: number[],
  mode?: string,
  profileName?: string | null,
): RailState {
  const deleteStmt = db.prepare('DELETE FROM rails WHERE rail_index = ?')
  const insertStmt = db.prepare(
    'INSERT INTO rails (rail_index, ticket_id, position, mode, profile_name) VALUES (?, ?, ?, ?, ?)'
  )
  const resolvedMode = mode ?? 'implement'
  const resolvedProfile = profileName === undefined ? null : profileName

  db.transaction(() => {
    deleteStmt.run(railIndex)
    for (let i = 0; i < ticketIds.length; i++) {
      insertStmt.run(railIndex, ticketIds[i], i, resolvedMode, resolvedProfile)
    }
  })()

  return { railIndex, ticketIds, mode: resolvedMode, profileName: resolvedProfile }
}

/**
 * Update only the profile for a rail, preserving tickets and mode.
 * No-op (returns current state) when the rail has no tickets yet — the
 * profile is stored as a column on each rail row.
 */
export function setRailProfile(
  db: DbInstance,
  railIndex: number,
  profileName: string | null,
): RailState {
  const current = getRail(db, railIndex)
  if (current.ticketIds.length === 0) {
    // No rows to update; insert a placeholder row? No — we store profile on
    // each ticket row. Users must assign tickets first. Caller checks.
    return { ...current, profileName }
  }
  db.prepare('UPDATE rails SET profile_name = ? WHERE rail_index = ?').run(profileName, railIndex)
  return { ...current, profileName }
}
