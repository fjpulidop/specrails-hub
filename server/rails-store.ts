import type { DbInstance } from './db'

export interface RailState {
  railIndex: number
  ticketIds: number[]
  mode: string
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getRails(db: DbInstance): RailState[] {
  const rows = db
    .prepare(
      'SELECT rail_index, ticket_id, position, mode FROM rails ORDER BY rail_index, position'
    )
    .all() as { rail_index: number; ticket_id: number; position: number; mode: string }[]

  const map = new Map<number, { ticketIds: number[]; mode: string }>()
  for (const row of rows) {
    if (!map.has(row.rail_index)) {
      map.set(row.rail_index, { ticketIds: [], mode: row.mode })
    }
    map.get(row.rail_index)!.ticketIds.push(row.ticket_id)
  }

  return [0, 1, 2].map((railIndex) => {
    const rail = map.get(railIndex)
    return {
      railIndex,
      ticketIds: rail?.ticketIds ?? [],
      mode: rail?.mode ?? 'implement',
    }
  })
}

export function getRail(db: DbInstance, railIndex: number): RailState {
  const rows = db
    .prepare(
      'SELECT ticket_id, position, mode FROM rails WHERE rail_index = ? ORDER BY position'
    )
    .all(railIndex) as { ticket_id: number; position: number; mode: string }[]

  return {
    railIndex,
    ticketIds: rows.map((r) => r.ticket_id),
    mode: rows[0]?.mode ?? 'implement',
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function setRailTickets(
  db: DbInstance,
  railIndex: number,
  ticketIds: number[],
  mode?: string
): RailState {
  const deleteStmt = db.prepare('DELETE FROM rails WHERE rail_index = ?')
  const insertStmt = db.prepare(
    'INSERT INTO rails (rail_index, ticket_id, position, mode) VALUES (?, ?, ?, ?)'
  )
  const resolvedMode = mode ?? 'implement'

  db.transaction(() => {
    deleteStmt.run(railIndex)
    for (let i = 0; i < ticketIds.length; i++) {
      insertStmt.run(railIndex, ticketIds[i], i, resolvedMode)
    }
  })()

  return { railIndex, ticketIds, mode: resolvedMode }
}
