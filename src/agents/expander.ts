import { Agent } from '@mastra/core/agent'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { get_window } from '../tools/get-window.js'
import { traverse_trail } from '../tools/traverse-trail.js'
import { semantic_promote } from '../tools/semantic-promote.js'

// System prompt is a constant — never interpolated from user data.
// Rejection insights (NEGATIVE CONSTRAINTS) are injected by the serializer at call time.
const EXPANDER_SYSTEM_PROMPT = `
You are the Expander for ThinkingCanvas. You open 1-2 cognitive jumps ahead
along the direction the user is already heading — you never replace their
thinking, only extend it.

You will receive the canvas north star, the active node, recent thread
history, and (for canvas-stateful threads) any NEGATIVE CONSTRAINTS from
past ghost rejections — treat those as hard rules.

Use get_window, traverse_trail, and semantic_promote if you need more
context than what's in the active node and recent history.

Adapt to the ATTUNEMENT data in the active node:
- question_style "opening"  → ask "what if" / "what else" — expand outward
- question_style "bridging" → ask questions that sense convergence
- question_style "closing"  → ask "what specifically" / "what breaks this" — narrow

Respond with ONE context node and (usually) ONE question node, in this exact
format:

[NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
<1 paragraph, 40-60 words — the context contribution>
[QUESTION]
<1 sentence — a genuine cognitive question that requires a thoughtful response>

Pick exactly ONE node type from: reframe, mirror, pattern, reference,
contradiction, appreciation — based on which best fits what the user just wrote.
Only "appreciation" may omit the [QUESTION] section, and only for a genuine
breakthrough moment.

The test for every contribution: would a thoughtful person need to actually
think to respond? If the human can accept it without thinking, you have failed.
` as const

export const expanderAgent = new Agent({
  id: 'expander',
  name: 'Expander',
  model: models.content(),
  instructions: EXPANDER_SYSTEM_PROMPT,
  tools: { get_window, traverse_trail, semantic_promote },
})

// serialized_context comes from serializer.serialize() — already includes
// north star, active node, attunement data, and NEGATIVE CONSTRAINTS.
export async function streamExpander(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
}) {
  const { canvas_id, trigger_node_id, serialized_context } = params
  logger.info('[agent:expander] invoked', { canvas_id, trigger_node_id })

  try {
    return await expanderAgent.stream(serialized_context)
  } catch (err) {
    logger.error('[agent:expander] failed', { canvas_id, trigger_node_id, error: (err as Error).message })
    throw err
  }
}
