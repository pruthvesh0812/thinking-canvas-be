import { db } from './client.js'
import type { Node, DirectionMarker, CanvasMapNode, JudgeMapNode } from '../../types/index.js'

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

// Batched lookup — use instead of N parallel getNode() calls when validating a
// set of ids (e.g. the Observer's anchor_node_ids).
export async function getNodesByIds(ids: string[]): Promise<Node[]> {
  const { data, error } = await db
    .from('nodes')
    .select('*')
    .in('id', ids)

  if (error) throw new Error(`getNodesByIds failed: ${error.message}`)
  return (data ?? []) as Node[]
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
// Selects only the fields the canvas map ever reads (the Observer's "summary
// only, never full content" rule — see CORE-CONCEPTS.md), instead of fetching
// every column for every node on a canvas that only grows over time.
export async function getAllByCanvas(canvas_id: string): Promise<CanvasMapNode[]> {
  const { data, error } = await db
    .from('nodes')
    .select('id, session_id, summary, direction_marker')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getAllByCanvas failed: ${error.message}`)
  return (data ?? []) as CanvasMapNode[]
}

// The judge's map source — every node on the canvas with COMPLETE content,
// oldest first. Maturity preconditions live in the wording of nodes, which
// summaries lose (DESIGN §4b); still skips the embedding column no map renders.
export async function getAllByCanvasWithContent(canvas_id: string): Promise<JudgeMapNode[]> {
  const { data, error } = await db
    .from('nodes')
    .select('id, session_id, content, summary, direction_marker')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getAllByCanvasWithContent failed: ${error.message}`)
  return (data ?? []) as JudgeMapNode[]
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

export async function deleteNode(node_id: string): Promise<void> {
  const { error } = await db.from('nodes').delete().eq('id', node_id)
  if (error) throw new Error(`deleteNode failed: ${error.message}`)
}
