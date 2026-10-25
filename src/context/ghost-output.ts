// Turns what the model says into ghost chunks the frontend can draw.
//
// Flow, in short:
//   1. model streams "elements" one by one (a frame, or a node that carries its own links)
//   2. NodeEmitter says "this element is finished" as soon as the next one starts
//   3. GhostChunkBuilder checks the finished element, swaps model ids for real ids,
//      and returns one chunk: the node + its edges (+ its frame, the first time it is used)
//
// Why links live INSIDE each node (and not in one big edges list at the end):
// if edges came last, nothing could be drawn until the whole answer was done.
// With links inside the node, every node arrives already connected, so the user
// sees the structure grow piece by piece.
//
// The shapes this can express (all from the product sketch):
//   single      anchor ──▶ t1
//   multi       a frame holding t1 + t2, anchor ──▶ t1 and anchor ──▶ t2
//   hierarchy   anchor ──▶ t1 ──▶ t2 ──▶ ...  (t2 links FROM t1)
//   converge    t1 ──▶ t3 and t2 ──▶ t3        (t3 has two FROM links)
// No special "shape" field is needed: it is all just links + frames.
//
// Why a frame CONTAINS its nodes (nested) and not "node says which frame it is in":
// the group is then the structure itself. The model can't forget a frame_id, mistype it,
// or write an empty frame. And the frontend gets a frame whole, so it can lay it out
// once at its final size.

import { z } from 'zod'
import type { GhostEdge, GhostFrame, GhostNode, GhostStructure } from '../../types/index.js'
import type { IdMap } from './ids.js'

// ─────────────────────────────────────────────
// The shape we ask the model for
// ─────────────────────────────────────────────

// One connection from a new node to something else.
export const modelLinkSchema = z.object({
  // The other end: an existing node (n5) or a new node written EARLIER in this answer (t1).
  target: z.string(),
  // FROM = target ──▶ this node.   TO = this node ──▶ target.
  direction: z.enum(['FROM', 'TO']),
  // Optional words on the edge, like the label the user can type on an edge.
  label: z.string().max(80).optional(),
})

export const modelNodeSchema = z.object({
  kind: z.literal('node'),
  temp_id: z.string().regex(/^t\d+$/), // t1, t2... the model's own name for a NEW node
  content: z.string().min(1),
  // How it connects to the rest. Every node needs at least one valid link.
  links: z.array(modelLinkSchema),
})

// A box around 2 or more nodes. Its text says how they relate, or gives context about them.
// It has no links of its own: the edges belong to the nodes inside.
// One level only: a frame holds nodes, never other frames.
export const modelFrameSchema = z.object({
  kind: z.literal('frame'),
  content: z.string().min(1),
  nodes: z.array(modelNodeSchema).min(2),
})

export const modelElementSchema = z.discriminatedUnion('kind', [modelNodeSchema, modelFrameSchema])

// The whole answer. Order matters: it is the order things appear on screen.
export const modelOutputSchema = z.object({
  elements: z.array(modelElementSchema),
})

export type ModelNode = z.infer<typeof modelNodeSchema>
export type ModelElement = z.infer<typeof modelElementSchema>

// ─────────────────────────────────────────────
// Step 1: know when a streamed element is finished
// ─────────────────────────────────────────────

// While streaming we get the elements array growing: [a], [a, b], [a, b, c]...
// The LAST item may still be half-written. Everything before it is final.
// When the stream ends, the last one is final too.
export function createNodeEmitter() {
  let alreadyEmitted = 0

  function takeNewlyFinished(upTo: number, items: unknown[]): unknown[] {
    const fresh = items.slice(alreadyEmitted, upTo)
    alreadyEmitted = Math.max(alreadyEmitted, upTo)
    return fresh
  }

  return {
    // Call with every partial update. Returns items that just became final.
    feed(partialItems: unknown[]): unknown[] {
      // keep the last one back, it might still be growing
      return takeNewlyFinished(partialItems.length - 1, partialItems)
    },
    // Call once when the stream is over, with the complete list.
    finish(finalItems: unknown[]): unknown[] {
      return takeNewlyFinished(finalItems.length, finalItems)
    },
  }
}

// ─────────────────────────────────────────────
// Step 2: check a finished element and build the chunk
// ─────────────────────────────────────────────

// One piece to publish: a lone node, or a whole frame with its nodes.
export type GhostChunk = GhostStructure

export type AddElementResult = {
  // null = nothing to send (the element was dropped)
  chunk: GhostChunk | null
  // human-readable reasons something was dropped (for logs + retry hint)
  problems: string[]
}

export type GhostChunkBuilder = {
  addElement(rawElement: unknown): AddElementResult
  // everything accepted so far, in order. Saved on the thread when the run ends.
  accepted(): GhostStructure
}

