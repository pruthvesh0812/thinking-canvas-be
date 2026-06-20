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

// Every edge for the given structures in one round-trip, grouped by
// structure_id — this is what pastObservationsBlock uses to compute each
// node's overall outcome.
export async function getEdgesByStructures(structure_ids: string[]): Promise<Map<string, ObserverEdge[]>> {
  const byStructure = new Map<string, ObserverEdge[]>()
  if (structure_ids.length === 0) return byStructure

  const { data, error } = await db
    .from('observer_edges')
    .select('*')
    .in('structure_id', structure_ids)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getEdgesByStructures failed: ${error.message}`)
  for (const edge of (data ?? []) as ObserverEdge[]) {
    const list = byStructure.get(edge.structure_id) ?? []
    list.push(edge)
    byStructure.set(edge.structure_id, list)
  }
  return byStructure
}
