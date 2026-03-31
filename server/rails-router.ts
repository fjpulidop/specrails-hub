import { Router, Request, Response } from 'express'
import type { ProjectContext } from './project-registry'
import { getRails, getRail, setRailTickets } from './rails-store'
import { ClaudeNotFoundError } from './queue-manager'
import type { RailJobStartedMessage, RailJobStoppedMessage } from './types'

// Extend Express Request to carry resolved ProjectContext (declared in project-router)
declare module 'express-serve-static-core' {
  interface Request {
    projectCtx?: ProjectContext
  }
}

const VALID_MODES = new Set(['implement', 'batch-implement'])
const VALID_RAIL_INDICES = new Set([0, 1, 2])

export function createRailsRouter(): Router {
  const router = Router({ mergeParams: true })

  function ctx(req: Request): ProjectContext {
    return req.projectCtx!
  }

  // GET /rails — list all rail assignments
  router.get('/', (_req: Request, res: Response) => {
    const c = ctx(_req)
    try {
      const rails = getRails(c.db)
      res.json({ rails })
    } catch (err) {
      console.error('[rails-router] get rails error:', err)
      res.status(500).json({ error: 'Failed to fetch rails' })
    }
  })

  // PUT /rails/:railIndex/tickets — set ticket assignments for a rail
  router.put('/:railIndex/tickets', (req: Request, res: Response) => {
    const railIndex = parseInt(req.params.railIndex as string, 10)
    if (!VALID_RAIL_INDICES.has(railIndex)) {
      res.status(400).json({ error: 'Rail index must be 0, 1, or 2' }); return
    }

    const { ticketIds } = req.body ?? {}
    if (!Array.isArray(ticketIds) || ticketIds.some((id: unknown) => typeof id !== 'number')) {
      res.status(400).json({ error: 'ticketIds must be an array of numbers' }); return
    }

    const c = ctx(req)
    try {
      const rail = setRailTickets(c.db, railIndex, ticketIds as number[])
      res.json({ rail })
    } catch (err) {
      console.error('[rails-router] set rail tickets error:', err)
      res.status(500).json({ error: 'Failed to update rail tickets' })
    }
  })

  // POST /rails/:railIndex/launch — launch job(s) for a rail
  router.post('/:railIndex/launch', (req: Request, res: Response) => {
    const railIndex = parseInt(req.params.railIndex as string, 10)
    if (!VALID_RAIL_INDICES.has(railIndex)) {
      res.status(400).json({ error: 'Rail index must be 0, 1, or 2' }); return
    }

    const { mode = 'implement' } = req.body ?? {}
    if (!VALID_MODES.has(mode as string)) {
      res.status(400).json({ error: 'mode must be "implement" or "batch-implement"' }); return
    }

    const c = ctx(req)
    const rail = getRail(c.db, railIndex)

    if (rail.ticketIds.length === 0) {
      res.status(400).json({ error: 'Rail has no tickets assigned' }); return
    }

    try {
      let jobId: string

      if (mode === 'batch-implement') {
        const issueArgs = rail.ticketIds.map((id) => `#${id}`).join(' ')
        const command = `/sr:batch-implement ${issueArgs}`
        const job = c.queueManager.enqueue(command, 'normal')
        jobId = job.id
        c.railJobs.set(jobId, { railIndex, mode })
      } else {
        // implement: queue one job per ticket (chained via dependsOnJobId)
        let prevJobId: string | undefined
        for (const ticketId of rail.ticketIds) {
          const command = `/sr:implement #${ticketId}`
          const job = c.queueManager.enqueue(command, 'normal', {
            dependsOnJobId: prevJobId,
          })
          c.railJobs.set(job.id, { railIndex, mode })
          prevJobId = job.id
        }
        jobId = prevJobId!
      }

      const startMsg: RailJobStartedMessage = {
        type: 'rail.job_started',
        projectId: c.project.id,
        railIndex,
        jobId,
        mode,
      }
      c.broadcast(startMsg)

      res.status(202).json({ jobId, railIndex, mode })
    } catch (err) {
      if (err instanceof ClaudeNotFoundError) {
        res.status(503).json({ error: 'Claude CLI not found' }); return
      }
      console.error('[rails-router] launch error:', err)
      res.status(500).json({ error: 'Failed to launch rail job' })
    }
  })

  // POST /rails/:railIndex/stop — kill the running job for a rail
  router.post('/:railIndex/stop', (req: Request, res: Response) => {
    const railIndex = parseInt(req.params.railIndex as string, 10)
    if (!VALID_RAIL_INDICES.has(railIndex)) {
      res.status(400).json({ error: 'Rail index must be 0, 1, or 2' }); return
    }

    const c = ctx(req)

    // Find the active rail job for this rail index
    let targetJobId: string | undefined
    for (const [jobId, meta] of c.railJobs.entries()) {
      if (meta.railIndex === railIndex) {
        targetJobId = jobId
        break
      }
    }

    if (!targetJobId) {
      res.status(404).json({ error: 'No active rail job found for this rail' }); return
    }

    try {
      c.queueManager.cancel(targetJobId)
      c.railJobs.delete(targetJobId)

      const stopMsg: RailJobStoppedMessage = {
        type: 'rail.job_stopped',
        projectId: c.project.id,
        railIndex,
        jobId: targetJobId,
      }
      c.broadcast(stopMsg)

      res.json({ ok: true, jobId: targetJobId })
    } catch (err) {
      console.error('[rails-router] stop error:', err)
      res.status(500).json({ error: 'Failed to stop rail job' })
    }
  })

  return router
}
