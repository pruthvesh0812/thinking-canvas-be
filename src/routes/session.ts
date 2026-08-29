import { Hono } from 'hono'
import type { SessionStartResponse } from '../../types/index.js'
import { sessionStartSchema, sessionCompleteSchema } from '../../types/index.js'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { createSession, getSessionsByCanvas } from '../db/sessions.js'
import { getAllByCanvas, appendMessage } from '../db/threads.js'

// Constant marker turn — never built from user input.
const SESSION_BOUNDARY_CONTENT =
  '--- New working session started. Context above is carried over from an earlier session. ---'

export const sessionRoute = new Hono()

// POST /api/session/start — opens a session. If the canvas already has prior
// sessions, drops a session_boundary turn into every agent thread so the agents
// can tell where the previous session ended.
sessionRoute.post('/session/start', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = sessionStartSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:session] start invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { canvas_id } = parsed.data

  try {
    const priorSessions = await getSessionsByCanvas(canvas_id)
    const session = await createSession(canvas_id)

    if (priorSessions.length > 0) {
      const threads = await getAllByCanvas(canvas_id)
      await Promise.all(
        threads.map((t) =>
          appendMessage(t.id, {
            role: 'user',
            turn_type: 'session_boundary',
            content: SESSION_BOUNDARY_CONTENT,
            timestamp: new Date().toISOString(),
          })
        )
      )
    }

    const session_number = priorSessions.length + 1

    logger.info('[route:session] started', {
      canvas_id,
      session_id: session.id,
      prior_sessions: priorSessions.length,
      session_number,
    })
    return c.json<SessionStartResponse>({ session_id: session.id, session_number })
  } catch (err) {
    logger.error('[route:session] start failed', { canvas_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})

// POST /api/session/complete — fires the Observer pass asynchronously. The
// session-complete pipeline closes the session row, so the route only enqueues.
sessionRoute.post('/session/complete', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = sessionCompleteSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn('[route:session] complete invalid payload', { issues: parsed.error.issues })
    return c.json({ error: 'invalid payload', issues: parsed.error.issues }, 400)
  }
  const { canvas_id, session_id } = parsed.data

  try {
    await inngest.send({
      name: 'canvas/session.completed',
      data: { canvas_id, session_id },
    })
    logger.info('[route:session] complete enqueued', { canvas_id, session_id })
    return c.json({ ok: true })
  } catch (err) {
    logger.error('[route:session] complete failed', { canvas_id, session_id, error: (err as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
