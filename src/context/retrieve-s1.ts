// S1 retrieval: "this node and what is right around it".
//
// Used by the Expander. The task is about the focus node(s) only,
// the rest is context so the agent doesn't repeat or contradict what is nearby.
//
// What goes in the prompt:
//   focus nodes      full   (text + all their notes)
//   1-hop neighbours full   (anyone sharing an edge with a focus node)
//   ancestors        title  (parents, grandparents... up to ANCESTOR_MAX_DEPTH)
//   edges            only between nodes that are loaded, with label + notes
//   canvas notes     always
//
// All reads go through `S1Source` so the logic can be tested without a database.
// (This file imports no database code on purpose: the real source is in db-source.ts.)

import { logger } from '../lib/logger.js'
import type { VisibleNotes } from '../db/context-notes.js'
import { ANCESTOR_MAX_DEPTH, HUB_FULLTEXT_NEIGHBORS } from './settings.js'
import type { ContextNote, Edge, LoadedEdge, LoadedNode, Node, RetrievalResult } from '../../types/index.js'

// Everything retrieval needs from the outside world.
export type S1Source = {
  // Active (not set aside) nodes only. Ids that don't exist or are set aside are simply missing.
  getNodes(ids: string[]): Promise<Node[]>
  // Every edge touching any of these nodes.
  getEdgesTouching(ids: string[]): Promise<Edge[]>
  getNotes(params: { nodeIds: string[]; edgeIds: string[]; excludeEntryId?: string }): Promise<VisibleNotes>
}

export async function retrieveS1(
  source: S1Source,
  params: {
    canvasId: string
    focusNodeIds: string[]
    // Set when the invoking text is a context entry: it goes in the task layer, not in a node unit.
    excludeEntryId?: string
  },
): Promise<RetrievalResult> {
  const { canvasId, focusNodeIds, excludeEntryId } = params

  // ── 1. load the focus nodes. No focus = nothing to work on ──
  const focusNodes = await source.getNodes(focusNodeIds)
  if (focusNodes.length === 0) {
    throw new Error('retrieveS1: none of the focus nodes exist or they are set aside')
  }
  const focusIds = focusNodes.map(n => n.id)

  // ── 2. 1-hop: every edge touching a focus node, and the node on the other end ──
  const focusEdges = await source.getEdgesTouching(focusIds)
  const otherEndIds = focusEdges
    .flatMap(e => [e.from_node_id, e.to_node_id])
    .filter(id => !focusIds.includes(id))
  const neighbours = await source.getNodes([...new Set(otherEndIds)])

  // ── 3. hub guard: a node with a huge number of neighbours would flood the prompt.
  //       Newest neighbours get full text, the rest are shown as titles. ──
  const newestFirst = [...neighbours].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const fullNeighbourIds = new Set(newestFirst.slice(0, HUB_FULLTEXT_NEIGHBORS).map(n => n.id))
  if (neighbours.length > HUB_FULLTEXT_NEIGHBORS) {
    logger.info('[context:s1] hub node, extra neighbours reduced to titles', {
      canvas_id: canvasId,
      neighbours: neighbours.length,
      full_text: HUB_FULLTEXT_NEIGHBORS,
    })
  }

  // ── 4. ancestors: walk UP the parent chain (edges pointing INTO the node) ──
  const { ancestors, ancestorEdges } = await walkAncestors(source, focusIds, new Set([...focusIds, ...neighbours.map(n => n.id)]))

  // ── 5. put every loaded node in one list, in prompt order ──
  // (focus first, then neighbours, then ancestors; a node keeps its FIRST reason)
  const ordered: { node: Node; reason: LoadedNode['reason']; tier: LoadedNode['tier'] }[] = [
    ...focusNodes.map(node => ({ node, reason: 'focus' as const, tier: 'full' as const })),
    ...newestFirst.map(node => ({
      node,
      reason: 'hop1' as const,
      tier: fullNeighbourIds.has(node.id) ? ('full' as const) : ('title' as const),
    })),
    ...ancestors.map(node => ({ node, reason: 'ancestor' as const, tier: 'title' as const })),
  ]
  const loadedIds = new Set(ordered.map(o => o.node.id))

  // ── 6. keep only edges whose BOTH ends are loaded (drops edges to set-aside nodes too) ──
  const allEdges = new Map<string, Edge>()
  for (const edge of [...focusEdges, ...ancestorEdges]) allEdges.set(edge.id, edge)
  const keptEdges = [...allEdges.values()].filter(
    e => loadedIds.has(e.from_node_id) && loadedIds.has(e.to_node_id),
  )

  // ── 7. notes, read live. One query for nodes + edges + canvas ──
  const notes = await source.getNotes({
    nodeIds: [...loadedIds],
    edgeIds: keptEdges.map(e => e.id),
    excludeEntryId,
  })

  // ── 8. build the result: full nodes carry their notes, title nodes only a count ──
  const nodes: LoadedNode[] = ordered.map(({ node, reason, tier }) => {
    const nodeNotes: ContextNote[] = notes.byNode.get(node.id) ?? []
    return {
      id: node.id,
      seq: node.seq,
      tier,
      reason,
      content: node.content,
      summary: node.summary,
      notes: tier === 'full' ? nodeNotes : [],
      note_count: nodeNotes.length,
    }
  })

  const edges: LoadedEdge[] = keptEdges.map(edge => ({
    id: edge.id,
    from_node_id: edge.from_node_id,
    to_node_id: edge.to_node_id,
    label: edge.label,
    notes: notes.byEdge.get(edge.id) ?? [],
  }))

  logger.info('[context:s1] retrieved', {
    canvas_id: canvasId,
    focus: focusIds.length,
    hop1: neighbours.length,
    ancestors: ancestors.length,
    edges: edges.length,
  })

  return { scope: 'S1', focus_node_ids: focusIds, nodes, edges, canvas_notes: notes.canvas }
}

// Walk up from the focus nodes, one level at a time, until there are no more
// parents or we hit ANCESTOR_MAX_DEPTH.
// `alreadyLoaded` nodes (e.g. a parent that is also a 1-hop neighbour) are not added
// twice, but the walk still goes THROUGH them, so their own parents are found.
async function walkAncestors(
  source: S1Source,
  focusIds: string[],
  alreadyLoaded: Set<string>,
): Promise<{ ancestors: Node[]; ancestorEdges: Edge[] }> {
  const ancestors: Node[] = []
  const ancestorEdges: Edge[] = []
  const walked = new Set(focusIds) // stops loops in cyclic graphs
  let currentLevel = focusIds

  for (let depth = 0; depth < ANCESTOR_MAX_DEPTH; depth++) {
    // edges that point INTO this level: their from-node is the parent
    const edgesIn = (await source.getEdgesTouching(currentLevel)).filter(e => currentLevel.includes(e.to_node_id))
    const parentIds = [...new Set(edgesIn.map(e => e.from_node_id))].filter(id => !walked.has(id))

    // nothing new above us -> we reached the top
    if (parentIds.length === 0) break

    const parents = await source.getNodes(parentIds)
    if (parents.length === 0) break

    for (const parent of parents) walked.add(parent.id)
    ancestorEdges.push(...edgesIn.filter(e => parents.some(p => p.id === e.from_node_id)))

    // only parents we have not loaded yet become ancestors in the prompt
    const brandNew = parents.filter(p => !alreadyLoaded.has(p.id))
    for (const parent of brandNew) alreadyLoaded.add(parent.id)
    ancestors.push(...brandNew)

    currentLevel = parents.map(p => p.id)
  }

  return { ancestors, ancestorEdges }
}
