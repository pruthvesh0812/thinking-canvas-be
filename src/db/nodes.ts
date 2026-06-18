import { db } from './client.js'
import type { Node, DirectionMarker } from '../../types/index.js'

// Backend READS nodes only — frontend writes user nodes directly to Supabase.

export async function getNode(id: string): Promise<Node> {
  const { data, error } = await db
    .from('nodes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(`getNode failed: ${error.message}`)
  return data as Node
}

export async function getRecentNodes(
  canvas_id: string,
  limit: number
): Promise<Node[]> {
  const { data, error } = await db
    .from('nodes')
    .select('*')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getRecentNodes failed: ${error.message}`)
  return (data ?? []) as Node[]
}

// Every node on the canvas, oldest first — the Observer's bird's-eye map source.
// Returns full Node rows for consistency with the rest of this module, but callers
// must only read .summary/.direction_marker/.session_id — never .content (the
// Observer's "summary only, never full content" rule — see CORE-CONCEPTS.md).
export async function getAllByCanvas(canvas_id: string): Promise<Node[]> {
  const { data, error } = await db
    .from('nodes')
    .select('*')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getAllByCanvas failed: ${error.message}`)
  return (data ?? []) as Node[]
}

export async function getNodesBySession(
  canvas_id: string,
  session_id: string
): Promise<Node[]> {
  const { data, error } = await db
    .from('nodes')
    .select('*')
    .eq('canvas_id', canvas_id)
    .eq('session_id', session_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getNodesBySession failed: ${error.message}`)
  return (data ?? []) as Node[]
}

export async function updateSummary(
  node_id: string,
  summary: string,
  direction_marker: DirectionMarker
): Promise<void> {
  const { error } = await db
    .from('nodes')
    .update({ summary, direction_marker })
    .eq('id', node_id)

  if (error) throw new Error(`updateSummary failed: ${error.message}`)
}

export async function updateEmbedding(
  node_id: string,
  embedding: number[]
): Promise<void> {
  const { error } = await db
    .from('nodes')
    .update({ embedding: JSON.stringify(embedding) })
    .eq('id', node_id)

  if (error) throw new Error(`updateEmbedding failed: ${error.message}`)
}
