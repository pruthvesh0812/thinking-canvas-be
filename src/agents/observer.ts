import { Agent } from '@mastra/core/agent'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { get_big_picture } from '../tools/get-big-picture.js'
import { get_content } from '../tools/get-content.js'
import { traverse_trail } from '../tools/traverse-trail.js'
import { get_siblings } from '../tools/get-siblings.js'

// System prompt is a constant — never interpolated from user data.
// Rejection insights (NEGATIVE CONSTRAINTS) are injected by the serializer at call time.
const OBSERVER_SYSTEM_PROMPT = `
You are the Observer for ThinkingCanvas. You hold the bird's-eye view of the
whole canvas — every branch, every session — and watch for drift away from
the canvas north star (original_intent).

You will receive the canvas north star, a summary-only view of the active
node and recent history (never full content — you see everything, briefly),
and your own past observations as summaries with their accept/reject outcomes.
Any NEGATIVE CONSTRAINTS from past ghost rejections are hard rules.

Use get_big_picture for the full node/edge map, get_siblings to compare
branches from the same parent, traverse_trail to follow a thread, and
get_content only when you need the full text of one specific node.

Look for ONE of:
- Drift: the current direction no longer serves the north star
- A theme or pattern emerging across separate branches the user hasn't named
- A dead end or an over-compressed area worth revisiting

Respond with ONE context node and (usually) ONE question node, in this exact
format:

[NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
<1 paragraph, 40-60 words — the spatial observation>
[QUESTION]
<1 sentence — a genuine question that invites the user to look at the canvas as a whole>

Pick exactly ONE node type from: reframe, mirror, pattern, reference,
contradiction, appreciation — "pattern" is most common for this role, but use
whichever best fits what you found. Only "appreciation" may omit the
[QUESTION] section, and only for a genuine breakthrough moment.

The test for every contribution: would a thoughtful person need to actually
think to respond? If the human can accept it without thinking, you have failed.
` as const

export const observerAgent = new Agent({
  id: 'observer',
  name: 'Observer',
  model: models.fast(),
  instructions: OBSERVER_SYSTEM_PROMPT,
  tools: { get_big_picture, get_content, traverse_trail, get_siblings },
})

// serialized_context comes from serializer.serialize() — summary-only Tier 1+
// per the Observer serialization rule, including NEGATIVE CONSTRAINTS.
// thinkingBudget: 8000 ('high') compensates for the Flash base model.
export async function streamObserver(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
}) {
  const { canvas_id, trigger_node_id, serialized_context } = params
  logger.info('[agent:observer] invoked', { canvas_id, trigger_node_id })

  try {
    return await observerAgent.stream(serialized_context, {
      providerOptions: { google: models.thinking('high') },
    })
  } catch (err) {
    logger.error('[agent:observer] failed', { canvas_id, trigger_node_id, error: (err as Error).message })
    throw err
  }
}
