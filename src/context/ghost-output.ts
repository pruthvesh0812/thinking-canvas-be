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
//   multi       anchor ──▶ t1, anchor ──▶ t2, with t1 + t2 inside one frame
//   hierarchy   anchor ──▶ t1 ──▶ t2 ──▶ ...  (t2 links FROM t1)
//   converge    t1 ──▶ t3 and t2 ──▶ t3        (t3 has two FROM links)
// No special "shape" field is needed: it is all just links + frames.

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

// A box around several nodes. Its text says how they relate, or gives context about them.
// Write it BEFORE the nodes that sit inside it. It has no links of its own.
export const modelFrameSchema = z.object({
  kind: z.literal('frame'),
  temp_id: z.string().regex(/^f\d+$/), // f1, f2...
  content: z.string().min(1),
})

export const modelNodeSchema = z.object({
  kind: z.literal('node'),
  temp_id: z.string().regex(/^t\d+$/), // t1, t2... the model's own name for a NEW node
  content: z.string().min(1),
  // Put the node inside a frame written earlier (f1). Leave out = free standing.
  frame_id: z.string().optional(),
  // How it connects to the rest. Every node needs at least one valid link.
  links: z.array(modelLinkSchema),
})

export const modelElementSchema = z.discriminatedUnion('kind', [modelFrameSchema, modelNodeSchema])

// The whole answer. Order matters: it is the order things appear on screen.
export const modelOutputSchema = z.object({
  elements: z.array(modelElementSchema),
})

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

// One piece to publish. frames = only frames used for the first time in this chunk.
export type GhostChunk = GhostStructure

export type AddElementResult = {
  // null = nothing to send (a frame was just registered, or the node was dropped)
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
  // f1 -> frame we have seen. "sent" flips when a node first uses it.
  const frames = new Map<string, { frame: GhostFrame; sent: boolean }>()
  // "from|to" keys we already sent, to catch duplicate edges
  const seenEdges = new Set<string>()
  const all: GhostStructure = { frames: [], nodes: [], edges: [] }

  // Turn a model id (n5 or t1) into a real id the frontend knows.
  // Returns null if the id is unknown (never guess, just drop).
  function resolveId(modelId: string): string | null {
    return idMap.uuidFor(modelId) ?? ghostIdByTempId.get(modelId) ?? null
  }

  // A frame is only remembered here. It is sent later, with the first node inside it
  // (a frame with no nodes is never sent, so it can't show up empty).
  function registerFrame(frame: { temp_id: string; content: string }): AddElementResult {
    if (frames.has(frame.temp_id)) {
      return { chunk: null, problems: [`${frame.temp_id} used twice`] }
    }
    frames.set(frame.temp_id, {
      frame: { ghost_id: crypto.randomUUID(), content: frame.content.trim() },
      sent: false,
    })
    return { chunk: null, problems: [] }
  }

  function buildNodeChunk(node: Extract<ModelElement, { kind: 'node' }>): AddElementResult {
    const problems: string[] = []

    // 1. temp id must be new (two nodes can't both be t1)
    if (ghostIdByTempId.has(node.temp_id)) {
      return { chunk: null, problems: [`${node.temp_id} used twice`] }
    }

    // 2. we mint the ghost id now, so edges can point at it
    const ghostId = crypto.randomUUID()
    const edges: GhostEdge[] = []

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
      edges.push({ from, to, label: link.label?.trim() || null })
    }

    // 4. a node with no valid edge would float alone on the canvas -> drop it
    if (edges.length === 0) {
      problems.push(`${node.temp_id} has no valid link, dropped`)
      return { chunk: null, problems }
    }

    // 5. frame: must be one we know. Unknown frame is not fatal, node just stands free.
    let frameGhostId: string | null = null
    const newFrames: GhostFrame[] = []
    if (node.frame_id) {
      const entry = frames.get(node.frame_id)
      if (!entry) {
        problems.push(`${node.temp_id} is in unknown frame ${node.frame_id}, placed outside any frame`)
      } else {
        frameGhostId = entry.frame.ghost_id
        // first node in this frame? then the frame travels with it
        if (!entry.sent) {
          entry.sent = true
          newFrames.push(entry.frame)
        }
      }
    }

    // 6. all good, remember it and hand back the chunk
    ghostIdByTempId.set(node.temp_id, ghostId)
    const ghostNode: GhostNode = { ghost_id: ghostId, content: node.content.trim(), frame_id: frameGhostId }
    const chunk: GhostChunk = { frames: newFrames, nodes: [ghostNode], edges }
    all.frames.push(...chunk.frames)
    all.nodes.push(...chunk.nodes)
    all.edges.push(...chunk.edges)

    return { chunk, problems }
  }

  return {
    addElement(rawElement) {
      // is it even shaped like a frame or a node?
      const parsed = modelElementSchema.safeParse(rawElement)
      if (!parsed.success) {
        return { chunk: null, problems: [`element has wrong shape: ${parsed.error.issues[0]?.message}`] }
      }

      return parsed.data.kind === 'frame' ? registerFrame(parsed.data) : buildNodeChunk(parsed.data)
    },

    accepted() {
      return all
    },
  }
}
