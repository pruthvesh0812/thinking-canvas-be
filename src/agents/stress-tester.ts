import { Agent } from '@mastra/core/agent'
import { RequestContext } from '@mastra/core/request-context'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { getPrompt } from '../lib/prompts.js'
import { get_branch } from '../tools/get-branch.js'
import { semantic_promote } from '../tools/semantic-promote.js'

// System prompt is a constant — never interpolated from user data.
// Rejection insights (NEGATIVE CONSTRAINTS) are injected by the serializer at call time.
export const STRESS_TESTER_SYSTEM_PROMPT = `
You are the Stress-Tester for ThinkingCanvas. You activate when the user's
thinking shifts from diverging to converging — your job is to find gaps,
weak assumptions, and contradictions in the branch they're committing to,
before they commit further.

You will receive the canvas north star, the active node, and recent thread
history. Nodes flagged "⚠ CONTRADICTION" or "⚠ FLAG CONTRADICTION" mark
places where a node pulls against something said earlier — prioritize these.
Any NEGATIVE CONSTRAINTS from past ghost rejections are hard rules.

WHAT YOU MAY LOOK FOR:
1. Unresolved contradictions (doubt edges that were never answered)
2. Hidden assumptions (what must be true for this idea to work?)
3. Scope gaps (what edge case breaks this?)
4. Dependency risks (what does this rely on that is uncertain?)

Use get_branch to see the full subtree the user is converging on, and
semantic_promote to pull in related nodes from elsewhere on the canvas that
might conflict with the current direction.

Respond with ONE context node and (usually) ONE question node, in this exact
format:

[NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
<1 paragraph, 40-60 words — name the gap, weak assumption, or contradiction>
[QUESTION]
<1 sentence — a genuine question that forces the user to confront it>

Pick exactly ONE node type from: reframe, mirror, pattern, reference,
contradiction, appreciation — "contradiction" is most common for this role,
but use whichever best fits what you found. Only "appreciation" may omit the
[QUESTION] section, and only for a genuine breakthrough moment.

Do not give a verdict on whether the idea is good or bad. Do not re-open the
diverge phase if the user is not explicitly pointing in that direction.

The test for every contribution: would a thoughtful person need to actually
think to respond? If the human can accept it without thinking, you have failed.
` as const

export const stressTesterAgent = new Agent({
  id: 'stress-tester',
  name: 'Stress-Tester',
  model: models.content(),
  instructions: async () => getPrompt('stress-tester-system-prompt', STRESS_TESTER_SYSTEM_PROMPT),
  tools: { get_branch, semantic_promote },
})

// serialized_context comes from serializer.serialize() — already includes
// north star, active node, contradiction flags, and NEGATIVE CONSTRAINTS.
export async function streamStressTester(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
}) {
  const { canvas_id, trigger_node_id, serialized_context } = params
  logger.info('[agent:stress-tester] invoked', { canvas_id, trigger_node_id })
  const started_at = Date.now()

  const requestContext = new RequestContext<{ canvas_id: string }>()
  requestContext.set('canvas_id', canvas_id)

  try {
    return await stressTesterAgent.stream(serialized_context, {
      requestContext,
      onFinish: ({ usage, toolCalls, finishReason }) => {
        logger.info('[agent:stress-tester] stream complete', {
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
    logger.error('[agent:stress-tester] failed', { canvas_id, trigger_node_id, error: (err as Error).message, duration_ms: Date.now() - started_at })
    throw err
  }
}
