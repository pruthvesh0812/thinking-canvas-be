import { db } from './client.js'
import type { ContextNote } from '../../types/index.js'

// Notes the user attached (context_entries + context_links), read LIVE for agents.
// Backend only reads: the frontend writes these tables directly.
//
// Visibility rule (CONTEXT-CAPTURE.md). A note is visible only if ALL of these hold:
//   - it has an ACTIVE link to the thing we ask about
//   - the note itself is not deleted
//   - it is not an attachment, unless its file scan is 'clean'
// The "target node is set aside" part is the caller's job: only ask about nodes
// that were loaded as active.

export type VisibleNotes = {
  byNode: Map<string, ContextNote[]>
  byEdge: Map<string, ContextNote[]>
  canvas: ContextNote[]
}

// Shape of one row from the query below (entry comes from the inner join).
type LinkRow = {
  target_type: string
  target_id: string | null
  entry: { id: string; content: string | null; source: string; created_at: string; deleted_at: string | null }
}

export async function getVisibleNotes(
  canvas_id: string,
  params: {
    nodeIds: string[]
    edgeIds: string[]
    // The invoking note is shown in the task layer, so it must not repeat inside its node's unit.
    excludeEntryId?: string
  },
): Promise<VisibleNotes> {
  const { nodeIds, edgeIds, excludeEntryId } = params

  // 1. what are we asking about? canvas notes always, plus the given nodes and edges
  const targets = ['target_type.eq.canvas']
  if (nodeIds.length > 0) targets.push(`and(target_type.eq.node,target_id.in.(${nodeIds.join(',')}))`)
  if (edgeIds.length > 0) targets.push(`and(target_type.eq.edge,target_id.in.(${edgeIds.join(',')}))`)

  // 2. active links + their note, skipping deleted notes
  const { data, error } = await db
    .from('context_links')
    .select('target_type, target_id, entry:context_entries!inner(id, content, source, created_at, deleted_at)')
    .eq('canvas_id', canvas_id)
    .eq('state', 'active')
    .is('entry.deleted_at', null)
    .or(targets.join(','))

  if (error) throw new Error(`getVisibleNotes failed: ${error.message}`)

  let rows = (data ?? []) as unknown as LinkRow[]

  // 3. drop the invoking note, and notes with no text
  rows = rows.filter(r => r.entry.id !== excludeEntryId && !!r.entry.content?.trim())

  // 4. attachments are only visible when their file scan is clean (nothing sets that yet)
  const attachmentIds = [...new Set(rows.filter(r => r.entry.source === 'attachment').map(r => r.entry.id))]
  if (attachmentIds.length > 0) {
    const { data: clean, error: scanError } = await db
      .from('context_attachments')
      .select('entry_id')
      .in('entry_id', attachmentIds)
      .eq('scan_status', 'clean')
    if (scanError) throw new Error(`getVisibleNotes scan check failed: ${scanError.message}`)

    const cleanIds = new Set((clean ?? []).map(c => c.entry_id))
    rows = rows.filter(r => r.entry.source !== 'attachment' || cleanIds.has(r.entry.id))
  }

  // 5. group by what the note is about, oldest first
  const result: VisibleNotes = { byNode: new Map(), byEdge: new Map(), canvas: [] }
  const sorted = [...rows].sort((a, b) => a.entry.created_at.localeCompare(b.entry.created_at))

  for (const row of sorted) {
    const note: ContextNote = {
      id: row.entry.id,
      content: row.entry.content!.trim(),
      created_at: row.entry.created_at,
    }

    if (row.target_type === 'canvas') {
      result.canvas.push(note)
      continue
    }

    const bucket = row.target_type === 'node' ? result.byNode : result.byEdge
    const list = bucket.get(row.target_id!) ?? []
    list.push(note)
    bucket.set(row.target_id!, list)
  }

  return result
}
