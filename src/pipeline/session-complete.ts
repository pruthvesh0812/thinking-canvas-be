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

// ─────────────────────────────────────────────────────────────────────────
// SESSION COMPLETE PIPELINE — immediate (no debounce), fires when the user
// explicitly ends a working session (POST /api/session/complete). This is
// the Observer's only invocation point — it never produces a ghost pair, so
// nothing is published to Redis here; it runs once, synchronously persists
// its findings, then the session row is closed.
//
// Flow:
//   1. Run the Observer (.generate, structured output, not streamed) over
//      the WHOLE canvas — its serialize() call uses the canvas-map path, so
//      it sees every node from every session, not just this one.
//   2. Each observation node the Observer surfaces becomes a row in
//      session_learnings, queued for the user to review next time they open
//      the canvas (a contradiction observation maps to type 'contradiction',
//      everything else becomes a reflective 'question').
//   3. Close the session row — current_phase freezes, the session can no
//      longer accept new nodes.
// ─────────────────────────────────────────────────────────────────────────
export const sessionCompletePipeline = inngest.createFunction(
  {
    id: 'session-complete',
    triggers: [{ event: 'canvas/session.completed' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id } = event.data
    const startedAt = Date.now()
    logger.info('[pipeline:session-complete] start', { canvas_id, session_id })

    // ── Step 1: Run the Observer pass (structured output, not streamed) — ──
    // it reads the full canvas map plus this session's nodes for recency,
    // and returns null when it has nothing worth surfacing.
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
    logger.info('[pipeline:session-complete] step:observer-pass complete', {
      canvas_id,
      session_id,
      observation_node_count: observation?.nodes.length ?? 0,
    })

    // ── Step 2: Queue each observation as a session_learnings row — these ──
    // surface to the user on next open, they are never auto-applied to the canvas.
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

    // ── Step 3: Close the session — freezes current_phase, no further ──────
    // nodes can be attributed to this session_id after this point.
    await step.run('close-session', async () => {
      await closeSession(session_id)
    })

    logger.info('[pipeline:session-complete] done', {
      canvas_id,
      session_id,
      duration_ms: Date.now() - startedAt,
    })
  }
)
