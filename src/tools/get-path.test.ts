import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RequestContext } from '@mastra/core/request-context'
import { ok } from '../db/test-support/fake-supabase.js'

const { dbMock, getEdgesByCanvasMock } = vi.hoisted(() => ({
  dbMock: { from: vi.fn() },
  getEdgesByCanvasMock: vi.fn(),
}))
vi.mock('../db/client.js', () => ({ db: dbMock }))
vi.mock('../db/edges.js', () => ({ getEdgesByCanvas: getEdgesByCanvasMock }))

const { get_path } = await import('./get-path.js')

const CANVAS = '66666666-6666-4666-8666-666666666666'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'

function ctx() {
  return { requestContext: new RequestContext({ canvas_id: CANVAS }) } as never
}

function edge(from: string, to: string, edge_type = 'associative') {
  return { id: `${from}-${to}`, from_node_id: from, to_node_id: to, edge_type }
}

describe('get_path', () => {
  beforeEach(() => {
    dbMock.from.mockReset()
    getEdgesByCanvasMock.mockReset()
  })

  it('finds the shortest path via BFS', async () => {
    // A -> B -> D, A -> C -> D (both length 2; BFS returns the first found)
    getEdgesByCanvasMock.mockResolvedValue([edge(A, B), edge(B, D), edge(A, C), edge(C, D)])
    dbMock.from.mockReturnValue(ok([
      { id: A, summary: 's-a' },
      { id: B, summary: 's-b' },
      { id: D, summary: 's-d' },
    ]))

    const result = await get_path.execute({ from_node_id: A, to_node_id: D }, ctx())
    expect(result.length).toBe(2)
    expect(result.path[0].node_id).toBe(A)
    expect(result.path[result.path.length - 1].node_id).toBe(D)
  })

  it('cannot route through a node getEdgesByCanvas already excluded (set aside)', async () => {
    // B is set aside — getEdgesByCanvas dropped A->B and B->D, leaving only
    // the longer route through C.
    getEdgesByCanvasMock.mockResolvedValue([edge(A, C), edge(C, D)])
    dbMock.from.mockReturnValue(ok([
      { id: A, summary: 's-a' },
      { id: C, summary: 's-c' },
      { id: D, summary: 's-d' },
    ]))

    const result = await get_path.execute({ from_node_id: A, to_node_id: D }, ctx())
    expect(result.path.map(p => p.node_id)).toEqual([A, C, D])
    expect(result.path.some(p => p.node_id === B)).toBe(false)
  })

  it('returns an empty path when no route exists', async () => {
    getEdgesByCanvasMock.mockResolvedValue([])
    const result = await get_path.execute({ from_node_id: A, to_node_id: D }, ctx())
    expect(result).toEqual({ path: [], length: 0 })
  })

  it('filters set_aside_at on the final path-summary lookup', async () => {
    getEdgesByCanvasMock.mockResolvedValue([edge(A, D)])
    const isSpy = vi.fn().mockReturnValue(ok([{ id: A, summary: 's-a' }, { id: D, summary: 's-d' }]))
    dbMock.from.mockReturnValue({
      select: () => ({ eq: () => ({ in: () => ({ is: isSpy }) }) }),
    })

    await get_path.execute({ from_node_id: A, to_node_id: D }, ctx())
    expect(isSpy).toHaveBeenCalledWith('set_aside_at', null)
  })

  it('propagates a getEdgesByCanvas failure rather than swallowing it', async () => {
    getEdgesByCanvasMock.mockRejectedValue(new Error('db down'))
    await expect(get_path.execute({ from_node_id: A, to_node_id: D }, ctx())).rejects.toThrow('db down')
  })
})
