import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { models } from '../lib/llm.js'
import { logger } from '../lib/logger.js'
import { getPrompt } from '../lib/prompts.js'
import { getNodesByIds } from '../db/nodes.js'
import { get_big_picture } from '../tools/get-big-picture.js'
import { get_content } from '../tools/get-content.js'
import { traverse_trail } from '../tools/traverse-trail.js'
import { get_siblings } from '../tools/get-siblings.js'
import type {
  ConnectionRejectionReason,
  ObservationNode,
  ObserverObservation,
} from '../../types/index.js'

// System prompt is a constant — never interpolated from user data.
// Rejection insights (NEGATIVE CONSTRAINTS + OBSERVER CONNECTION FEEDBACK) are
// injected by the serializer at call time.
export const OBSERVER_SYSTEM_PROMPT = `
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
hovering an anchor, then accepts or rejects each edge individually.

Look for ONE of:
- Drift: the current direction no longer serves the north star
- A theme or pattern emerging across separate branches the user hasn't named
- A dead end or an over-compressed area worth revisiting

HOW TO SHAPE THE STRUCTURE
If the insight is a single cognitive jump from the anchors — no missing
context needed — express it in exactly ONE observation node at level 0.
If it takes more than one jump to get there, split it: level 0 carries the
bridge/context, and the next natural connection becomes level 1, and so on.
A deeper node builds on the nodes that feed it — it is a true continuation of
them, not a restatement. The user accepts the references into a node one by
one, and the node only earns its place on the canvas once EVERY reference into
it is accepted — so each reference must genuinely belong.

STRUCTURE RULES (these are validated — violations are rejected):
- anchor_node_ids must be REAL existing node IDs taken from the context or
  tools — never invent an ID.
- Level 0 is always EXACTLY ONE node. Levels after that may hold 1 to n nodes.
- Every edge goes strictly one level deeper: an anchor connects only to the
  level-0 node; a level-k node connects only to a level-(k+1) node. Never
  connect backward, sideways within a level, or skip a level.
- Every observation node must have at least one incoming edge. Fan-in
  (several edges into one node) and fan-out (one node into several) are both
  allowed across adjacent levels.
- An observation node is the genuine synthesis of EVERY edge into it — each
  reference must actually contribute. Write it raw and real; never hedge it so
  it can survive a dropped reference, and never bundle in a reference that only
  half-belongs. If even one reference is improper, the whole observation is
  improper — so do not pad it to stay alive.

Pick exactly ONE node_type per observation node from: reframe, mirror,
pattern, reference, contradiction, appreciation — whichever best fits what
that specific node says.

RE-THINK MODE
If the context contains a PRIOR OBSERVATION (REJECTED) block, a previous
structure of yours was torn down because the user rejected ONE OR MORE edges,
each with a reason. Reconsider the whole observation in light of ALL of them
together:
- If the observation still holds once EVERY rejected reference is dropped,
  re-emit it: remove those references and rewrite each affected node so it is a
  genuine synthesis of only the references that remain. Set discard=false.
- If dropping the rejected references leaves the observation hollow or
  unsupported, set discard=true and return empty nodes and edges.
Never keep a rejected reference, and never water a node down just to keep it
alive — a real observation, or none.

When discard is false, the test for every node: would a thoughtful person need
to actually think to respond to THIS specific edge? If the human can accept it
without thinking, you have failed.
` as const

const observerOutputSchema = z.object({
  // RE-THINK MODE only: true means the observation no longer holds — nodes/edges ignored.
  discard: z.boolean(),
  anchor_node_ids: z.array(z.string().uuid()),
  nodes: z.array(z.object({
    label: z.string(),   // local identifier for this response only — never a real ID
    level: z.number().int().min(0),
    node_type: z.enum(['reframe', 'mirror', 'pattern', 'reference', 'contradiction', 'appreciation']),
    content: z.string(),
  })),
  edges: z.array(z.object({
    from: z.string(),    // an anchor_node_id, or another node's label
    to: z.string(),       // a node's label
  })),
})

type ObserverLLMOutput = z.infer<typeof observerOutputSchema>
type LLMObservationNode = ObserverLLMOutput['nodes'][number]
type LLMObservationEdge = ObserverLLMOutput['edges'][number]

