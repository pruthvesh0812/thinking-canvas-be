import { db } from './client.js'
import type { Edge } from '../../types/index.js'

export async function getEdge(id: string): Promise<Edge> {
  const { data, error } = await db
    .from('edges')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getEdge failed: ${error.message}`)
  return data as Edge
}

export async function getEdgesByCanvas(canvas_id: string): Promise<Edge[]> {
  const { data, error } = await db
    .from('edges')
    .select('*')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getEdgesByCanvas failed: ${error.message}`)
  return (data ?? []) as Edge[]
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
