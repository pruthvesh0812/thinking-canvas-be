import { getAllByCanvasWithContent } from '../db/nodes.js'
import { getEdgesByCanvas } from '../db/edges.js'
import type { JudgeMapNode, Edge } from '../../types/index.js'

// ─────────────────────────────────────────────────────────────────────────
// NEIGHBOURHOOD — the local subgraph around the endpoints of a newly drawn
// edge.
//
// Why this exists: the Articulator is handed two nodes and asked what their
// connection MEANS. But canvas nodes are usually fragments — "what is the
// other option" is unreadable without the node that named the FIRST option,
// and without the root that established what the options are even for. The
// two endpoints alone reliably produce abstract, ungrounded articulations
// because there is nothing concrete in context to articulate ABOUT.
//
// So instead of making the agent tool-crawl outward (which it empirically
// does not do), the pipeline walks the graph server-side and inlines the
// result: each endpoint's ancestors, its siblings, and its children.
// ─────────────────────────────────────────────────────────────────────────

const MAX_ANCESTOR_HOPS = 3

type Adjacency = {
  parents: Map<string, string[]>
  children: Map<string, string[]>
}

function buildAdjacency(edges: Edge[]): Adjacency {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const e of edges) {
    parents.set(e.to_node_id, [...(parents.get(e.to_node_id) ?? []), e.from_node_id])
    children.set(e.from_node_id, [...(children.get(e.from_node_id) ?? []), e.to_node_id])
  }
  return { parents, children }
}

// Walks up to MAX_ANCESTOR_HOPS levels of parents, nearest first. Visited-set
// guarded: the canvas is a DAG by intent, but a user-drawn cycle must not hang
// the pipeline.
function ancestorsOf(nodeId: string, adj: Adjacency): string[] {
  const out: string[] = []
  const seen = new Set<string>([nodeId])
  let frontier = adj.parents.get(nodeId) ?? []

  for (let hop = 0; hop < MAX_ANCESTOR_HOPS && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      next.push(...(adj.parents.get(id) ?? []))
    }
    frontier = next
  }
  return out
}

// Siblings = other children of this node's parents. These are the alternatives
// the user has already put on the canvas — the single most load-bearing piece
// of context for reading a node like "what is the OTHER option".
function siblingsOf(nodeId: string, adj: Adjacency): string[] {
  const out = new Set<string>()
  for (const parent of adj.parents.get(nodeId) ?? []) {
    for (const child of adj.children.get(parent) ?? []) {
      if (child !== nodeId) out.add(child)
    }
  }
  return [...out]
}

function renderNode(node: JudgeMapNode | undefined, id: string, relation: string): string {
  if (!node) return `  [${id.slice(0, 8)} | ${relation}] (node not found)`
  const marker = node.direction_marker ?? '?'
  const text = node.content?.trim() || node.summary || '(empty node)'
  return `  [${id.slice(0, 8)} | ${marker} | ${relation}] "${text}"`
}

// Builds the NEIGHBOURHOOD block for the two endpoints of the triggering edge.
// Returns '' when there is nothing around the endpoints worth showing, so the
// caller can omit the block entirely rather than emit an empty header.
export async function buildNeighborhoodBlock(params: {
  canvas_id: string
  from_node_id: string
  to_node_id: string
}): Promise<string> {
  const { canvas_id, from_node_id, to_node_id } = params

  const [allNodes, edges] = await Promise.all([
    getAllByCanvasWithContent(canvas_id),
    getEdgesByCanvas(canvas_id),
  ])
  const byId = new Map(allNodes.map(n => [n.id, n]))
  const adj = buildAdjacency(edges)

  const endpoints = new Set([from_node_id, to_node_id])
  const lines: string[] = []

  for (const [label, nodeId] of [['FROM', from_node_id], ['TO', to_node_id]] as const) {
    // Collect this endpoint's surroundings, de-duplicated and with the two
    // endpoints themselves excluded (they are already rendered in full by the
    // active-node block — repeating them here would just burn context).
    const seen = new Set<string>()
    const entries: Array<{ id: string; relation: string }> = []
    const add = (id: string, relation: string) => {
      if (endpoints.has(id) || seen.has(id)) return
      seen.add(id)
      entries.push({ id, relation })
    }

    ancestorsOf(nodeId, adj).forEach((id, i) => add(id, i === 0 ? 'parent' : 'ancestor'))
    siblingsOf(nodeId, adj).forEach(id => add(id, 'sibling — a peer alternative'))
    ;(adj.children.get(nodeId) ?? []).forEach(id => add(id, 'child'))

    if (entries.length === 0) continue
    lines.push(`AROUND THE ${label} NODE [${nodeId.slice(0, 8)}]:`)
    for (const { id, relation } of entries) {
      lines.push(renderNode(byId.get(id), id, relation))
    }
    lines.push('')
  }

  if (lines.length === 0) return ''

  return [
    'NEIGHBOURHOOD (context around the two connected nodes — read this before articulating):',
    ...lines,
  ].join('\n').trimEnd()
}
