import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { get_big_picture } from '../tools/get-big-picture.js'
import { get_content } from '../tools/get-content.js'
import { traverse_trail } from '../tools/traverse-trail.js'
import { get_siblings } from '../tools/get-siblings.js'
import type { ObservationNode, ObserverObservation } from '../../types/index.js'

// System prompt is a constant — never interpolated from user data.
// Rejection insights (NEGATIVE CONSTRAINTS + OBSERVER CONNECTION FEEDBACK) are
// injected by the serializer at call time.
const OBSERVER_SYSTEM_PROMPT = `
You are the Observer for ThinkingCanvas. You hold the bird's-eye view of the
whole canvas — every branch, every session — and watch for drift away from
the canvas north star (original_intent).

You will receive the canvas north star, a summary-only view of the active
node and recent history (never full content — you see everything, briefly),
and your own past observations as summaries with their accept/reject outcomes.
Any NEGATIVE CONSTRAINTS from past ghost rejections are hard rules. Any
OBSERVER CONNECTION FEEDBACK tells you why a past edge between two specific
nodes was rejected — do not repeat that connection in the same way.

Use get_big_picture for the full node/edge map, get_siblings to compare
branches from the same parent, traverse_trail to follow a thread, and
get_content only when you need the full text of one specific node.

You do NOT write a ghost node directly into the conversation. You highlight
ONE OR MORE EXISTING nodes on the canvas (anchors) and propose a structure of
new observation nodes reachable from them. The user reveals this structure by
hovering an anchor, then accepts or rejects each edge individually — never
the structure as a whole.

Look for ONE of:
- Drift: the current direction no longer serves the north star
- A theme or pattern emerging across separate branches the user hasn't named
- A dead end or an over-compressed area worth revisiting

HOW TO SHAPE THE STRUCTURE
If the insight is a single cognitive jump from the anchors — no missing
context needed — express it in exactly ONE observation node at level 0.
If it takes more than one jump to get there, split it: level 0 carries the
bridge/context, and the next natural connection becomes level 1, and so on.
Every node must make sense and stand on its own as a single link, because
the user may accept the edge into it without having accepted the edge before
it — never write a node that only makes sense if an earlier node was already
accepted.

Levels are not strictly one-to-one: level 0 is always exactly one node, but
any level after that may hold 1 to n nodes, and a node at level k may connect
to one shared node at level k+1 or to several — fan-in and fan-out are both
allowed. Only build the levels you actually need; most observations need
just level 0.

Pick exactly ONE node_type per observation node from: reframe, mirror,
pattern, reference, contradiction, appreciation — whichever best fits what
that specific node says.

The test for every node: would a thoughtful person need to actually think to
respond to THIS specific edge? If the human can accept it without thinking,
you have failed.
` as const

const observerOutputSchema = z.object({
  anchor_node_ids: z.array(z.string().uuid()).min(1),
  nodes: z.array(z.object({
    label: z.string(),   // local identifier for this response only — never a real ID
    level: z.number().int().min(0),
    node_type: z.enum(['reframe', 'mirror', 'pattern', 'reference', 'contradiction', 'appreciation']),
    content: z.string(),
  })).min(1),
  edges: z.array(z.object({
    from: z.string(),    // an anchor_node_id, or another node's label
    to: z.string(),       // a node's label
  })).min(1),
})

type ObserverLLMOutput = z.infer<typeof observerOutputSchema>
type LLMObservationNode = ObserverLLMOutput['nodes'][number]
type LLMObservationEdge = ObserverLLMOutput['edges'][number]

export const observerAgent = new Agent({
  id: 'observer',
  name: 'Observer',
  model: models.fast(),
  instructions: OBSERVER_SYSTEM_PROMPT,
  tools: { get_big_picture, get_content, traverse_trail, get_siblings },
})

// serialized_context comes from serializer.serialize() — summary-only Tier 1+
// per the Observer serialization rule, including NEGATIVE CONSTRAINTS and
// OBSERVER CONNECTION FEEDBACK.
// thinkingBudget: 8000 ('high') compensates for the Flash base model.
//
// Returns the structure with labels remapped to backend-assigned ghost IDs —
// ghost IDs are never trusted from LLM output (see AGENT-PIPELINE.md → SpawnDescriptor).
export async function runObserver(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
}): Promise<ObserverObservation> {
  const { canvas_id, trigger_node_id, serialized_context } = params
  logger.info('[agent:observer] invoked', { canvas_id, trigger_node_id })

  try {
    const { object } = await observerAgent.generate(serialized_context, {
      structuredOutput: { schema: observerOutputSchema },
      providerOptions: { google: models.thinking('high') },
    })

    const labelToId = new Map(object.nodes.map((n: LLMObservationNode) => [n.label, crypto.randomUUID()]))

    const nodes: ObservationNode[] = object.nodes.map((n: LLMObservationNode) => ({
      ghost_id: labelToId.get(n.label)!,
      level: n.level,
      node_type: n.node_type,
      content: n.content,
    }))

    const edges = object.edges.map((e: LLMObservationEdge) => ({
      from_id: labelToId.get(e.from) ?? e.from,  // anchor node ids pass through unchanged
      to_id: labelToId.get(e.to)!,
    }))

    logger.info('[agent:observer] done', {
      canvas_id,
      trigger_node_id,
      node_count: nodes.length,
      edge_count: edges.length,
    })

    return { anchor_node_ids: object.anchor_node_ids, nodes, edges }
  } catch (err) {
    logger.error('[agent:observer] failed', { canvas_id, trigger_node_id, error: (err as Error).message })
    throw err
  }
}