// Re-think input — when a prior structure was torn down by edge rejections.
// The user may flag SEVERAL improper references before the structure tears
// down; the Observer reconsiders the whole observation against all of them at
// once. See AGENT-PIPELINE.md → Observer Structure (rejection re-think).
export type ObserverRethink = {
  previous: ObserverObservation
  rejected_edges: Array<{
    from_id: string
    to_id: string
    reason: ConnectionRejectionReason
  }>
}

export const observerAgent = new Agent({
  id: 'observer',
  name: 'Observer',
  model: models.fast(),
  instructions: async () => getPrompt('observer-system-prompt', OBSERVER_SYSTEM_PROMPT),
  tools: { get_big_picture, get_content, traverse_trail, get_siblings },
})

const CONNECTION_REASON_LABEL: Record<ConnectionRejectionReason, string> = {
  not_related: 'the two nodes are not actually related this way',
  wrong_direction: 'the connection is real but pointed the wrong way',
  too_indirect: 'the jump is real but needs an intermediate bridge node',
  already_obvious: 'the user already sees this — it was not a genuine insight',
}

// Renders the torn-down prior structure + the rejected edge into a text block the
// Observer reads in RE-THINK MODE. Content is from the agent's own prior output,
// never from raw user input, so it is safe to interpolate here.
function rethinkBlock(rethink: ObserverRethink): string {
  const byId = new Map(rethink.previous.nodes.map(n => [n.ghost_id, n]))
  const lines: string[] = ['PRIOR OBSERVATION (REJECTED) — re-think before responding:', '']

  for (const n of rethink.previous.nodes) {
    lines.push(`(level ${n.level}, ${n.node_type}) "${n.content}"`)
  }

  lines.push('')
  lines.push('REJECTED REFERENCES (drop ALL of these, then decide if anything real remains):')
  for (const r of rethink.rejected_edges) {
    const fromNode = byId.get(r.from_id)
    const to = byId.get(r.to_id)
    const fromDesc = fromNode ? `level-${fromNode.level} node "${fromNode.content}"` : 'an anchor node'
    const toDesc = to ? `level-${to.level} node "${to.content}"` : 'a node'
    lines.push(`- ${fromDesc} ──▶ ${toDesc}  (${CONNECTION_REASON_LABEL[r.reason]})`)
  }
  return lines.join('\n')
}

// Validates the LLM's claimed structure before any ghost IDs are minted.
// Guards (see AGENT-PIPELINE.md → Observer Structure validation):
//  - anchors must be real nodes ON THIS CANVAS (gap 5)
//  - every edge endpoint must resolve to a known anchor/node — no silent fallthrough (gap 5)
//  - edges go strictly level L → L+1, so the graph is acyclic by construction (gap 6)
//  - exactly one level-0 node; every node has >= 1 incoming edge (gap 6)
async function validateObservation(canvas_id: string, out: ObserverLLMOutput): Promise<void> {
  if (out.anchor_node_ids.length === 0) throw new Error('observer: no anchor nodes')
  if (out.nodes.length === 0) throw new Error('observer: no observation nodes')
  if (out.edges.length === 0) throw new Error('observer: no edges')

  // Gap 5 — anchors must be real nodes on this canvas (service-role client bypasses RLS).
  const anchorSet = new Set(out.anchor_node_ids)
  const anchorNodes = await getNodesByIds([...anchorSet])
  const anchorNodeById = new Map(anchorNodes.map(n => [n.id, n]))
  for (const id of anchorSet) {
    const node = anchorNodeById.get(id)
    if (!node) throw new Error(`observer: anchor ${id} does not exist`)
    if (node.canvas_id !== canvas_id) throw new Error(`observer: anchor ${id} is not on canvas ${canvas_id}`)
  }

  // Build label → level map and reject duplicate labels. A label colliding with
  // an anchor id would make labelToId.get(e.from) resolve an anchor edge to the
  // wrong node below, so anchor collisions are rejected here too.
  const labelToLevel = new Map<string, number>()
  for (const n of out.nodes) {
    if (anchorSet.has(n.label)) throw new Error(`observer: node label "${n.label}" collides with an anchor node id`)
    if (labelToLevel.has(n.label)) throw new Error(`observer: duplicate node label "${n.label}"`)
    labelToLevel.set(n.label, n.level)
  }

  // Gap 6 — exactly one level-0 node.
  const level0 = out.nodes.filter(n => n.level === 0)
  if (level0.length !== 1) throw new Error(`observer: expected exactly one level-0 node, got ${level0.length}`)

  // Gap 5 + 6 — every edge endpoint resolves, and levels increase by exactly one.
  const hasIncoming = new Set<string>()
  for (const e of out.edges) {
    const toLevel = labelToLevel.get(e.to)
    if (toLevel === undefined) throw new Error(`observer: edge target "${e.to}" is not a known node`)
    hasIncoming.add(e.to)

    if (anchorSet.has(e.from)) {
      // anchor (level -1) → must point at a level-0 node
      if (toLevel !== 0) throw new Error(`observer: anchor edge must target level 0, got level ${toLevel}`)
    } else {
      const fromLevel = labelToLevel.get(e.from)
      if (fromLevel === undefined) throw new Error(`observer: edge source "${e.from}" is neither an anchor nor a known node`)
      if (toLevel !== fromLevel + 1) {
        throw new Error(`observer: edge must go one level deeper (level ${fromLevel} → ${fromLevel + 1}), got → level ${toLevel}`)
      }
    }
  }

  // Gap 6 — no orphan nodes: every observation node has at least one incoming edge.
  for (const n of out.nodes) {
    if (!hasIncoming.has(n.label)) throw new Error(`observer: node "${n.label}" has no incoming edge`)
  }
}

