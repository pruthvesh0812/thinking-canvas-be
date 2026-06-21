import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { runObserver } from '../agents/observer.js'
import { serialize } from '../serializer/index.js'
import { getCanvas } from '../db/canvases.js'
import { getOrCreateThread } from '../db/threads.js'
import { getNodesBySession } from '../db/nodes.js'
import { createLearning } from '../db/session-learnings.js'
import { closeSession } from '../db/sessions.js'
import type { SessionLearning, ContextNodeType } from '../../types/index.js'

// Maps an Observer observation node_type onto the narrow session_learnings.type
// enum. Only 'contradiction' has a direct counterpart; every other observation
// is surfaced to the user as a reflective prompt ('question').
function learningType(nodeType: ContextNodeType): SessionLearning['type'] {
  return nodeType === 'contradiction' ? 'contradiction' : 'question'
}

// Immediate pipeline (no debounce) — fires when the user completes a session.
// Runs the Observer one last time over the whole canvas, queues its
// observations as session_learnings for the user's review, then closes the
// session. The Observer is structured output (.generate, not streamed) and is
// never a ghost pair, so nothing is published to Redis here.
export const sessionCompletePipeline = inngest.createFunction(
  {
    id: 'session-complete',
    triggers: [{ event: 'canvas/session.completed' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id } = event.data
    logger.info('[pipeline:session-complete] start', { canvas_id, session_id })

    // ── Step 1: Run the Observer pass (structured output, not streamed) ────
    const observation = await step.run('observer-pass', async () => {
      const sessionNodes = await getNodesBySession(canvas_id, session_id)
      // No single trigger at session complete — anchor the Observer's recency
      // signal on the last node created this session, if any.
      const triggerNodeId = sessionNodes.at(-1)?.id

      const thread = await getOrCreateThread(canvas_id, 'observer')
      const canvas = await getCanvas(canvas_id)
      const context = await serialize(thread, 'observer', canvas, { triggerNodeId })

      return runObserver({
        canvas_id,
        trigger_node_id: triggerNodeId ?? '',
        serialized_context: context,
      })
    })

    // ── Step 2: Queue observations as session_learnings for user review ────
    await step.run('save-observations', async () => {
      if (!observation) {
        logger.info('[pipeline:session-complete] observer discarded — no learnings', { canvas_id, session_id })
        return
      }
      for (const node of observation.nodes) {
        await createLearning({
          canvas_id,
          session_id,
          content: node.content,
          type: learningType(node.node_type),
        })
      }
    })

    // ── Step 3: Close the session ──────────────────────────────────────────
    await step.run('close-session', async () => {
      await closeSession(session_id)
    })

    logger.info('[pipeline:session-complete] done', { canvas_id, session_id })
  }
)
