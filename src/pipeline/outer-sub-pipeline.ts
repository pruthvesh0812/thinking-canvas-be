import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput } from '../streaming/tokens.js'
import { redis } from '../lib/redis.js'
import { streamOuterSubconscious } from '../agents/outer-subconscious.js'
import { serialize } from '../serializer/index.js'
import { getCanvas } from '../db/canvases.js'
import { getOrCreateThread, appendMessage } from '../db/threads.js'
import type { GhostPair } from '../../types/index.js'

// Immediate pipeline (no debounce) — fires when the user draws a question edge
// from a node out into empty space (edge_type='question'). Skips Attunement +
// Orchestrator and goes straight to the Outer Subconscious, which ALWAYS
// produces a context node AND a question node.
export const outerSubPipeline = inngest.createFunction(
  {
    id: 'outer-sub-pipeline',
    triggers: [{ event: 'canvas/edge.question' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id, edge_id, from_node_id } = event.data
    logger.info('[pipeline:outer-sub] start', { canvas_id, session_id, edge_id })

    // ── Step 1: canAgentFire() — still required even though routing is skipped ─
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'outer_subconscious', edge_id)
    )
    if (!canFire) {
      logger.info('[pipeline:outer-sub] dropped — pending ghost', { canvas_id, edge_id })
      return
    }

    // ── Step 2: Build SpawnDescriptor + publish SPAWN ──────────────────────
    // Outer Subconscious always produces a question node (has_question_node=true).
    const descriptor = await step.run('publish-spawn', async () => {
      const d = buildSpawnDescriptor({
        trigger_node_id: from_node_id,
        session_id,
        agent_role: 'outer_subconscious',
        context_node_type: 'pattern',
        has_question_node: true,
      })
      await publishSpawn(session_id, d)
      return d
    })

    // ── Step 3: Sleep for ghost animation ──────────────────────────────────
    await step.sleep('ghost-animation', '1500ms')

    // ── Step 4: Serialize (stateless — north star + the trigger node only) ──
    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, 'outer_subconscious')
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, 'outer_subconscious', canvas)
    })

    // ── Step 5: Stream context + question node tokens → Redis CHUNK ─────────
    // The agent emits one stream containing both the context paragraph and the
    // [QUESTION] section; streamAgentOutput routes tokens to the context ghost.
    // The question ghost id travels in the descriptor so Feature 8's token layer
    // can split the [QUESTION] section onto the question ghost.
    const responseText = await step.run('stream-context-and-question', async () => {
      const stream = await streamOuterSubconscious({
        canvas_id,
        trigger_node_id: from_node_id,
        serialized_context: context,
      })
      return streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, session_id)
    })

    // ── Step 6: Publish DONE + append thread turn ──────────────────────────
    await step.run('finalize', async () => {
      await redis.publish(`canvas:stream:${session_id}`, JSON.stringify({ type: 'done' }))

      const thread = await getOrCreateThread(canvas_id, 'outer_subconscious')
      const ghost_pair: GhostPair = {
        triggered_by_node_id: from_node_id,
        context_ghost_id: descriptor.context_node.ghost_id,
        question_ghost_id: descriptor.question_node?.ghost_id ?? null,
        pair_status: 'pending',
      }
      await appendMessage(thread.id, {
        role: 'assistant',
        turn_type: 'ghost_pair',
        content: typeof responseText === 'string' ? responseText : '',
        ghost_pair,
        timestamp: new Date().toISOString(),
      })
    })

    logger.info('[pipeline:outer-sub] done', { canvas_id, session_id, edge_id })
  }
)
