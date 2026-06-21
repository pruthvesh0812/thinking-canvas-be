import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput, publishDone } from '../streaming/tokens.js'
import { streamOuterSubconscious } from '../agents/outer-subconscious.js'
import { serialize } from '../serializer/index.js'
import { getCanvas } from '../db/canvases.js'
import { getOrCreateThread, appendMessage } from '../db/threads.js'
import type { GhostPair } from '../../types/index.js'

// ─────────────────────────────────────────────────────────────────────────
// OUTER SUBCONSCIOUS PIPELINE — immediate (no debounce), fires the instant
// the user draws a question edge out of a node into empty space
// (edge_type='question'). This is the "I wonder about this" gesture, so
// Attunement and the Orchestrator are skipped and the Outer Subconscious
// runs directly. Unlike every other agent, it is stateless (it only ever
// sees the canvas north star + the single trigger node — no thread history)
// and it ALWAYS produces both a context node and a question node.
//
// Flow: guard → build+publish a ghost pair (context + question) → short
// animation sleep → serialize a stateless context → stream a single
// response containing both the context paragraph and the question →
// publish DONE + persist the turn.
// ─────────────────────────────────────────────────────────────────────────
export const outerSubPipeline = inngest.createFunction(
  {
    id: 'outer-sub-pipeline',
    triggers: [{ event: 'canvas/edge.question' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id, edge_id, from_node_id } = event.data
    const startedAt = Date.now()
    logger.info('[pipeline:outer-sub] start', { canvas_id, session_id, edge_id })

    // ── Step 1: canAgentFire() guard — still required even though routing ──
    // is skipped, so a second question edge from the same node can't spawn a
    // new ghost pair while an earlier one is still pending review.
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'outer_subconscious', edge_id)
    )
    if (!canFire) {
      logger.info('[pipeline:outer-sub] dropped — pending ghost', { canvas_id, edge_id })
      return
    }

    // ── Step 2: Build a SpawnDescriptor and publish SPAWN. Outer Subconscious ─
    // always produces a question node (has_question_node=true), so both ghost
    // ids exist before the agent has generated a single token.
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
    logger.info('[pipeline:outer-sub] step:spawn published', {
      canvas_id,
      session_id,
      context_ghost_id: descriptor.context_node.ghost_id,
      question_ghost_id: descriptor.question_node?.ghost_id ?? null,
    })

    // ── Step 3: Sleep so the frontend can animate the placeholder ghost ────
    // pair before real tokens start arriving.
    await step.sleep('ghost-animation', '1500ms')

    // ── Step 4: Serialize a STATELESS context — just the canvas north star ──
    // plus the single trigger node, no thread history at all (see
    // serializeStateless in the serializer — this agent gets no recency tiers).
    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, 'outer_subconscious')
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, 'outer_subconscious', canvas)
    })
    logger.info('[pipeline:outer-sub] step:serialize complete', {
      canvas_id,
      session_id,
      context_chars: context.length,
    })

    // ── Step 5: Run the agent and stream its output to Redis. It emits ONE ──
    // stream containing both the context paragraph and a trailing [QUESTION]
    // section; streamAgentOutput here only tags tokens with the context ghost
    // id, while the question ghost id travels in the descriptor for the token
    // layer to split the [QUESTION] section onto.
    const responseText = await step.run('stream-context-and-question', async () => {
      const stream = await streamOuterSubconscious({
        canvas_id,
        trigger_node_id: from_node_id,
        serialized_context: context,
      })
      return streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, session_id)
    })
    logger.info('[pipeline:outer-sub] step:stream complete', {
      canvas_id,
      session_id,
      response_chars: responseText.length,
    })

    // ── Step 6: Publish DONE and persist the combined context+question ─────
    // response as a single pending ghost pair turn on the thread.
    await step.run('finalize', async () => {
      await publishDone(session_id)

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
        content: responseText,
        ghost_pair,
        timestamp: new Date().toISOString(),
      })
    })

    logger.info('[pipeline:outer-sub] done', {
      canvas_id,
      session_id,
      edge_id,
      duration_ms: Date.now() - startedAt,
    })
  }
)
