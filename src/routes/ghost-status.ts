import { Hono } from 'hono'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { getById, setGhostStructureDecision } from '../db/threads.js'
import { handleGhostStatus } from './ghost-status-handler.js'

export const ghostStatusRoute = new Hono()

// POST /api/ghost-status: records the user's accept/reject decision on ONE ghost node of a
// ghost structure. Rules and payload: FRONTEND-CONTRACT.md §12.3, logic in ghost-status-handler.ts.
ghostStatusRoute.post('/ghost-status', async (c) => {
  const body = await c.req.json().catch(() => null)

  try {
    const result = await handleGhostStatus(body, {
      getThread: getById,
      saveDecision: setGhostStructureDecision,
      sendRejected: async data => {
        await inngest.send({ name: 'canvas/ghost.rejected', data })
        logger.info('[route:ghost-status] rejection fired', { canvas_id: data.canvas_id, thread_id: data.thread_id })
      },
    })

    logger.info('[route:ghost-status] handled', { status: result.status })
    return c.json(result.body, result.status)
  } catch (error) {
    logger.error('[route:ghost-status] failed', { error: (error as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
