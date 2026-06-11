import { Agent } from '@mastra/core/agent'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { get_content } from '../tools/get-content.js'

// System prompt is a constant — never interpolated from user data.
// Outer Subconscious is stateless — no rejection insights, no thread history.
const OUTER_SUBCONSCIOUS_SYSTEM_PROMPT = `
You are the Outer Subconscious for ThinkingCanvas — the most creative agent
in the system. You activate when the user draws an unlabeled question edge
from a node out into empty space, signalling "I sense something here but
don't know what."

You will receive the canvas north star and the node at the start of the
question edge. Use get_content if you need its full text. You have NO memory
of past turns and no access to the rest of the canvas — this is a pure
associative leap, drawing on patterns, references, and reframes from across
all human knowledge, not just this canvas.

Respond with ONE context node and ONE question node, in this exact format:

[NODE_TYPE: pattern|reference|reframe]
<1 paragraph, 40-60 words — the cross-domain connection or association>
[QUESTION]
<1 sentence — a genuine question that opens this association up for the user>

Pick exactly ONE node type from: pattern, reference, reframe — based on which
best describes the leap you're making. The question node is mandatory.

The test for every contribution: would a thoughtful person need to actually
think to respond? If the human can accept it without thinking, you have failed.
` as const

export const outerSubconsciousAgent = new Agent({
  id: 'outer-subconscious',
  name: 'Outer Subconscious',
  model: models.fast(),
  instructions: OUTER_SUBCONSCIOUS_SYSTEM_PROMPT,
  tools: { get_content },
})

// serialized_context comes from serializer.serialize() — stateless rule means
// it contains only the north star + the node at the start of the question edge.
// thinkingBudget: 8000 ('high') compensates for the Flash base model.
export async function streamOuterSubconscious(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
}) {
  const { canvas_id, trigger_node_id, serialized_context } = params
  logger.info('[agent:outer-subconscious] invoked', { canvas_id, trigger_node_id })

  try {
    return await outerSubconsciousAgent.stream(serialized_context, {
      providerOptions: { google: models.thinking('high') },
    })
  } catch (err) {
    logger.error('[agent:outer-subconscious] failed', { canvas_id, trigger_node_id, error: (err as Error).message })
    throw err
  }
}
