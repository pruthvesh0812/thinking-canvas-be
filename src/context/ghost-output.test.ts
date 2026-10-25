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
  const node = (temp_id: string, links: object[], extra: object = {}) =>
    ({ kind: 'node', temp_id, content: 'some text', links, ...extra })
  const frame = (temp_id: string, content = 'how these relate') => ({ kind: 'frame', temp_id, content })

  it('single: one node linked from an existing node, n-label swapped for uuid', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(
      node('t1', [{ target: 'n1', direction: 'FROM', label: ' because ' }]),
    )
    expect(problems).toEqual([])
    expect(chunk!.nodes).toHaveLength(1)
    expect(chunk!.frames).toEqual([])
    expect(chunk!.nodes[0].frame_id).toBeNull()
    expect(chunk!.edges).toEqual([{ from: 'uuid-1', to: chunk!.nodes[0].ghost_id, label: 'because' }])
  })

  it('direction TO points from the new node to the other', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk } = builder.addElement(node('t1', [{ target: 'n5', direction: 'TO' }]))
    expect(chunk!.edges[0]).toEqual({ from: chunk!.nodes[0].ghost_id, to: 'uuid-5', label: null })
  })

  it('multi in a frame: frame is sent once, with the first node inside it', () => {
    const builder = createGhostChunkBuilder(idMap)
    expect(builder.addElement(frame('f1'))).toEqual({ chunk: null, problems: [] })

    const first = builder.addElement(node('t1', [{ target: 'n1', direction: 'FROM' }], { frame_id: 'f1' })).chunk!
    const second = builder.addElement(node('t2', [{ target: 'n1', direction: 'FROM' }], { frame_id: 'f1' })).chunk!

    expect(first.frames).toHaveLength(1)
    expect(second.frames).toEqual([])
    // both nodes point at the same frame
    expect(first.nodes[0].frame_id).toBe(first.frames[0].ghost_id)
    expect(second.nodes[0].frame_id).toBe(first.frames[0].ghost_id)
    expect(builder.accepted().frames).toHaveLength(1)
  })

  it('a frame with no nodes is never sent', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(frame('f1'))
    expect(builder.accepted().frames).toEqual([])
  })

  it('unknown frame is not fatal: the node stands free and a problem is noted', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(node('t1', [{ target: 'n1', direction: 'FROM' }], { frame_id: 'f9' }))
    expect(chunk!.nodes[0].frame_id).toBeNull()
    expect(problems.join(' ')).toMatch(/unknown frame f9/)
  })

  it('hierarchy: a later node links FROM an earlier accepted one', () => {
    const builder = createGhostChunkBuilder(idMap)
    const first = builder.addElement(node('t1', [{ target: 'n1', direction: 'FROM' }])).chunk!
    const second = builder.addElement(node('t2', [{ target: 't1', direction: 'FROM' }])).chunk!
    expect(second.edges[0].from).toBe(first.nodes[0].ghost_id)
  })

  it('converge: one node with two FROM links gets two edges', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [{ target: 'n1', direction: 'FROM' }]))
    builder.addElement(node('t2', [{ target: 'n1', direction: 'FROM' }]))
    const { chunk } = builder.addElement(
      node('t3', [{ target: 't1', direction: 'FROM' }, { target: 't2', direction: 'FROM' }]),
    )
    expect(chunk!.edges).toHaveLength(2)
    expect(chunk!.edges[0].to).toBe(chunk!.edges[1].to)
  })

  it('drops unknown ids instead of guessing; node with no valid link is dropped', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(node('t1', [{ target: 'n99', direction: 'FROM' }]))
    expect(chunk).toBeNull()
    expect(problems.join(' ')).toMatch(/unknown id n99/)
  })

  it('keeps the good links when only some are bad', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(
      node('t1', [{ target: 'n99', direction: 'FROM' }, { target: 'n1', direction: 'FROM' }]),
    )
    expect(chunk!.edges).toHaveLength(1)
    expect(problems).toHaveLength(1)
  })

  it('drops self links, duplicate edges and reused temp ids', () => {
    const builder = createGhostChunkBuilder(idMap)
    const dup = builder.addElement(
      node('t1', [
        { target: 't1', direction: 'FROM' },
        { target: 'n1', direction: 'FROM' },
        { target: 'n1', direction: 'FROM' },
      ]),
    )
    expect(dup.chunk!.edges).toHaveLength(1)
    expect(dup.problems).toHaveLength(2)

    expect(builder.addElement(node('t1', [{ target: 'n1', direction: 'FROM' }])).chunk).toBeNull()
    expect(builder.addElement(frame('f1')).problems).toEqual([])
    expect(builder.addElement(frame('f1')).problems).toHaveLength(1)
  })

  it('a dropped node can not be linked to later', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [])) // orphan, dropped
    expect(builder.addElement(node('t2', [{ target: 't1', direction: 'FROM' }])).chunk).toBeNull()
  })

  it('rejects an element with the wrong shape', () => {
    const builder = createGhostChunkBuilder(idMap)
    expect(builder.addElement({ kind: 'node', temp_id: 'x', content: '', links: [] }).chunk).toBeNull()
    expect(builder.addElement({ kind: 'banana' }).chunk).toBeNull()
  })

  it('accepted() collects every chunk in order', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [{ target: 'n1', direction: 'FROM' }]))
    builder.addElement(node('t2', [{ target: 't1', direction: 'TO' }]))
    expect(builder.accepted().nodes).toHaveLength(2)
    expect(builder.accepted().edges).toHaveLength(2)
  })
})
