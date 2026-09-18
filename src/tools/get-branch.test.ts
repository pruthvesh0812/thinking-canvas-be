import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { ok } from '../db/test-support/fake-supabase.js'

const { dbMock, getEdgesByCanvasMock } = vi.hoisted(() => ({
  dbMock: { from: vi.fn() },
  getEdgesByCanvasMock: vi.fn(),
}))
vi.mock('../db/client.js', () => ({ db: dbMock }))
vi.mock('../db/edges.js', () => ({ getEdgesByCanvas: getEdgesByCanvasMock }))

const { get_branch } = await import('./get-branch.js')

// createTool enforces .uuid() on inputSchema/requestContextSchema fields, so
// fixtures need real v4-shaped UUIDs (fixed nibbles), not arbitrary strings.
const CANVAS = '66666666-6666-4666-8666-666666666666'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const LONE = '55555555-5555-4555-8555-555555555555'

function ctx() {
  return { requestContext: new RequestContext({ canvas_id: CANVAS }) } as never
}

function edge(from: string, to: string) {
  return { id: `${from}-${to}`, from_node_id: from, to_node_id: to }
}

describe('get_branch', () => {
  beforeEach(() => {
    dbMock.from.mockReset()
    getEdgesByCanvasMock.mockReset()
  })

  it('walks the full subtree reachable from the root', async () => {
    // A -> B -> C, A -> D
    getEdgesByCanvasMock.mockResolvedValue([edge(A, B), edge(B, C), edge(A, D)])
    dbMock.from.mockReturnValue(ok([
      { id: A, content: null, summary: 's-a', direction_marker: null },
      { id: B, content: null, summary: 's-b', direction_marker: null },
      { id: C, content: null, summary: 's-c', direction_marker: null },
      { id: D, content: null, summary: 's-d', direction_marker: null },
    ]))

    const result = await get_branch.execute({ branch_root_node_id: A }, ctx())
    expect(result.branch.map(n => n.node_id).sort()).toEqual([A, B, C, D].sort())
  })

  it('cannot walk through a node getEdgesByCanvas already excluded (set aside)', async () => {
    // B is set aside — getEdgesByCanvas has already dropped every edge
    // touching it, so A->B and B->C are both gone; C is unreachable from A.
    getEdgesByCanvasMock.mockResolvedValue([edge(A, D)])
    dbMock.from.mockReturnValue(ok([
      { id: A, content: null, summary: 's-a', direction_marker: null },
      { id: D, content: null, summary: 's-d', direction_marker: null },
    ]))

    const result = await get_branch.execute({ branch_root_node_id: A }, ctx())
    expect(result.branch.map(n => n.node_id).sort()).toEqual([A, D].sort())
    expect(result.branch.some(n => n.node_id === C)).toBe(false)
  })

  it('returns just the root when it has no outgoing edges', async () => {
    getEdgesByCanvasMock.mockResolvedValue([])
    dbMock.from.mockReturnValue(ok([
      { id: LONE, content: null, summary: 's-lone', direction_marker: null },
    ]))
    const result = await get_branch.execute({ branch_root_node_id: LONE }, ctx())
    expect(result.branch.map(n => n.node_id)).toEqual([LONE])
  })

  it('propagates a getEdgesByCanvas failure rather than swallowing it', async () => {
    getEdgesByCanvasMock.mockRejectedValue(new Error('db down'))
    await expect(get_branch.execute({ branch_root_node_id: A }, ctx())).rejects.toThrow('db down')
  })
})
