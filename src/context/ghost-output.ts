// Turns what the model says into ghost chunks the frontend can draw.
//
// Flow, in short:
//   1. model streams nodes one by one (each node lists its own links)
//   2. NodeEmitter says "this node is finished" as soon as the next one starts
//   3. GhostChunkBuilder checks the finished node, swaps model ids for real ids,
//      and returns one chunk: the node + the edges that are ready to draw
//
// Why links live INSIDE each node (and not in one big edges list at the end):
// if edges came last, nothing could be drawn until the whole answer was done.
// With links inside the node, every node arrives already connected, so the user
// sees the structure grow piece by piece.

import { z } from 'zod'
import type { GhostEdge, GhostNode } from '../../types/index.js'
import type { IdMap } from './ids.js'

// ─────────────────────────────────────────────
// The shape we ask the model for
// ─────────────────────────────────────────────

export const modelNodeSchema = z.object({
  // t1, t2, t3... the model's own name for a NEW node. Only used inside this run.
  temp_id: z.string().regex(/^t\d+$/),
  content: z.string().min(1),
  // How this new node connects to the rest. "other" is either an existing node
  // (n5) or a new node written EARLIER in this answer (t1).
  links: z.array(
    z.object({
      other: z.string(),
      // from = other -> this node.   to = this node -> other.
      direction: z.enum(['from', 'to']),
      label: z.string().max(80).optional(),
    }),
  ),
})

export const modelOutputSchema = z.object({
  nodes: z.array(modelNodeSchema),
})

export type ModelNode = z.infer<typeof modelNodeSchema>

// ─────────────────────────────────────────────
// Step 1: know when a streamed node is finished
// ─────────────────────────────────────────────

// While streaming we get the nodes array growing: [a], [a, b], [a, b, c]...
// The LAST item may still be half-written. Everything before it is final.
// When the stream ends, the last one is final too.
export function createNodeEmitter() {
  let alreadyEmitted = 0

  function takeNewlyFinished(upTo: number, nodes: unknown[]): unknown[] {
    const fresh = nodes.slice(alreadyEmitted, upTo)
    alreadyEmitted = Math.max(alreadyEmitted, upTo)
    return fresh
  }

  return {
    // Call with every partial update. Returns nodes that just became final.
    feed(partialNodes: unknown[]): unknown[] {
      // keep the last one back, it might still be growing
      return takeNewlyFinished(partialNodes.length - 1, partialNodes)
    },
    // Call once when the stream is over, with the complete list.
    finish(finalNodes: unknown[]): unknown[] {
      return takeNewlyFinished(finalNodes.length, finalNodes)
    },
  }
}

// ─────────────────────────────────────────────
// Step 2: check a finished node and build the chunk
// ─────────────────────────────────────────────

export type GhostChunk = {
  nodes: GhostNode[]
  edges: GhostEdge[]
}

export type AddNodeResult = {
  // null = the node was dropped, nothing to send
  chunk: GhostChunk | null
  // human-readable reasons something was dropped (for logs + retry hint)
  problems: string[]
}

export type GhostChunkBuilder = {
  addNode(rawNode: unknown): AddNodeResult
  // everything accepted so far, in order. Saved on the thread when the run ends.
  accepted(): GhostChunk
}

export function createGhostChunkBuilder(idMap: IdMap): GhostChunkBuilder {
  // t1 -> the ghost id we minted for it. Only nodes we ACCEPTED are in here.
  const ghostIdByTempId = new Map<string, string>()
  // "from|to" keys we already sent, to catch duplicate edges
  const seenEdges = new Set<string>()
  const all: GhostChunk = { nodes: [], edges: [] }

  // Turn a model id (n5 or t1) into a real id the frontend knows.
  // Returns null if the id is unknown (never guess, just drop).
  function resolveId(modelId: string): string | null {
    return idMap.uuidFor(modelId) ?? ghostIdByTempId.get(modelId) ?? null
  }

  return {
    addNode(rawNode) {
      const problems: string[] = []

      // 1. is it even shaped like a node?
      const parsed = modelNodeSchema.safeParse(rawNode)
      if (!parsed.success) {
        return { chunk: null, problems: [`node has wrong shape: ${parsed.error.issues[0]?.message}`] }
      }
      const node = parsed.data

      // 2. temp id must be new (two nodes can't both be t1)
      if (ghostIdByTempId.has(node.temp_id)) {
        return { chunk: null, problems: [`${node.temp_id} used twice`] }
      }

      // 3. we mint the ghost id now, so edges can point at it
      const ghostId = crypto.randomUUID()
      const edges: GhostEdge[] = []

      // 4. go through each link, keep only the good ones
      for (const link of node.links) {
        if (link.other === node.temp_id) {
          problems.push(`${node.temp_id} links to itself`)
          continue
        }

        const otherId = resolveId(link.other)
        if (!otherId) {
          problems.push(`${node.temp_id} links to unknown id ${link.other}`)
          continue
        }

        // direction: "from" means the other node points AT this one
        const from = link.direction === 'from' ? otherId : ghostId
        const to = link.direction === 'from' ? ghostId : otherId

        const edgeKey = `${from}|${to}`
        if (seenEdges.has(edgeKey)) {
          problems.push(`${node.temp_id} has a duplicate edge to ${link.other}`)
          continue
        }

        seenEdges.add(edgeKey)
        edges.push({ from, to, label: link.label?.trim() || null })
      }

      // 5. a node with no valid edge would float alone on the canvas -> drop it
      if (edges.length === 0) {
        problems.push(`${node.temp_id} has no valid link, dropped`)
        return { chunk: null, problems }
      }

      // 6. all good, remember it and hand back the chunk
      ghostIdByTempId.set(node.temp_id, ghostId)
      const chunk: GhostChunk = {
        nodes: [{ ghost_id: ghostId, content: node.content.trim() }],
        edges,
      }
      all.nodes.push(...chunk.nodes)
      all.edges.push(...chunk.edges)

      return { chunk, problems }
    },

    accepted() {
      return all
    },
  }
}
