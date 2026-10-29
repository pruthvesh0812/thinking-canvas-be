// Shared test fixture: one small, realistic canvas ("B2B launch pricing").
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
import type { Canvas } from '../../../types/index.js'
import { makeEdge, makeInMemorySource, makeNode, makeNote, type FixtureNote } from './in-memory-source.js'

// re-export so existing tests keep one import
export { makeEdge, makeInMemorySource, makeNode, makeNote }
export type { FixtureNote }

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

  // source() hands out a fresh in-memory source whose getNotes is a vitest spy,
  // so tests can check how it was called
  return {
    canvas, nodes, edges, notes,
    source: () => {
      const source = makeInMemorySource(nodes, edges, notes)
      source.getNotes = vi.fn(source.getNotes)
      return source
    },
  }
}
