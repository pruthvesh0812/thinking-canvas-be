import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { getAvailableAgents } from '../lib/tier.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput, publishDone } from '../streaming/tokens.js'
import { runAttunement } from '../agents/attunement.js'
import { runJudge } from '../agents/orchestrator.js'
import { streamExpander } from '../agents/expander.js'
import { streamStressTester } from '../agents/stress-tester.js'
import { serialize, serializeJudgeContext } from '../serializer/index.js'
import { getRecentNodes } from '../db/nodes.js'
import { getCanvas } from '../db/canvases.js'
import { getSession, maybeAdvancePhase } from '../db/sessions.js'
import { getTierByUser } from '../db/subscriptions.js'
import { getOrCreateThread, appendMessage } from '../db/threads.js'
import { getActiveByCanvas, decrementTurnsRemaining } from '../db/rejection-insights.js'
import type { AgentRole, ContextNodeType, GhostPair } from '../../types/index.js'

// Agents the main debounced pipeline can route to. The Articulator and Outer
// Subconscious have their own immediate pipelines; the Observer is not a
// ghost-pair agent (it runs at session complete), so the streaming pipeline
// only ever streams these two.
type StreamableRole = Extract<AgentRole, 'expander' | 'stress_tester'>

// Default context node type per streaming agent — the SpawnDescriptor needs a
// type before the agent runs, since ghost IDs are pre-assigned. The agent's
// own [NODE_TYPE:...] output drives the final rendered type on the frontend.
const DEFAULT_CONTEXT_TYPE: Record<StreamableRole, ContextNodeType> = {
  expander: 'reframe',
  stress_tester: 'contradiction',
}

