import { db } from './client.js'
import type { Edge } from '../../types/index.js'

// Row shape returned by getEdgesByCanvas's embedded endpoint select — carries
// just enough of each endpoint node to decide whether the edge touches a
// set-aside node, stripped back out before returning.
type EdgeWithEndpointAsideFlags = Edge & {
  from_node: { set_aside_at: string | null } | null
  to_node: { set_aside_at: string | null } | null
}

export async function getEdge(id: string): Promise<Edge> {
  const { data, error } = await db
    .from('edges')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getEdge failed: ${error.message}`)
  return data as Edge
}

// Every edge on the canvas whose endpoints are BOTH active — a set-aside node
// contributes nothing to any agent's view of the canvas, edges included (see
// CORE-CONCEPTS.md → set aside). Embeds each endpoint's set_aside_at in one
// round trip rather than fetching nodes separately to cross-check.
export async function getEdgesByCanvas(canvas_id: string): Promise<Edge[]> {
  const { data, error } = await db
    .from('edges')
    .select('*, from_node:nodes!edges_from_node_id_fkey(set_aside_at), to_node:nodes!edges_to_node_id_fkey(set_aside_at)')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getEdgesByCanvas failed: ${error.message}`)

  const rows = (data ?? []) as EdgeWithEndpointAsideFlags[]
  return rows
    .filter(e => !e.from_node?.set_aside_at && !e.to_node?.set_aside_at)
    .map(({ from_node, to_node, ...edge }) => edge)
}

export async function deleteEdge(edge_id: string): Promise<void> {
  const { error } = await db.from('edges').delete().eq('id', edge_id)
  if (error) throw new Error(`deleteEdge failed: ${error.message}`)
}

// both_existing flag is stored in DB — never recomputed in application code.
export async function getBothExistingEdges(canvas_id: string): Promise<Edge[]> {
  const { data, error } = await db
    .from('edges')
    .select('*')
    .eq('canvas_id', canvas_id)
    .eq('both_existing', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getBothExistingEdges failed: ${error.message}`)
  return (data ?? []) as Edge[]
}
