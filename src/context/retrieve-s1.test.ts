import { describe, expect, it, vi } from 'vitest'
import type { ContextNote, Edge, Node } from '../../types/index.js'
import type { VisibleNotes } from '../db/context-notes.js'
import { retrieveS1, type S1Source } from './retrieve-s1.js'
import { ANCESTOR_MAX_DEPTH, HUB_FULLTEXT_NEIGHBORS } from './settings.js'

// The real modules touch Supabase; tests only use the in-memory source below.
vi.mock('../db/nodes.js', () => ({}))
vi.mock('../db/edges.js', () => ({}))
vi.mock('../db/context-notes.js', () => ({}))

// ── small builders ──
let clock = 0
const node = (id: string, seq: number, extra: Partial<Node> = {}): Node => ({
  id, seq, canvas_id: 'c1', session_id: 's1', owner: 'human',
  content: `text of ${id}`, summary: `summary of ${id}`, direction_marker: null, embedding: null,
  x: null, y: null, width: null, height: null,
  // each node is created one second after the previous one
  created_at: new Date(2026, 0, 1, 0, 0, ++clock).toISOString(),
  set_aside_at: null,
  ...extra,
})
const edge = (id: string, from: string, to: string, label: string | null = null): Edge => ({
  id, canvas_id: 'c1', session_id: 's1', from_node_id: from, to_node_id: to,
  both_existing: true, from_handle: null, to_handle: null, label, created_at: '2026-01-01T00:00:00Z',
})
const note = (id: string, content: string): ContextNote => ({ id, content, created_at: '2026-01-01T00:00:00Z' })

function makeSource(
  nodes: Node[],
  edges: Edge[],
  notes: Partial<VisibleNotes> = {},
): S1Source & { getNotes: ReturnType<typeof vi.fn> } {
  return {
    getNodes: async ids => nodes.filter(n => ids.includes(n.id) && !n.set_aside_at),
    getEdgesTouching: async ids => edges.filter(e => ids.includes(e.from_node_id) || ids.includes(e.to_node_id)),
    getNotes: vi.fn(async () => ({ byNode: new Map(), byEdge: new Map(), canvas: [], ...notes })),
  }
}

const run = (source: S1Source, focus = ['focus'], excludeEntryId?: string) =>
  retrieveS1(source, { canvasId: 'c1', focusNodeIds: focus, excludeEntryId })