function isStreamable(role: AgentRole): role is StreamableRole {
  return role === 'expander' || role === 'stress_tester'
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN PIPELINE — debounced 10s per session_id, triggered by every node the
// user creates. A burst of rapid node creation collapses into a single run.
//
// Flow:
//   1. Attunement reads the last few nodes and infers the user's cognitive
//      mode/question style (a quick structured read, not a tool-using agent).
//   2. Guard (canAgentFire) — if a ghost pair from an earlier turn is still
//      pending the user's accept/reject, drop this run silently. Only one
//      ghost can be "in flight" per trigger node at a time.
//   3. The judge (the repurposed Orchestrator — DESIGN §4b) advances the
//      session phase (task-02 latch), then rules maturity + single-best route
//      in one call over the FULL canvas map. Not mature → silent no-pipeline.
//      Tier-locked best → hold for an upgrade offer, never substitute weaker.
//      (The decide→wait→generate handshake replaces steps 4+ in task-04.)
//   4. A SpawnDescriptor with pre-assigned ghost ids is built and published to
//      Redis so the frontend can render placeholder ghost frames immediately,
//      before any real content exists.
//   5. A short sleep gives the frontend time to finish that placeholder
//      animation before real tokens start arriving.
//   6. The chosen agent's thread is serialized into LLM context (rejection
//      insights are folded in as NEGATIVE CONSTRAINTS inside serialize()).
//   7. The agent streams its response; each token is forwarded to Redis so
//      the ghost fills in live on the user's canvas as it's generated.
//   8. On completion: publish DONE (closes the SSE stream's stream cue),
//      persist the full response + ghost pair onto the thread, and tick down
//      any active temporal-deferral rejection insights by one turn.
// ─────────────────────────────────────────────────────────────────────────

// Builds the recent-node text block the Attunement Layer reads (last 3-5 nodes,
// most recent last). Read directly from Supabase — Attunement uses no cursor tool.
function formatRecentNodesForAttunement(
  nodes: { summary: string | null; content: string | null; direction_marker: string | null }[]
): string {
  // getRecentNodes returns newest-first; flip to oldest-first ("most recent last").
  return [...nodes]
    .reverse()
    .map((n, i) => `${i + 1}. [${n.direction_marker ?? '?'}] ${n.summary ?? n.content ?? ''}`)
    .join('\n')
}

export const agentPipeline = inngest.createFunction(
  {
    id: 'agent-pipeline',
    debounce: { period: '10s', key: 'event.data.session_id' },
    triggers: [{ event: 'canvas/node.created' }],
  },
  async ({ event, step }) => {
    const { canvas_id, session_id, node_id } = event.data
    const startedAt = Date.now()
    logger.info('[pipeline:agent] start', { canvas_id, session_id, node_id })

    // ── Step 1: Attunement reads the last 5 nodes and classifies HOW the user ─
    // is thinking right now (cognitive_mode/question_style) — the Orchestrator
    // consumes this next. No LLM tool calls; a single structured read.
    const attunement = await step.run('attunement', async () => {
      const recentNodes = await getRecentNodes(canvas_id, 5)
      return runAttunement({
        canvas_id,
        session_id,
        recent_nodes: formatRecentNodesForAttunement(recentNodes),
      })
    })
    logger.info('[pipeline:agent] step:attunement complete', {
      canvas_id,
      session_id,
      cognitive_mode: attunement.cognitive_mode,
      question_style: attunement.question_style,
      phase_shift_suggested: attunement.phase_shift_suggested,
    })

    // ── Step 2: canAgentFire() guard — drop silently if a ghost pair from an ─
    // earlier turn on this trigger node is still pending the user's review.
    // Only one ghost may be "in flight" per trigger node at a time.
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'expander', node_id)
    )
    if (!canFire) {
      logger.info('[pipeline:agent] dropped — pending ghost', { canvas_id, node_id })
      return
    }

    // ── Step 3: The judge — maturity + single-best routing in one call over ─
    // the FULL canvas map (complete content). Phase advances first via the
    // task-02 latch: a confident Attunement shift is what unlocks converging —
    // and with it the Stress-Tester. Tier stays server-side (getAvailableAgents
    // feeds the judge's tier_locked flag, never a client claim).
    const decision = await step.run('judge', async () => {
      const canvas = await getCanvas(canvas_id)
      const session = await getSession(session_id)
      const tier = await getTierByUser(canvas.user_id)
      const available = getAvailableAgents(tier)
      const phase = await maybeAdvancePhase(session, {
        phase_shift_suggested: attunement.phase_shift_suggested,
        confidence: attunement.confidence,
      })
      const judgeContext = await serializeJudgeContext(canvas, node_id)
      return runJudge({
        canvas_id,
        session_id,
        trigger_node_id: node_id,
        phase,
        attunement: {
          cognitive_mode: attunement.cognitive_mode,
          question_style: attunement.question_style,
          phase_shift_suggested: attunement.phase_shift_suggested,
          confidence: attunement.confidence,
        },
        serialized_context: judgeContext,
        available_agents: available,
      })
    })
    logger.info('[pipeline:agent] step:judge ruled', {
      canvas_id,
      session_id,
      node_id,
      mature: decision.mature,
      route: decision.route,
      tier_locked: decision.tier_locked,
      confidence: decision.confidence,
    })

    // Not mature → silent "no pipeline". Nothing is shown, nothing is spent.
    if (!decision.mature || decision.route === null) {
      return
    }

    // Tier-locked best: never substitute a weaker agent (§4b). The upgrade
    // offer surfaces on the sidebar card at show time (task-07) — until that
    // surface exists, hold silently.
    if (decision.tier_locked) {
      logger.info('[pipeline:agent] tier-locked route — upgrade offer, no generation', {
        canvas_id,
        node_id,
        route: decision.route,
      })
      return
    }

    // The Articulator/Outer-Sub proactive paths land with the handshake
    // (task-04); their explicit-edge pipelines still run independently. Until
    // then this pipeline only streams the two ghost-pair agents.
    if (!isStreamable(decision.route)) {
      logger.info('[pipeline:agent] non-streamable route — no ghost', {
        canvas_id,
        node_id,
        route: decision.route,
      })
      return
    }
    const agentRole = decision.route

    // ── Step 4: Build a SpawnDescriptor (pre-assigned ghost ids for the ────
    // context node + question node) and publish a SPAWN message so the
    // frontend can draw placeholder ghost frames before any content exists.
    const descriptor = await step.run('publish-spawn', async () => {
      const d = buildSpawnDescriptor({
        trigger_node_id: node_id,
        session_id,
        agent_role: agentRole,
        context_node_type: DEFAULT_CONTEXT_TYPE[agentRole],
        has_question_node: true,
      })
      await publishSpawn(session_id, d)
      return d
    })
    logger.info('[pipeline:agent] step:spawn published', {
      canvas_id,
      session_id,
      agent_role: agentRole,
      context_ghost_id: descriptor.context_node.ghost_id,
      question_ghost_id: descriptor.question_node?.ghost_id ?? null,
    })

    // ── Step 5: Sleep so the frontend can animate the placeholder ghost ────
    // frames before real tokens start arriving.
    // step.sleep is the real Inngest API (the docs' `inngest.sleep` does not exist).
    await step.sleep('ghost-animation', '1500ms')

    // ── Step 6: Serialize the agent's thread into LLM context — rejection ──
    // insights are folded in as NEGATIVE CONSTRAINTS inside serialize() itself.
    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, agentRole)
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, agentRole, canvas)
    })
    logger.info('[pipeline:agent] step:serialize complete', {
      canvas_id,
      session_id,
      agent_role: agentRole,
      context_chars: context.length,
    })

    // ── Step 7: Run the chosen agent and stream its output to Redis as one ──
    // CHUNK message per token, targeting the pre-assigned context ghost id —
    // this is what makes the ghost "type out" live on the canvas.
    const responseText = await step.run('stream-context', async () => {
      const stream =
        agentRole === 'expander'
          ? await streamExpander({ canvas_id, trigger_node_id: node_id, serialized_context: context })
          : await streamStressTester({ canvas_id, trigger_node_id: node_id, serialized_context: context })

      return streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, session_id)
    })
    logger.info('[pipeline:agent] step:stream complete', {
      canvas_id,
      session_id,
      agent_role: agentRole,
      response_chars: responseText.length,
    })

    // ── Step 8: Publish DONE (tells the SSE route + frontend the ghost is ───
    // fully rendered), persist the response as a ghost_pair turn on the
    // thread (status starts 'pending' until the user accepts/rejects it),
    // and tick down every active temporal-deferral rejection insight by one
    // turn — those auto-expire after a few turns rather than blocking forever.
    await step.run('finalize', async () => {
      await publishDone(session_id)

      const thread = await getOrCreateThread(canvas_id, agentRole)
      const ghost_pair: GhostPair = {
        triggered_by_node_id: node_id,
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

      // Decrement every active temporal deferral by one turn — the RPC flips
      // active=false when turns_remaining hits 0.
      const active = await getActiveByCanvas(canvas_id)
      let decremented = 0
      for (const insight of active) {
        if (insight.severity === 'temporal_deferral' && insight.turns_remaining !== null) {
          await decrementTurnsRemaining(insight.id)
          decremented++
        }
      }
      if (decremented > 0) {
        logger.info('[pipeline:agent] step:finalize deferrals decremented', { canvas_id, decremented })
      }
    })

    logger.info('[pipeline:agent] done', {
      canvas_id,
      session_id,
      node_id,
      route: agentRole,
      duration_ms: Date.now() - startedAt,
    })
  }
)
