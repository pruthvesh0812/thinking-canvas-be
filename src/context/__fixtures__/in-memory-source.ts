// Test/dev helpers: builders and an in-memory data source that follows the same rules as
// the real database code. NO vitest import here, so the preview tool (scripts/prompt-preview.ts)
// can use it too. Not imported by production code (excluded from the build).

import type { Canvas, ContextNote, Edge, Node } from '../../../types/index.js'
import type { VisibleNotes } from '../../db/context-notes.js'
import type { S1Source } from '../retrieve-s1.js'

// ─────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────

let clock = 0

// Each node is "created" one second after the previous one, so order is predictable.
export function makeNode(id: string, seq: number, extra: Partial<Node> = {}): Node {
  return {
    id, seq, canvas_id: 'c1', session_id: 's1', owner: 'human',
    content: `text of ${id}`, summary: `summary of ${id}`, direction_marker: null, embedding: null,
    x: null, y: null, width: null, height: null,
    created_at: new Date(2026, 0, 1, 0, 0, ++clock).toISOString(),
    set_aside_at: null,
    ...extra,
  }
}

export function makeEdge(id: string, from: string, to: string, label: string | null = null): Edge {
  return {
    id, canvas_id: 'c1', session_id: 's1', from_node_id: from, to_node_id: to,
    both_existing: true, from_handle: null, to_handle: null, label, created_at: '2026-01-01T00:00:00Z',
  }
}

export function makeNote(id: string, content: string, created_at = '2026-01-01T00:00:00Z'): ContextNote {
  return { id, content, created_at }
}

// ─────────────────────────────────────────────
// A note + what it is attached to (like context_entries + context_links)
// ─────────────────────────────────────────────

export type FixtureNote = {
  note: ContextNote
  target: { type: 'node' | 'edge'; id: string } | { type: 'canvas' }
  deleted?: boolean   // the user deleted the note -> invisible
}

// In-memory stand-in for src/db. Follows the same visibility rules as getVisibleNotes:
// a deleted note is hidden, the invoking note is left out, and only asked-for targets match.
export function makeInMemorySource(
  nodes: Node[],
  edges: Edge[],
  fixtureNotes: FixtureNote[] = [],
): S1Source {
  return {
    // set-aside nodes are "not found", like getNodesByIds
    getNodes: async ids => nodes.filter(n => ids.includes(n.id) && !n.set_aside_at),
    getEdgesTouching: async ids => edges.filter(e => ids.includes(e.from_node_id) || ids.includes(e.to_node_id)),
    getNotes: async ({ nodeIds, edgeIds, excludeEntryId }): Promise<VisibleNotes> => {
      const result: VisibleNotes = { byNode: new Map(), byEdge: new Map(), canvas: [] }
      for (const { note, target, deleted } of fixtureNotes) {
        if (deleted || note.id === excludeEntryId) continue
        if (target.type === 'canvas') { result.canvas.push(note); continue }
        if (target.type === 'node' && !nodeIds.includes(target.id)) continue
        if (target.type === 'edge' && !edgeIds.includes(target.id)) continue
        const bucket = target.type === 'node' ? result.byNode : result.byEdge
        bucket.set(target.id, [...(bucket.get(target.id) ?? []), note])
      }
      return result
    },
  }
}

