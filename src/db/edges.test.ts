import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ok, fail } from './test-support/fake-supabase.js'

const { dbMock } = vi.hoisted(() => ({ dbMock: { from: vi.fn() } }))
vi.mock('./client.js', () => ({ db: dbMock }))

const { getEdgesByCanvas } = await import('./edges.js')

// Row shape getEdgesByCanvas's embedded select returns before it strips
// from_node/to_node back out.
function row(id: string, from: string, to: string, fromAside: string | null, toAside: string | null) {
  return {
    id,
    canvas_id: 'canvas-1',
    from_node_id: from,
    to_node_id: to,
    edge_type: 'associative',
    from_node: { set_aside_at: fromAside },
    to_node: { set_aside_at: toAside },
  }
}

describe('getEdgesByCanvas', () => {
  beforeEach(() => dbMock.from.mockReset())

  it('keeps an edge whose both endpoints are active', async () => {
    dbMock.from.mockReturnValue(ok([row('e1', 'a', 'b', null, null)]))
    const edges = await getEdgesByCanvas('canvas-1')
    expect(edges.map(e => e.id)).toEqual(['e1'])
  })

  it('drops an edge whose FROM endpoint is set aside', async () => {
    dbMock.from.mockReturnValue(ok([row('e1', 'a', 'b', '2026-01-01T00:00:00Z', null)]))
    expect(await getEdgesByCanvas('canvas-1')).toEqual([])
  })

  it('drops an edge whose TO endpoint is set aside', async () => {
    dbMock.from.mockReturnValue(ok([row('e1', 'a', 'b', null, '2026-01-01T00:00:00Z')]))
    expect(await getEdgesByCanvas('canvas-1')).toEqual([])
  })

  it('strips from_node/to_node off the returned edges — callers get plain Edge rows', async () => {
    dbMock.from.mockReturnValue(ok([row('e1', 'a', 'b', null, null)]))
    const [edge] = await getEdgesByCanvas('canvas-1')
    expect(edge).not.toHaveProperty('from_node')
    expect(edge).not.toHaveProperty('to_node')
    expect(edge).toMatchObject({ id: 'e1', from_node_id: 'a', to_node_id: 'b' })
  })

  it('keeps active edges and drops aside-touching ones from a mixed batch', async () => {
    dbMock.from.mockReturnValue(ok([
      row('e1', 'a', 'b', null, null),
      row('e2', 'b', 'c', '2026-01-01T00:00:00Z', null),
      row('e3', 'c', 'd', null, null),
    ]))
    const edges = await getEdgesByCanvas('canvas-1')
    expect(edges.map(e => e.id)).toEqual(['e1', 'e3'])
  })

  it('throws on a query error', async () => {
    dbMock.from.mockReturnValue(fail('boom'))
    await expect(getEdgesByCanvas('canvas-1')).rejects.toThrow(/getEdgesByCanvas failed: boom/)
  })
})