describe('retrieveS1', () => {
  it('loads focus (full), 1-hop in both directions (full) and parents as titles', async () => {
    const source = makeSource(
      [node('focus', 3), node('child', 4), node('parent', 2), node('grandparent', 1), node('stranger', 9)],
      [edge('e1', 'focus', 'child'), edge('e2', 'parent', 'focus'), edge('e3', 'grandparent', 'parent')],
    )
    const result = await run(source)

    // order: focus, then 1-hop (newest first), then ancestors
    expect(result.nodes.map(n => [n.id, n.reason, n.tier])).toEqual([
      ['focus', 'focus', 'full'],
      ['parent', 'hop1', 'full'],           // a parent next to the focus is also 1-hop: keeps full text
      ['child', 'hop1', 'full'],
      ['grandparent', 'ancestor', 'title'], // reached by walking THROUGH the loaded parent
    ])
    expect(result.nodes.find(n => n.id === 'stranger')).toBeUndefined()
  })

  it('keeps only edges whose both ends are loaded', async () => {
    const source = makeSource(
      [node('focus', 1), node('child', 2), node('far', 3)],
      [edge('e1', 'focus', 'child'), edge('e2', 'child', 'far')], // far is 2 hops down: not loaded
    )
    const result = await run(source)
    expect(result.edges.map(e => e.id)).toEqual(['e1'])
  })

  it('ignores set-aside neighbours and the edges to them', async () => {
    const source = makeSource(
      [node('focus', 1), node('ghosted', 2, { set_aside_at: '2026-01-02T00:00:00Z' })],
      [edge('e1', 'focus', 'ghosted')],
    )
    const result = await run(source)
    expect(result.nodes.map(n => n.id)).toEqual(['focus'])
    expect(result.edges).toEqual([])
  })

  it('stops climbing at ANCESTOR_MAX_DEPTH', async () => {
    // a straight chain a0 -> a1 -> ... -> focus, longer than the limit
    const chainLength = ANCESTOR_MAX_DEPTH + 3
    const chain = Array.from({ length: chainLength }, (_, i) => node(`a${i}`, i + 1))
    const focus = node('focus', 100)
    const edges = chain.map((n, i) => edge(`e${i}`, n.id, i === chainLength - 1 ? 'focus' : `a${i + 1}`))

    const result = await run(makeSource([...chain, focus], edges))

    // the direct parent is a 1-hop neighbour, so ANCESTOR_MAX_DEPTH levels up
    // gives (ANCESTOR_MAX_DEPTH - 1) extra ancestors on top of it
    expect(result.nodes.filter(n => n.reason === 'ancestor')).toHaveLength(ANCESTOR_MAX_DEPTH - 1)
    // and the far end of the chain is NOT loaded
    expect(result.nodes.find(n => n.id === 'a0')).toBeUndefined()
  })

  it('does not loop forever on a cycle', async () => {
    const source = makeSource(
      [node('focus', 1), node('b', 2)],
      [edge('e1', 'focus', 'b'), edge('e2', 'b', 'focus')],
    )
    const result = await run(source)
    expect(result.nodes.map(n => n.id).sort()).toEqual(['b', 'focus'])
  })

  it('hub guard: neighbours past the limit become titles, newest keep full text', async () => {
    const total = HUB_FULLTEXT_NEIGHBORS + 5
    const nodes = [node('focus', 1)]
    const edges: Edge[] = []
    for (let i = 0; i < total; i++) {
      nodes.push(node(`n${i}`, i + 2)) // later i = newer
      edges.push(edge(`e${i}`, 'focus', `n${i}`))
    }
    const result = await run(makeSource(nodes, edges))
    const hop1 = result.nodes.filter(n => n.reason === 'hop1')
    expect(hop1.filter(n => n.tier === 'full')).toHaveLength(HUB_FULLTEXT_NEIGHBORS)
    expect(hop1.filter(n => n.tier === 'title')).toHaveLength(5)
    // the oldest ones are the ones reduced
    expect(hop1.find(n => n.id === 'n0')!.tier).toBe('title')
    expect(hop1.find(n => n.id === `n${total - 1}`)!.tier).toBe('full')
  })

  it('full nodes carry their notes; title nodes only a count', async () => {
    const source = makeSource(
      [node('focus', 1), node('parent', 2), node('grandparent', 3)],
      [edge('e1', 'parent', 'focus'), edge('e2', 'grandparent', 'parent')],
      {
        byNode: new Map([
          ['focus', [note('x', 'why I care')]],
          ['grandparent', [note('y', 'old idea'), note('z', 'another')]],
        ]),
        byEdge: new Map([['e1', [note('w', 'because of budget')]]]),
        canvas: [note('c', 'overall goal')],
      },
    )
    const result = await run(source)

    expect(result.nodes.find(n => n.id === 'focus')!.notes.map(n => n.content)).toEqual(['why I care'])
    const title = result.nodes.find(n => n.id === 'grandparent')!
    expect(title.tier).toBe('title')
    expect(title.notes).toEqual([])
    expect(title.note_count).toBe(2)
    expect(result.edges.find(e => e.id === 'e1')!.notes.map(n => n.content)).toEqual(['because of budget'])
    expect(result.canvas_notes.map(n => n.content)).toEqual(['overall goal'])
  })

  it('passes the invoking note id to the notes query so it is left out', async () => {
    const source = makeSource([node('focus', 1)], [])
    await run(source, ['focus'], 'entry-42')
    expect(source.getNotes).toHaveBeenCalledWith(expect.objectContaining({ excludeEntryId: 'entry-42' }))
  })

  it('supports several focus nodes', async () => {
    const source = makeSource([node('a', 1), node('b', 2)], [edge('e1', 'a', 'b')])
    const result = await run(source, ['a', 'b'])
    expect(result.nodes.map(n => [n.id, n.reason])).toEqual([['a', 'focus'], ['b', 'focus']])
    expect(result.edges).toHaveLength(1)
  })

  it('fails with a clear error when no focus node can be loaded', async () => {
    await expect(run(makeSource([], []))).rejects.toThrow(/none of the focus nodes/)
  })
})
