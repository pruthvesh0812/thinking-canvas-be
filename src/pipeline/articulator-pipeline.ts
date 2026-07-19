import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput, publishDone } from '../streaming/tokens.js'
import { streamArticulator } from '../agents/articulator.js'
import { serialize } from '../serializer/index.js'
import { getCanvas } from '../db/canvases.js'
import { getOrCreateThread, appendMessage, getById } from '../db/threads.js'
import type { GhostPair } from '../../types/index.js'

// ─────────────────────────────────────────────────────────────────────────
// ARTICULATOR PIPELINE — immediate (no debounce), fires the instant the user
// draws an edge directly between two nodes that BOTH already exist on the
// canvas (both_existing=true) and the edge is NOT a question edge. This is
// the "connect two existing thoughts" gesture, so there is nothing to route:
// Attunement and the Orchestrator are skipped entirely and the Articulator
// runs straight away.
//
// Flow: guard → build+publish a context-only ghost (no question node) →
// short animation sleep → serialize the Articulator's thread → stream its
// reframing of the connection → publish DONE + persist the turn.
// ─────────────────────────────────────────────────────────────────────────
export const articulatorPipeline = inngest.createFunction(
  {
    id: 'articulator-pipeline',
    triggers: [{ event: 'canvas/edge.existing-nodes' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id, edge_id, from_node_id } = event.data
    const startedAt = Date.now()
    logger.info('[pipeline:articulator] start', { canvas_id, session_id, edge_id })

    // ── Step 1: canAgentFire() guard — still required even though routing ──
    // is skipped, so an edge drawn while an earlier ghost on this edge is
    // still pending review doesn't spawn a second one.
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'articulator', edge_id)
    )
    if (!canFire) {
      logger.info('[pipeline:articulator] dropped — pending ghost', { canvas_id, edge_id })
      return
    }

    // ── Step 2: Build a SpawnDescriptor and publish SPAWN to Redis so the ──
    // frontend can draw the placeholder ghost immediately. The Articulator
    // never produces a question node (has_question_node=false) — it only
    // ever reframes the connection itself.
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
    logger.info('[pipeline:articulator] step:spawn published', {
      canvas_id,
      session_id,
      context_ghost_id: descriptor.context_node.ghost_id,
    })

    // ── Step 3: Sleep so the frontend can animate the placeholder ghost ────
    // before real tokens start arriving.
    await step.sleep('ghost-animation', '1500ms')

    // ── Step 4: Serialize the Articulator's thread (canvas-stateful — full ──
    // recency-tiered thread + canvas), the same as the main pipeline.
    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, 'articulator')
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, 'articulator', canvas)
    })
    logger.info('[pipeline:articulator] step:serialize complete', {
      canvas_id,
      session_id,
      context_chars: context.length,
    })

    // ── Step 5: Run the Articulator and stream its reframing of the new ────
    // connection to Redis as CHUNK messages targeting the context ghost id.
    const responseText = await step.run('stream-context', async () => {
      const stream = await streamArticulator({
        canvas_id,
        trigger_node_id: from_node_id,
        serialized_context: context,
      })
      // Articulator never produces a question node — no [QUESTION] split.
      return streamAgentOutput(
        stream.textStream,
        { contextGhostId: descriptor.context_node.ghost_id, questionGhostId: null },
        session_id
      )
    })
    logger.info('[pipeline:articulator] step:stream complete', {
      canvas_id,
      session_id,
      response_chars: responseText.length,
    })

    // ── Step 6: Persist the response as a pending ghost pair on the thread ──
    // FIRST, then publish an attribution-carrying DONE (task-01). Persist
    // before publish: a failed append must abort before any `done` is sent.
    await step.run('finalize', async () => {
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
        content: responseText,
        ghost_pair,
        timestamp: new Date().toISOString(),
      })

      const persisted = await getById(thread.id)
      const turn_index = (persisted?.messages ?? []).findIndex(
        (m) =>
          m.turn_type === 'ghost_pair' &&
          m.ghost_pair.context_ghost_id === descriptor.context_node.ghost_id
      )

      await publishDone(session_id, {
        thread_id: thread.id,
        turn_index,
        trigger_node_id: from_node_id,
        context_ghost_id: descriptor.context_node.ghost_id,
        question_ghost_id: null,
      })
    })

    logger.info('[pipeline:articulator] done', {
      canvas_id,
      session_id,
      edge_id,
      duration_ms: Date.now() - startedAt,
    })
  }
)
