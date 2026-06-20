import { Agent } from '@mastra/core/agent'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { traverse_trail } from '../tools/traverse-trail.js'
import { get_path } from '../tools/get-path.js'
import { get_content } from '../tools/get-content.js'

// System prompt is a constant — never interpolated from user data.
// Articulator is canvas-stateful — receives thread history, but no rejection insights.
const ARTICULATOR_SYSTEM_PROMPT = `
You are the Articulator for ThinkingCanvas. You activate when the user draws
an edge directly between two nodes that already exist on the canvas — they've
sensed a connection but haven't put it into words yet.

You will receive the canvas north star, the active node and its edge
connections, and recent thread history from this canvas. Use get_content to
read the full content of the node at the other end of the new edge, and
traverse_trail / get_path to understand how the two nodes relate to the rest
of the canvas.

Use the thread history for context on the conversation's trajectory, but stay
focused on articulating the new connection between the two endpoint nodes.

Respond with ONE context node containing 2-3 possible articulations of what
the connection means, in this exact format:

[NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
[ARTICULATION 1]
<1-2 sentences — one possible meaning of this connection>
[ARTICULATION 2]
<1-2 sentences — a different possible meaning>
[ARTICULATION 3]
<1-2 sentences — optional third reading; omit this section if only two fit>

Do NOT produce a question node. Pick exactly ONE node type from: reframe,
mirror, pattern, reference, contradiction, appreciation — based on which best
describes the relationship as a whole.

The test for every contribution: would a thoughtful person need to actually
think to respond? If the human can accept it without thinking, you have failed.
` as const

export const articulatorAgent = new Agent({
  id: 'articulator',
  name: 'Articulator',
  model: models.content(),
  instructions: ARTICULATOR_SYSTEM_PROMPT,
  tools: { traverse_trail, get_path, get_content },
})

// serialized_context comes from serializer.serialize() — canvas-stateful rule
// means it includes the north star, active node + edges, and recent thread history.
export async function streamArticulator(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
}) {
  const { canvas_id, trigger_node_id, serialized_context } = params
  logger.info('[agent:articulator] invoked', { canvas_id, trigger_node_id })
  const started_at = Date.now()

  try {
    return await articulatorAgent.stream(serialized_context, {
      onFinish: ({ usage, toolCalls, finishReason }) => {
        logger.info('[agent:articulator] stream complete', {
          canvas_id,
          trigger_node_id,
          tokens: usage.totalTokens,
          tool_calls: toolCalls.map(t => t.payload.toolName).join(',') || null,
          finish_reason: finishReason,
          duration_ms: Date.now() - started_at,
        })
      },
    })
  } catch (err) {
    logger.error('[agent:articulator] failed', { canvas_id, trigger_node_id, error: (err as Error).message, duration_ms: Date.now() - started_at })
    throw err
  }
}
