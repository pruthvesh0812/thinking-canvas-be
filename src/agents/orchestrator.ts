import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { getPrompt } from '../lib/prompts.js'
import type { AgentRole, AttunementState, EdgeType, SessionPhase } from '../../types/index.js'

// System prompt is a constant — never interpolated from user data.
export const ORCHESTRATOR_SYSTEM_PROMPT = `
You are the Orchestrator for ThinkingCanvas — you decide which AI agent
responds to the user's latest canvas activity.

You will be given:
- attunement: { cognitive_mode, question_style, phase_shift_suggested, confidence }
- signals: { edge_type?, both_existing?, phase, last_action }
- available_agents: the only agent_role values you may choose for "route"

Apply these routing rules IN PRIORITY ORDER — stop at the first match:

1. signals.both_existing is true AND signals.edge_type is not "question"
   → route: "articulator"
2. signals.edge_type is "question"
   → route: "outer_subconscious"
3. attunement.phase_shift_suggested is true AND signals.phase is "diverging"
   → route: "expander", question_style: "bridging"
4. signals.phase is "converging" AND signals.last_action is "node_created"
   → route: "stress_tester"
5. signals.phase is "diverging" AND signals.last_action is "node_created"
   → route: "expander"
6. otherwise (always true as a fallback)
   → route: "observer"

For "question_style", default to attunement.question_style unless rule 3
overrides it to "bridging".

You may ONLY choose a route from available_agents. If the rule above would
select an agent not in available_agents, fall back to the next rule that
matches an agent in available_agents (working down toward rule 6).

Output ONLY the structured fields requested. Never explain your reasoning.
` as const

const AGENT_ROLES = ['expander', 'stress_tester', 'observer', 'outer_subconscious', 'articulator'] as const

export const orchestratorOutputSchema = z.object({
  route: z.enum(AGENT_ROLES),
  question_style: z.enum(['opening', 'bridging', 'closing']),
})

export type OrchestratorOutput = z.infer<typeof orchestratorOutputSchema>

export type OrchestratorInput = {
  canvas_id: string
  attunement: Pick<AttunementState, 'cognitive_mode' | 'question_style' | 'phase_shift_suggested' | 'confidence'>
  signals: {
    edge_type?: EdgeType
    both_existing?: boolean
    phase: SessionPhase
    last_action: 'node_created' | 'edge_created'
  }
  available_agents: AgentRole[]
}

export const orchestratorAgent = new Agent({
  id: 'orchestrator',
  name: 'Orchestrator',
  model: models.fast(),
  instructions: async () => getPrompt('orchestrator-system-prompt', ORCHESTRATOR_SYSTEM_PROMPT),
})

// Tier enforcement is server-side: if the model picks a route outside
// available_agents, fall back to the first agent the tier permits.
export async function routeWithOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { canvas_id, available_agents } = input
  logger.info('[agent:orchestrator] invoked', { canvas_id, available_agents, phase: input.signals.phase })
  const started_at = Date.now()

  const prompt = JSON.stringify({
    attunement: input.attunement,
    signals: input.signals,
    available_agents,
  })

  try {
    const { object } = await orchestratorAgent.generate(prompt, {
      structuredOutput: { schema: orchestratorOutputSchema },
    })

    if (!available_agents.includes(object.route)) {
      const fallback = available_agents[0]
      logger.warn('[agent:orchestrator] route not in available_agents, falling back', {
        canvas_id,
        requested: object.route,
        available_agents,
        fallback,
      })
      return { ...object, route: fallback }
    }

    logger.info('[agent:orchestrator] done', {
      canvas_id,
      route: object.route,
      question_style: object.question_style,
      duration_ms: Date.now() - started_at,
    })
    return object
  } catch (err) {
    logger.error('[agent:orchestrator] failed', { canvas_id, error: (err as Error).message, duration_ms: Date.now() - started_at })
    throw err
  }
}
