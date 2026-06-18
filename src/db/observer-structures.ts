import { db } from './client.js'
import type { ObserverStructure, ObserverEdge } from '../../types/index.js'

// Read-only — no pipeline writes these tables yet (features 8-10, not started).
// Used by the serializer's PAST OBSERVATIONS block so the plumbing is correct
// ahead of the write path; returns [] until structures actually exist.

// Oldest-first so PAST OBSERVATIONS (serializer/index.ts) lists structures in
// the order the Observer originally proposed them.
export async function getStructuresByCanvas(canvas_id: string): Promise<ObserverStructure[]> {
  const { data, error } = await db
    .from('observer_structures')
    .select('*')
    .eq('canvas_id', canvas_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getStructuresByCanvas failed: ${error.message}`)
  return (data ?? []) as ObserverStructure[]
}

// One structure's edges, each carrying its own accept/reject/pending status —
// this is what pastObservationsBlock uses to compute each node's overall outcome.
export async function getEdgesByStructure(structure_id: string): Promise<ObserverEdge[]> {
  const { data, error } = await db
    .from('observer_edges')
    .select('*')
    .eq('structure_id', structure_id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getEdgesByStructure failed: ${error.message}`)
  return (data ?? []) as ObserverEdge[]
}
