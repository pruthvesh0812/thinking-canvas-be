import { Hono } from 'hono'
import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { getAvailableAgents } from '../lib/tier.js'
import { getCanvas } from '../db/canvases.js'
import { getSession } from '../db/sessions.js'
import { getTierByUser } from '../db/subscriptions.js'
import { getNodesByIds } from '../db/nodes.js'
import { getInvokingEntryText } from '../db/context-notes.js'
import { createRun } from '../db/agent-runs.js'
import { handleAgentRun } from './agent-run-handler.js'

export const agentRunRoute = new Hono()

// POST /api/agent/run: the user addressed an agent in a node's text or a note.
// Answers 202 with { run_id } right away; the work happens in the run-agent pipeline and the
// result arrives as ghost-structure messages on the session's stream.
agentRunRoute.post('/agent/run', async (c) => {
  const body = await c.req.json().catch(() => null)

  try {
    const result = await handleAgentRun(body, {
      getCanvas,
      getSession,
      getTierByUser,
      getAvailableAgents,
      getNodesByIds,
      getInvokingEntryText,
      canAgentFire,
      createRun,
      sendRunRequested: async data => {
        await inngest.send({ name: 'agent/run.requested', data })
      },
    })

    logger.info('[route:agent-run] handled', { status: result.status, agent: (body as { agent?: string } | null)?.agent })
    return c.json(result.body, result.status)
  } catch (error) {
    logger.error('[route:agent-run] failed', { error: (error as Error).message })
    return c.json({ error: 'internal error' }, 500)
  }
})
