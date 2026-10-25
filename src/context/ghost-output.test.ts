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
  const link = (target: string, direction: 'FROM' | 'TO' = 'FROM', label?: string) => ({ target, direction, label })
  const node = (temp_id: string, links: object[]) => ({ kind: 'node', temp_id, content: 'some text', links })
  const frame = (nodes: object[], content = 'how these relate') => ({ kind: 'frame', content, nodes })

  it('single: one node linked from an existing node, n-label swapped for uuid', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(node('t1', [link('n1', 'FROM', ' because ')]))
    expect(problems).toEqual([])
    expect(chunk!.frames).toEqual([])
    expect(chunk!.nodes[0].frame_id).toBeNull()
    expect(chunk!.edges).toEqual([{ from: 'uuid-1', to: chunk!.nodes[0].ghost_id, label: 'because' }])
  })

  it('direction TO points from the new node to the other', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk } = builder.addElement(node('t1', [link('n5', 'TO')]))
    expect(chunk!.edges[0]).toEqual({ from: chunk!.nodes[0].ghost_id, to: 'uuid-5', label: null })
  })

  it('multi: a frame arrives whole, in ONE chunk, every node pointing at the frame', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(
      frame([node('t1', [link('n1')]), node('t2', [link('n1')])]),
    )
    expect(problems).toEqual([])
    expect(chunk!.frames).toHaveLength(1)
    expect(chunk!.nodes).toHaveLength(2)
    expect(chunk!.edges).toHaveLength(2)
    expect(chunk!.nodes.every(n => n.frame_id === chunk!.frames[0].ghost_id)).toBe(true)
  })

  it('a node inside a frame can link to an earlier node of the same frame', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk } = builder.addElement(frame([node('t1', [link('n1')]), node('t2', [link('t1')])]))
    expect(chunk!.edges[1].from).toBe(chunk!.nodes[0].ghost_id)
  })

  it('frame with only one valid node is dissolved, the node is kept free standing', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(
      frame([node('t1', [link('n1')]), node('t2', [link('n99')])]),
    )
    expect(chunk!.frames).toEqual([])
    expect(chunk!.nodes).toHaveLength(1)
    expect(chunk!.nodes[0].frame_id).toBeNull()
    expect(problems.join(' ')).toMatch(/frame removed/)
  })

  it('frame with no valid nodes sends nothing', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk } = builder.addElement(frame([node('t1', [link('n99')]), node('t2', [link('n98')])]))
    expect(chunk).toBeNull()
    expect(builder.accepted().frames).toEqual([])
  })

  it('a frame needs at least 2 nodes in the model output', () => {
    const builder = createGhostChunkBuilder(idMap)
    expect(builder.addElement(frame([node('t1', [link('n1')])])).chunk).toBeNull()
  })

  it('hierarchy: a later node links FROM an earlier accepted one', () => {
    const builder = createGhostChunkBuilder(idMap)
    const first = builder.addElement(node('t1', [link('n1')])).chunk!
    const second = builder.addElement(node('t2', [link('t1')])).chunk!
    expect(second.edges[0].from).toBe(first.nodes[0].ghost_id)
  })

  it('converge: one node with two FROM links gets two edges into it', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(frame([node('t1', [link('n1')]), node('t2', [link('n1')])]))
    const { chunk } = builder.addElement(node('t3', [link('t1'), link('t2')]))
    expect(chunk!.edges).toHaveLength(2)
    expect(chunk!.edges[0].to).toBe(chunk!.edges[1].to)
  })

  it('drops unknown ids instead of guessing; node with no valid link is dropped', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(node('t1', [link('n99')]))
    expect(chunk).toBeNull()
    expect(problems.join(' ')).toMatch(/unknown id n99/)
  })

  it('keeps the good links when only some are bad', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk, problems } = builder.addElement(node('t1', [link('n99'), link('n1')]))
    expect(chunk!.edges).toHaveLength(1)
    expect(problems).toHaveLength(1)
  })

  it('drops self links, duplicate edges and reused temp ids', () => {
    const builder = createGhostChunkBuilder(idMap)
    const dup = builder.addElement(node('t1', [link('t1'), link('n1'), link('n1')]))
    expect(dup.chunk!.edges).toHaveLength(1)
    expect(dup.problems).toHaveLength(2)
    expect(builder.addElement(node('t1', [link('n1')])).chunk).toBeNull()
  })

  it('a dropped node can not be linked to later', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [])) // orphan, dropped
    expect(builder.addElement(node('t2', [link('t1')])).chunk).toBeNull()
  })

  it('rejects an element with the wrong shape', () => {
    const builder = createGhostChunkBuilder(idMap)
    expect(builder.addElement({ kind: 'node', temp_id: 'x', content: '', links: [] }).chunk).toBeNull()
    expect(builder.addElement({ kind: 'banana' }).chunk).toBeNull()
  })

  it('accepted() collects every chunk in order', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [link('n1')]))
    builder.addElement(frame([node('t2', [link('t1', 'TO')]), node('t3', [link('n1')])]))
    expect(builder.accepted().nodes).toHaveLength(3)
    expect(builder.accepted().edges).toHaveLength(3)
    expect(builder.accepted().frames).toHaveLength(1)
  })

  it('depth: first level is 1, each step further adds 1', () => {
    const builder = createGhostChunkBuilder(idMap)
    const t1 = builder.addElement(node('t1', [link('n1')])).chunk!.nodes[0]
    const t2 = builder.addElement(node('t2', [link('t1')])).chunk!.nodes[0]
    const t3 = builder.addElement(node('t3', [link('t2')])).chunk!.nodes[0]
    expect([t1.depth, t2.depth, t3.depth]).toEqual([1, 2, 3])
  })

  it('depth: a TO link counts too (child written later, pointing at the earlier node)', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [link('n1')]))
    const t2 = builder.addElement(node('t2', [link('t1', 'TO')])).chunk!.nodes[0]
    expect(t2.depth).toBe(2)
  })

  it('depth: converging node takes the shorter path', () => {
    const builder = createGhostChunkBuilder(idMap)
    builder.addElement(node('t1', [link('n1')])) // depth 1
    builder.addElement(node('t2', [link('t1')])) // depth 2
    const t3 = builder.addElement(node('t3', [link('t2'), link('t1')])).chunk!.nodes[0]
    expect(t3.depth).toBe(2)
  })

  it('depth: nodes inside one frame, all linked from the anchor, are all depth 1', () => {
    const builder = createGhostChunkBuilder(idMap)
    const { chunk } = builder.addElement(frame([node('t1', [link('n1')]), node('t2', [link('n5')])]))
    expect(chunk!.nodes.map(n => n.depth)).toEqual([1, 1])
  })
})
