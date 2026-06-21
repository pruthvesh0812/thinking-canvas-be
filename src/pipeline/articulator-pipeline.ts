import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput } from '../streaming/tokens.js'
import { redis } from '../lib/redis.js'
import { streamArticulator } from '../agents/articulator.js'
import { serialize } from '../serializer/index.js'
import { getCanvas } from '../db/canvases.js'
import { getOrCreateThread, appendMessage } from '../db/threads.js'
import type { GhostPair } from '../../types/index.js'

// Immediate pipeline (no debounce) — fires when the user draws an edge between
// two nodes that BOTH already exist (both_existing=true, not a question edge).
// Skips Attunement + Orchestrator and goes straight to the Articulator.
export const articulatorPipeline = inngest.createFunction(
  {
    id: 'articulator-pipeline',
    triggers: [{ event: 'canvas/edge.existing-nodes' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id, edge_id, from_node_id } = event.data
    logger.info('[pipeline:articulator] start', { canvas_id, session_id, edge_id })

    // ── Step 1: canAgentFire() — still required even though routing is skipped ─
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'articulator', edge_id)
    )
    if (!canFire) {
      logger.info('[pipeline:articulator] dropped — pending ghost', { canvas_id, edge_id })
      return
    }

    // ── Step 2: Build SpawnDescriptor + publish SPAWN ──────────────────────
    // The Articulator never produces a question node (has_question_node=false).
    const descriptor = await step.run('publish-spawn', async () => {
      const d = buildSpawnDescriptor({
        trigger_node_id: from_node_id,
        session_id,
        agent_role: 'articulator',
        context_node_type: 'reframe',
        has_question_node: false,
      })
      await publishSpawn(session_id, d)
      return d
    })

    // ── Step 3: Sleep for ghost animation ──────────────────────────────────
    await step.sleep('ghost-animation', '1500ms')

    // ── Step 4: Serialize (canvas-stateful — thread + canvas) ──────────────
    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, 'articulator')
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, 'articulator', canvas)
    })

    // ── Step 5: Stream context node → Redis CHUNK per token ────────────────
    const responseText = await step.run('stream-context', async () => {
      const stream = await streamArticulator({
        canvas_id,
        trigger_node_id: from_node_id,
        serialized_context: context,
      })
      return streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, session_id)
    })

    // ── Step 6: Publish DONE + append thread turn ──────────────────────────
    await step.run('finalize', async () => {
      await redis.publish(`canvas:stream:${session_id}`, JSON.stringify({ type: 'done' }))

      const thread = await getOrCreateThread(canvas_id, 'articulator')
      const ghost_pair: GhostPair = {
        triggered_by_node_id: from_node_id,
        context_ghost_id: descriptor.context_node.ghost_id,
        question_ghost_id: null,
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

    logger.info('[pipeline:articulator] done', { canvas_id, session_id, edge_id })
  }
)
