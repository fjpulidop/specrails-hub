import type { ProjectContext } from './project-registry'
import type { LocalTicket, TicketCreatedMessage, TicketUpdatedMessage, TicketDeletedMessage } from './types'

/**
 * Broadcast a ticket_created event and suppress the file-watcher echo.
 * Call this from POST /:projectId/tickets after writing the JSON file.
 */
export function broadcastTicketCreated(
  ctx: ProjectContext,
  ticket: LocalTicket,
  newRevision: number,
): void {
  ctx.ticketWatcher.notifyHubWrite(newRevision)
  const msg: TicketCreatedMessage = {
    type: 'ticket_created',
    projectId: ctx.project.id,
    ticket,
    timestamp: new Date().toISOString(),
  }
  ctx.broadcast(msg)
}

/**
 * Broadcast a ticket_updated event and suppress the file-watcher echo.
 * Call this from PATCH /:projectId/tickets/:id after writing the JSON file.
 */
export function broadcastTicketUpdated(
  ctx: ProjectContext,
  ticket: LocalTicket,
  newRevision: number,
): void {
  ctx.ticketWatcher.notifyHubWrite(newRevision)
  const msg: TicketUpdatedMessage = {
    type: 'ticket_updated',
    projectId: ctx.project.id,
    ticket,
    timestamp: new Date().toISOString(),
  }
  ctx.broadcast(msg)
}

/**
 * Broadcast a ticket_deleted event and suppress the file-watcher echo.
 * Call this from DELETE /:projectId/tickets/:id after writing the JSON file.
 */
export function broadcastTicketDeleted(
  ctx: ProjectContext,
  ticketId: number,
  newRevision: number,
): void {
  ctx.ticketWatcher.notifyHubWrite(newRevision)
  const msg: TicketDeletedMessage = {
    type: 'ticket_deleted',
    projectId: ctx.project.id,
    ticketId,
    timestamp: new Date().toISOString(),
  }
  ctx.broadcast(msg)
}
