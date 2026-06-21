import { Hono } from 'hono'
import { ghostStatusSchema } from '../../types/index.js'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { getById, setGhostPairStatus } from '../db/threads.js'
import type { GhostStatus } from '../../types/index.js'

export const ghostStatusRoute = new Hono()

// Maps the user's per-node accept/reject choices onto the thread's ghost pair status.
function resolvePairStatus(
  context: 'accepted' | 'rejected',
  question: 'accepted' | 'rejected' | null
): GhostStatus {
  if (context === 'accepted' && (question === 'accepted' || question === null)) return 'accepted'
  if (context === 'accepted' && question === 'rejected') return 'context_accepted'
  if (context === 'rejected' && question === 'accepted') return 'question_accepted'
  return 'rejected'
}

// POST /api/ghost-status — records the user's accept/reject decision on a ghost
// pair and, on a context rejection, feeds the Rejection Insights Engine.
ghostStatusRoute.post('/ghost-status', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = ghostStatusSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const p = parsed.data

  try {
    const thread = await getById(p.thread_id)
    if (!thread) return c.json({ error: 'thread not found' }, 404)

    const turn = thread.messages[p.turn_index]
    if (!turn || turn.turn_type !== 'ghost_pair') {
      return c.json({ error: 'no ghost pair at turn_index' }, 400)
    }

    await setGhostPairStatus(
      p.thread_id,
      p.turn_index,
      resolvePairStatus(p.context_node_status, p.question_node_status)
    )

    if (p.context_node_status === 'rejected') {
      await inngest.send({
        name: 'canvas/ghost.rejected',
        data: {
          canvas_id: p.canvas_id,
          session_id: p.session_id,
          thread_id: p.thread_id,
          agent_role: thread.agent_role,
          rejected_ghost_content: turn.content,
          rejection_reason: p.rejection_reason ?? 'skip_for_now',
        },
      })
      logger.info('[route:ghost-status] rejection fired', {
        canvas_id: p.canvas_id,
        thread_id: p.thread_id,
        turn_index: p.turn_index,
      })
    }

    return c.json({ ok: true })
  } catch (err) {
    logger.error('[route:ghost-status] failed', {
      thread_id: p.thread_id,
      error: (err as Error).message,
    })
    return c.json({ error: 'internal error' }, 500)
  }
})