// serialized_context comes from serializer.serialize() — the canvas-map context
// model (full canvas spatial map + current focus + past observations), including
// NEGATIVE CONSTRAINTS and OBSERVER CONNECTION FEEDBACK. See SERIALIZATION.md →
// Observer Context Model.
// thinkingBudget: 8000 ('high') compensates for the Flash base model.
//
// Returns the validated structure with labels remapped to backend-assigned ghost
// IDs (LLM-emitted IDs are never trusted — see AGENT-PIPELINE.md → SpawnDescriptor),
// or null when the agent discards the observation (RE-THINK MODE — see gap 7).
export async function runObserver(params: {
  canvas_id: string
  trigger_node_id: string
  serialized_context: string
  rethink?: ObserverRethink
}): Promise<ObserverObservation | null> {
  const { canvas_id, trigger_node_id, serialized_context, rethink } = params
  logger.info('[agent:observer] invoked', { canvas_id, trigger_node_id, rethink: Boolean(rethink) })
  const started_at = Date.now()

  const prompt = rethink
    ? `${serialized_context}\n\n${rethinkBlock(rethink)}`
    : serialized_context

  try {
    const { object } = await observerAgent.generate(prompt, {
      structuredOutput: { schema: observerOutputSchema },
      providerOptions: { google: models.thinking('high') },
    })

    if (rethink && object.discard) {
      logger.info('[agent:observer] discarded', { canvas_id, trigger_node_id, duration_ms: Date.now() - started_at })
      return null
    }

    await validateObservation(canvas_id, object)

    const labelToId = new Map(object.nodes.map((n: LLMObservationNode) => [n.label, crypto.randomUUID()]))

    const nodes: ObservationNode[] = object.nodes.map((n: LLMObservationNode) => ({
      ghost_id: labelToId.get(n.label)!,
      level: n.level,
      node_type: n.node_type,
      content: n.content,
    }))

    const edges = object.edges.map((e: LLMObservationEdge) => ({
      from_id: labelToId.get(e.from) ?? e.from,  // validated: anchor ids pass through unchanged
      to_id: labelToId.get(e.to)!,               // validated: always a known node label
    }))

    logger.info('[agent:observer] done', {
      canvas_id,
      trigger_node_id,
      node_count: nodes.length,
      edge_count: edges.length,
      duration_ms: Date.now() - started_at,
    })

    return { anchor_node_ids: object.anchor_node_ids, nodes, edges }
  } catch (err) {
    logger.error('[agent:observer] failed', { canvas_id, trigger_node_id, error: (err as Error).message, duration_ms: Date.now() - started_at })
    throw err
  }
}
