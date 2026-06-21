import { inngest } from '../lib/inngest.js'
import { logger } from '../lib/logger.js'
import { canAgentFire } from '../lib/guards.js'
import { getAvailableAgents } from '../lib/tier.js'
import { buildSpawnDescriptor, publishSpawn } from '../streaming/spawn.js'
import { streamAgentOutput } from '../streaming/tokens.js'
import { redis } from '../lib/redis.js'
import { runAttunement } from '../agents/attunement.js'
import { routeWithOrchestrator } from '../agents/orchestrator.js'
import { streamExpander } from '../agents/expander.js'
import { streamStressTester } from '../agents/stress-tester.js'
import { serialize } from '../serializer/index.js'
import { getRecentNodes } from '../db/nodes.js'
import { getCanvas } from '../db/canvases.js'
import { getSession } from '../db/sessions.js'
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
    logger.info('[pipeline:agent] start', { canvas_id, session_id, node_id })

    // ── Step 1: Attunement (gemini-2.5-flash, thinking OFF) ────────────────
    const attunement = await step.run('attunement', async () => {
      const recentNodes = await getRecentNodes(canvas_id, 5)
      return runAttunement({
        canvas_id,
        session_id,
        recent_nodes: formatRecentNodesForAttunement(recentNodes),
      })
    })

    // ── Step 2: canAgentFire() — drop silently if a ghost is still pending ──
    const canFire = await step.run('guard-check', async () =>
      canAgentFire(canvas_id, 'expander', node_id)
    )
    if (!canFire) {
      logger.info('[pipeline:agent] dropped — pending ghost', { canvas_id, node_id })
      return
    }

    // ── Step 3: Orchestrator → { route, question_style } ───────────────────
    const route = await step.run('orchestrator', async () => {
      const canvas = await getCanvas(canvas_id)
      const session = await getSession(session_id)
      const tier = await getTierByUser(canvas.user_id)
      const available = getAvailableAgents(tier)
      return routeWithOrchestrator({
        canvas_id,
        attunement: {
          cognitive_mode: attunement.cognitive_mode,
          question_style: attunement.question_style,
          phase_shift_suggested: attunement.phase_shift_suggested,
          confidence: attunement.confidence,
        },
        signals: {
          phase: session.current_phase,
          last_action: 'node_created',
        },
        available_agents: available,
      })
    })

    // The Articulator/Outer-Sub/Observer routes are handled by their own
    // pipelines or run only at session complete. If the Orchestrator lands on
    // one of those here, there is nothing to stream — drop silently.
    if (!isStreamable(route.route)) {
      logger.info('[pipeline:agent] non-streamable route — no ghost', {
        canvas_id,
        node_id,
        route: route.route,
      })
      return
    }
    const agentRole = route.route

    // ── Step 4: Build SpawnDescriptor + publish SPAWN to Redis ─────────────
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

    // ── Step 5: Sleep so the frontend can animate the ghost frames ─────────
    // step.sleep is the real Inngest API (the docs' `inngest.sleep` does not exist).
    await step.sleep('ghost-animation', '1500ms')

    // ── Step 6: Serialize thread (rejection_insights injected inside) ──────
    const context = await step.run('serialize', async () => {
      const thread = await getOrCreateThread(canvas_id, agentRole)
      const canvas = await getCanvas(canvas_id)
      return serialize(thread, agentRole, canvas)
    })

    // ── Step 7: Stream agent output → Redis CHUNK per token ────────────────
    const responseText = await step.run('stream-context', async () => {
      const stream =
        agentRole === 'expander'
          ? await streamExpander({ canvas_id, trigger_node_id: node_id, serialized_context: context })
          : await streamStressTester({ canvas_id, trigger_node_id: node_id, serialized_context: context })

      return streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, session_id)
    })

    // ── Step 8: Publish DONE + append thread turn + decrement deferrals ─────
    await step.run('finalize', async () => {
      await redis.publish(`canvas:stream:${session_id}`, JSON.stringify({ type: 'done' }))

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
        content: typeof responseText === 'string' ? responseText : '',
        ghost_pair,
        timestamp: new Date().toISOString(),
      })

      // Decrement every active temporal deferral by one turn — the RPC flips
      // active=false when turns_remaining hits 0.
      const active = await getActiveByCanvas(canvas_id)
      for (const insight of active) {
        if (insight.severity === 'temporal_deferral' && insight.turns_remaining !== null) {
          await decrementTurnsRemaining(insight.id)
        }
      }
    })

    logger.info('[pipeline:agent] done', { canvas_id, session_id, node_id, route: agentRole })
  }
)