export function createGhostChunkBuilder(idMap: IdMap): GhostChunkBuilder {
  // t1 -> the ghost id we minted for it. Only nodes we ACCEPTED are in here.
  const ghostIdByTempId = new Map<string, string>()
  // ghost id -> how many steps from the existing canvas (see GhostNode.depth)
  const depthByGhostId = new Map<string, number>()
  // "from|to" keys we already sent, to catch duplicate edges
  const seenEdges = new Set<string>()
  const all: GhostStructure = { frames: [], nodes: [], edges: [] }

  // Turn a model id (n5 or t1) into a real id the frontend knows.
  // Returns null if the id is unknown (never guess, just drop).
  function resolveId(modelId: string): string | null {
    return idMap.uuidFor(modelId) ?? ghostIdByTempId.get(modelId) ?? null
  }

  // Check ONE node and build its edges. Returns null if the node can't stay.
  // Does not touch `all`, the caller decides (a frame may still be dissolved).
  function checkNode(
    node: ModelNode,
    frameGhostId: string | null,
    problems: string[],
  ): { node: GhostNode; edges: GhostEdge[] } | null {
    // 1. temp id must be new (two nodes can't both be t1)
    if (ghostIdByTempId.has(node.temp_id)) {
      problems.push(`${node.temp_id} used twice`)
      return null
    }

    // 2. we mint the ghost id now, so later nodes can link to it
    const ghostId = crypto.randomUUID()
    const edges: GhostEdge[] = []
    // depth of every good link target (existing canvas nodes count as 0)
    const targetDepths: number[] = []

    // 3. go through each link, keep only the good ones
    for (const link of node.links) {
      if (link.target === node.temp_id) {
        problems.push(`${node.temp_id} links to itself`)
        continue
      }

      const otherId = resolveId(link.target)
      if (!otherId) {
        problems.push(`${node.temp_id} links to unknown id ${link.target}`)
        continue
      }

      // FROM means the other node points AT this one
      const from = link.direction === 'FROM' ? otherId : ghostId
      const to = link.direction === 'FROM' ? ghostId : otherId

      const edgeKey = `${from}|${to}`
      if (seenEdges.has(edgeKey)) {
        problems.push(`${node.temp_id} has a duplicate edge to ${link.target}`)
        continue
      }

      seenEdges.add(edgeKey)
      targetDepths.push(depthByGhostId.get(otherId) ?? 0)
      edges.push({ from, to, label: link.label?.trim() || null })
    }

    // 4. a node with no valid edge would float alone on the canvas -> drop it
    if (edges.length === 0) {
      problems.push(`${node.temp_id} has no valid link, dropped`)
      return null
    }

    // 5. depth = 1 + the closest link target. (Two parents? the shorter path wins,
    //    so the node shows up as soon as either parent is opened.)
    const depth = 1 + Math.min(...targetDepths)

    // 6. keep it, so the next nodes (even in the same frame) can link to it
    ghostIdByTempId.set(node.temp_id, ghostId)
    depthByGhostId.set(ghostId, depth)
    return {
      node: { ghost_id: ghostId, content: node.content.trim(), frame_id: frameGhostId, depth },
      edges,
    }
  }

  // Put an accepted chunk into the running total.
  function remember(chunk: GhostChunk) {
    all.frames.push(...chunk.frames)
    all.nodes.push(...chunk.nodes)
    all.edges.push(...chunk.edges)
  }

  return {
    addElement(rawElement) {
      // is it even shaped like a node or a frame?
      const parsed = modelElementSchema.safeParse(rawElement)
      if (!parsed.success) {
        return { chunk: null, problems: [`element has wrong shape: ${parsed.error.issues[0]?.message}`] }
      }
      const element = parsed.data
      const problems: string[] = []

      // ── a lone node ──
      if (element.kind === 'node') {
        const checked = checkNode(element, null, problems)
        if (!checked) return { chunk: null, problems }

        const chunk: GhostChunk = { frames: [], nodes: [checked.node], edges: checked.edges }
        remember(chunk)
        return { chunk, problems }
      }

      // ── a frame: check every node inside, in order ──
      const frame: GhostFrame = { ghost_id: crypto.randomUUID(), content: element.content.trim() }
      const kept: { node: GhostNode; edges: GhostEdge[] }[] = []
      for (const inner of element.nodes) {
        const checked = checkNode(inner, frame.ghost_id, problems)
        if (checked) kept.push(checked)
      }

      if (kept.length === 0) return { chunk: null, problems }

      // a frame around ONE node means nothing -> dissolve it, keep the node free standing
      if (kept.length === 1) {
        problems.push('frame had fewer than 2 valid nodes, frame removed')
        kept[0].node.frame_id = null
        const chunk: GhostChunk = { frames: [], nodes: [kept[0].node], edges: kept[0].edges }
        remember(chunk)
        return { chunk, problems }
      }

      const chunk: GhostChunk = {
        frames: [frame],
        nodes: kept.map(k => k.node),
        edges: kept.flatMap(k => k.edges),
      }
      remember(chunk)
      return { chunk, problems }
    },

    accepted() {
      return all
    },
  }
}
