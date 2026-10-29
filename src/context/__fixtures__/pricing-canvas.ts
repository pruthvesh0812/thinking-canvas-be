// Shared test fixture: one small, realistic canvas ("B2B launch pricing") plus
// builders and an in-memory data source, so context tests don't hand-roll data.
// Test-only. Never imported from production code (excluded from the build).
//
// The canvas (arrows = edges, parent -> child):
//
//   n1 "Decide a pricing model"
//    ├─▶ n2 "Usage-based billing"        <- the usual focus
//    │     ├─ n4 "Survey: customers prefer per-seat"  (n4 -"contradicts"-> n2)
//    │     ├─▶ n5 "Set up Stripe metering"            (n2 -"needs"-> n5)
//    │     └─▶ n6 SET ASIDE node                      (must never reach a prompt)
//    └─▶ n3 "Flat annual license"        (sibling: NOT next to n2, so not in S1)
//   n7 "Hire a designer"                 (unrelated, no edges)

import { vi } from 'vitest'
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
): S1Source & { getNotes: ReturnType<typeof vi.fn> } {
  return {
    // set-aside nodes are "not found", like getNodesByIds
    getNodes: async ids => nodes.filter(n => ids.includes(n.id) && !n.set_aside_at),
    getEdgesTouching: async ids => edges.filter(e => ids.includes(e.from_node_id) || ids.includes(e.to_node_id)),
    getNotes: vi.fn(async ({ nodeIds, edgeIds, excludeEntryId }): Promise<VisibleNotes> => {
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
    }),
  }
}

// ─────────────────────────────────────────────
// The sample canvas
// ─────────────────────────────────────────────

export function createPricingCanvas() {
  const canvas: Canvas = {
    id: 'c1', user_id: 'u1', title: 'B2B launch pricing',
    original_intent: 'Decide a pricing model for the B2B launch', next_node_seq: 8, created_at: '2026-01-01T00:00:00Z',
  }

  const nodes = [
    makeNode('n1-id', 1, { content: 'Decide a pricing model', summary: 'Pricing model decision' }),
    makeNode('n2-id', 2, { content: 'Usage-based billing via Stripe metered plans', summary: 'Usage-based billing' }),
    makeNode('n3-id', 3, { content: 'Flat annual license', summary: 'Flat annual license' }),
    makeNode('n4-id', 4, { content: 'Survey: 60% of pilot customers prefer paying per seat', summary: 'Survey favours per-seat' }),
    makeNode('n5-id', 5, { content: 'Set up Stripe metering for API usage', summary: 'Stripe metering setup' }),
    makeNode('n6-id', 6, { content: 'An old AI idea the user set aside', set_aside_at: '2026-01-02T00:00:00Z', owner: 'ai' }),
    makeNode('n7-id', 7, { content: 'Hire a designer', summary: 'Hire designer' }),
  ]

  const edges = [
    makeEdge('e-1-2', 'n1-id', 'n2-id'),
    makeEdge('e-1-3', 'n1-id', 'n3-id'),
    makeEdge('e-4-2', 'n4-id', 'n2-id', 'contradicts'),
    makeEdge('e-2-5', 'n2-id', 'n5-id', 'needs'),
    makeEdge('e-2-6', 'n2-id', 'n6-id'),
  ]

  const notes: FixtureNote[] = [
    { note: makeNote('note-1', 'Heavy API users make up 70% of revenue', '2026-01-01T00:00:01Z'), target: { type: 'node', id: 'n2-id' } },
    { note: makeNote('note-2', 'Finance wants predictable monthly bills', '2026-01-01T00:00:02Z'), target: { type: 'node', id: 'n2-id' } },
    { note: makeNote('note-3', 'Sample was only 12 customers', '2026-01-01T00:00:03Z'), target: { type: 'edge', id: 'e-4-2' } },
    { note: makeNote('note-4', 'Launch is in Q1, budget is tight', '2026-01-01T00:00:04Z'), target: { type: 'canvas' } },
    { note: makeNote('note-5', 'Deleted by the user', '2026-01-01T00:00:05Z'), target: { type: 'node', id: 'n2-id' }, deleted: true },
    { note: makeNote('note-6', 'Note on the set-aside node', '2026-01-01T00:00:06Z'), target: { type: 'node', id: 'n6-id' } },
    { note: makeNote('note-7', 'Note on the grandparent', '2026-01-01T00:00:07Z'), target: { type: 'node', id: 'n1-id' } },
  ]

  return { canvas, nodes, edges, notes, source: () => makeInMemorySource(nodes, edges, notes) }
}
