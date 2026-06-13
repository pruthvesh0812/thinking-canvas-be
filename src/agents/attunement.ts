import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'

// System prompt is a constant — never interpolated from user data.
const ATTUNEMENT_SYSTEM_PROMPT = `
You are the Attunement Layer for ThinkingCanvas — a silent classifier that
runs before every agent pipeline call. You read the QUALITY of thinking from
the user's recent nodes, not just their content.

Infer not just what they said, but HOW they are thinking. Determine where
they are in their cognitive arc.

You will be given the last 3-5 nodes the user created in this session, most
recent last.

Classify the cognitive mode:
- "exploratory" — lots of "what if", "maybe", "what about", branching ideas
- "transitional" — sensing convergence, bridging language between ideas
- "declarative" — "therefore", "specifically", naming things precisely

Pick a question_style that fits where the user is heading next:
- "opening" — for exploratory mode: expanding outward ("what if", "what else")
- "bridging" — for transitional mode: sensing convergence
- "closing" — for declarative mode: narrowing ("what specifically", "what breaks this")

DIRECTIONAL COHERENCE
Are the last 3-5 nodes pointing in the same direction?
- High coherence = convergence approaching
- Low coherence = still in open exploration

Set phase_shift_suggested to true only when the recent nodes show a clear
shift from diverging (exploring many directions) to converging (narrowing
toward a decision), or vice versa.

Set confidence between 0 and 1 reflecting how clear the signal is from the
given nodes. Few nodes or mixed signals → lower confidence.

Output ONLY the structured fields requested. Never explain your reasoning.
` as const

export const attunementOutputSchema = z.object({
  cognitive_mode: z.enum(['exploratory', 'transitional', 'declarative']),
  question_style: z.enum(['opening', 'bridging', 'closing']),
  phase_shift_suggested: z.boolean(),
  confidence: z.number().min(0).max(1),
})

export type AttunementOutput = z.infer<typeof attunementOutputSchema>

export const attunementAgent = new Agent({
  id: 'attunement',
  name: 'Attunement',
  model: models.fast(),
  instructions: ATTUNEMENT_SYSTEM_PROMPT,
})

// recent_nodes: pre-formatted text of the last 3-5 nodes from this session,
// read directly from Supabase by the caller (not via a cursor tool).
export async function runAttunement(params: {
  canvas_id: string
  session_id: string
  recent_nodes: string
}): Promise<AttunementOutput> {
  const { canvas_id, session_id, recent_nodes } = params
  logger.info('[agent:attunement] invoked', { canvas_id, session_id })

  try {
    const { object } = await attunementAgent.generate(recent_nodes, {
      structuredOutput: { schema: attunementOutputSchema },
    })

    logger.info('[agent:attunement] done', {
      canvas_id,
      session_id,
      cognitive_mode: object.cognitive_mode,
      question_style: object.question_style,
      phase_shift_suggested: object.phase_shift_suggested,
    })

    return object
  } catch (err) {
    logger.error('[agent:attunement] failed', { canvas_id, session_id, error: (err as Error).message })
    throw err
  }
}
