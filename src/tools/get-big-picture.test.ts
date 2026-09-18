import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { ok, fail } from '../db/test-support/fake-supabase.js'

const { dbMock, getEdgesByCanvasMock } = vi.hoisted(() => ({
  dbMock: { from: vi.fn() },
  getEdgesByCanvasMock: vi.fn(),
}))
vi.mock('../db/client.js', () => ({ db: dbMock }))
vi.mock('../db/edges.js', () => ({ getEdgesByCanvas: getEdgesByCanvasMock }))

const { get_big_picture } = await import('./get-big-picture.js')

const CANVAS = '66666666-6666-4666-8666-666666666666'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function ctx() {
  return { requestContext: new RequestContext({ canvas_id: CANVAS }) } as never
}

describe('get_big_picture', () => {
  beforeEach(() => {
    dbMock.from.mockReset()
    getEdgesByCanvasMock.mockReset()
  })

  it('returns active node summaries and the edges getEdgesByCanvas already filtered', async () => {
    dbMock.from.mockReturnValue(ok([
      { id: A, summary: 's-a', direction_marker: null },
      { id: B, summary: 's-b', direction_marker: null },
    ]))
    getEdgesByCanvasMock.mockResolvedValue([{ id: 'e1', from_node_id: A, to_node_id: B, edge_type: 'associative' }])

    const result = await get_big_picture.execute({}, ctx())
    expect(result.nodes.map(n => n.node_id)).toEqual([A, B])
    expect(result.edges).toEqual([{ from: A, to: B, edge_type: 'associative' }])
  })

  it('never has to cross-check edges against active node ids itself — trusts getEdgesByCanvas', async () => {
    // Even if the node query (independently) returned fewer active nodes
    // than an edge references, get_big_picture no longer filters edges
    // client-side — it passes through whatever getEdgesByCanvas already
    // decided. This pins that division of responsibility down.
    dbMock.from.mockReturnValue(ok([{ id: A, summary: 's-a', direction_marker: null }]))
    getEdgesByCanvasMock.mockResolvedValue([{ id: 'e1', from_node_id: A, to_node_id: B, edge_type: 'associative' }])

    const result = await get_big_picture.execute({}, ctx())
    expect(result.edges).toEqual([{ from: A, to: B, edge_type: 'associative' }])
  })

  it('propagates a getEdgesByCanvas failure rather than swallowing it', async () => {
    dbMock.from.mockReturnValue(ok([]))
    getEdgesByCanvasMock.mockRejectedValue(new Error('db down'))
    await expect(get_big_picture.execute({}, ctx())).rejects.toThrow('db down')
  })

  it('still surfaces a node-query error', async () => {
    dbMock.from.mockReturnValue(fail('nodes boom'))
    getEdgesByCanvasMock.mockResolvedValue([])
    await expect(get_big_picture.execute({}, ctx())).rejects.toThrow(/nodes boom/)
  })
})
