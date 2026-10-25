import { describe, expect, it } from 'vitest'
import { createIdMap } from './ids.js'
import { createGhostChunkBuilder, createNodeEmitter } from './ghost-output.js'

// Two nodes were shown to the model: n1 (focus) and n5.
const idMap = createIdMap([
  { id: 'uuid-1', seq: 1 },
  { id: 'uuid-5', seq: 5 },
])

describe('createIdMap', () => {
  it('maps n{seq} to uuid and back', () => {
    expect(idMap.uuidFor('n5')).toBe('uuid-5')
    expect(idMap.labelFor('uuid-1')).toBe('n1')
  })

  it('rejects numbers that were never shown, and non-node labels', () => {
    expect(idMap.uuidFor('n99')).toBeNull()
    expect(idMap.uuidFor('t1')).toBeNull()
    expect(idMap.uuidFor('uuid-1')).toBeNull()
  })
})

describe('createNodeEmitter', () => {
  it('holds back the last node until the next one starts', () => {
    const emitter = createNodeEmitter()
    expect(emitter.feed([{ a: 1 }])).toEqual([])
    expect(emitter.feed([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }])
    expect(emitter.feed([{ a: 1 }, { a: 2 }, { a: 3 }])).toEqual([{ a: 2 }])
  })

  it('finish() releases the rest, once', () => {
    const emitter = createNodeEmitter()
    emitter.feed([{ a: 1 }, { a: 2 }])
    expect(emitter.finish([{ a: 1 }, { a: 2 }, { a: 3 }])).toEqual([{ a: 2 }, { a: 3 }])
    expect(emitter.finish([{ a: 1 }, { a: 2 }, { a: 3 }])).toEqual([])
  })

  it('a short answer (one node) comes out as one chunk at finish', () => {
    const emitter = createNodeEmitter()
    expect(emitter.feed([{ a: 1 }])).toEqual([])
    expect(emitter.finish([{ a: 1 }])).toEqual([{ a: 1 }])
  })
})

describe('createGhostChunkBuilder', () => {
  const node = (temp_id: string, links: object[], content = 'some text') => ({ temp_id, content, links })

  it('builds a chunk and swaps n-labels for uuids', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addNode(
      node('t1', [{ other: 'n1', direction: 'from', label: ' because ' }]),
    )
    expect(problems).toEqual([])
    expect(chunk!.nodes).toHaveLength(1)
    // direction "from": existing node -> new node
    expect(chunk!.edges).toEqual([{ from: 'uuid-1', to: chunk!.nodes[0].ghost_id, label: 'because' }])
  })

  it('direction "to" points from the new node to the other', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk } = builder.addNode(node('t1', [{ other: 'n5', direction: 'to' }]))
    expect(chunk!.edges[0]).toEqual({ from: chunk!.nodes[0].ghost_id, to: 'uuid-5', label: null })
  })

  it('a later node can link to an earlier accepted one', () => {
    const builder = createGhostChunkBuilder(idMap)
    const first = builder.addNode(node('t1', [{ other: 'n1', direction: 'from' }])).chunk!
    const second = builder.addNode(node('t2', [{ other: 't1', direction: 'from' }])).chunk!
    expect(second.edges[0].from).toBe(first.nodes[0].ghost_id)
  })

  it('drops unknown ids instead of guessing; node with no valid link is dropped', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addNode(node('t1', [{ other: 'n99', direction: 'from' }]))
    expect(chunk).toBeNull()
    expect(problems.join(' ')).toMatch(/unknown id n99/)
  })

  it('keeps the good links when only some are bad', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addNode(
      node('t1', [{ other: 'n99', direction: 'from' }, { other: 'n1', direction: 'from' }]),
    )
    expect(chunk!.edges).toHaveLength(1)
    expect(problems).toHaveLength(1)
  })

  it('drops self links, duplicate edges and reused temp ids', () => {
    const builder = createGhostChunkBuilder(idMap)
    const dup = builder.addNode(
      node('t1', [
        { other: 't1', direction: 'from' },
        { other: 'n1', direction: 'from' },
        { other: 'n1', direction: 'from' },
      ]),
    )
    expect(dup.chunk!.edges).toHaveLength(1)
    expect(dup.problems).toHaveLength(2)

    const reused = builder.addNode(node('t1', [{ other: 'n1', direction: 'from' }]))
    expect(reused.chunk).toBeNull()
  })

  it('a dropped node can not be linked to later', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addNode(node('t1', [])) // orphan, dropped
    const { chunk } = builder.addNode(node('t2', [{ other: 't1', direction: 'from' }]))
    expect(chunk).toBeNull()
  })

  it('rejects a node with the wrong shape', () => {
    const builder = createGhostChunkBuilder(idMap)
    expect(builder.addNode({ temp_id: 'x', content: '', links: [] }).chunk).toBeNull()
  })

  it('accepted() collects every chunk in order', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addNode(node('t1', [{ other: 'n1', direction: 'from' }]))
    builder.addNode(node('t2', [{ other: 't1', direction: 'to' }]))
    expect(builder.accepted().nodes).toHaveLength(2)
    expect(builder.accepted().edges).toHaveLength(2)
  })
})
