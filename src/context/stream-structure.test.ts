import { describe, expect, it } from 'vitest'
import { createIdMap } from './ids.js'
import { consumeGhostStream, type PartialModelOutput } from './stream-structure.js'
import type { GhostChunk } from './ghost-output.js'

const idMap = createIdMap([{ id: 'uuid-1', seq: 1 }])

const node = (temp_id: string, target: string, direction: 'FROM' | 'TO' = 'FROM') =>
  ({ kind: 'node', temp_id, content: `text ${temp_id}`, links: [{ target, direction }] })

// A fake model stream: yields the growing list one element at a time, like a real partial stream.
async function* growing(elements: unknown[]): AsyncGenerator<PartialModelOutput> {
  for (let i = 1; i <= elements.length; i++) yield { elements: elements.slice(0, i) }
}

async function run(elements: unknown[], extra: { getFinal?: () => Promise<PartialModelOutput | undefined> } = {}) {
  const chunks: GhostChunk[] = []
  const result = await consumeGhostStream({
    partials: growing(elements),
    idMap,
    onChunk: async chunk => { chunks.push(chunk) },
    ...extra,
  })
  return { chunks, ...result }
}

describe('consumeGhostStream', () => {
  it('sends one chunk per finished element, in order', async () => {
    const { chunks, chunkCount, structure } = await run([node('t1', 'n1'), node('t2', 't1'), node('t3', 't2')])
    expect(chunkCount).toBe(3)
    expect(chunks.map(c => c.nodes[0].content)).toEqual(['text t1', 'text t2', 'text t3'])
    expect(structure.nodes).toHaveLength(3)
    expect(structure.edges).toHaveLength(3)
  })

  it('a chunk goes out BEFORE the stream ends (the user sees it grow)', async () => {
    const seen: string[] = []
    async function* slow(): AsyncGenerator<PartialModelOutput> {
      yield { elements: [node('t1', 'n1')] }
      seen.push('after first partial')
      yield { elements: [node('t1', 'n1'), node('t2', 't1')] } // t1 is final now
      seen.push('after second partial')
    }
    await consumeGhostStream({
      partials: slow(), idMap,
      onChunk: async () => { seen.push('chunk') },
    })
    // first chunk is published while the stream is still going
    expect(seen.indexOf('chunk')).toBeLessThan(seen.indexOf('after second partial'))
  })

  it('a single-element answer is sent as one chunk at the end', async () => {
    const { chunkCount } = await run([node('t1', 'n1')])
    expect(chunkCount).toBe(1)
  })

  it('a frame arrives whole in one chunk', async () => {
    const frame = { kind: 'frame', content: 'two options', nodes: [node('t1', 'n1'), node('t2', 'n1')] }
    const { chunks } = await run([frame])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].frames).toHaveLength(1)
    expect(chunks[0].nodes).toHaveLength(2)
  })

  it('half-written last element is not used until final (uses getFinal when given)', async () => {
    async function* partials(): AsyncGenerator<PartialModelOutput> {
      yield { elements: [{ kind: 'node', temp_id: 't1', content: 'te' }] } // half written
    }
    const chunks: GhostChunk[] = []
    const result = await consumeGhostStream({
      partials: partials(), idMap,
      getFinal: async () => ({ elements: [node('t1', 'n1')] }),
      onChunk: async chunk => { chunks.push(chunk) },
    })
    expect(result.chunkCount).toBe(1)
    expect(chunks[0].nodes[0].content).toBe('text t1')
  })

  it('collects errors for dropped elements and keeps the good ones', async () => {
    const { chunkCount, errors } = await run([node('t1', 'n99'), node('t2', 'n1')])
    expect(chunkCount).toBe(1)
    expect(errors.join(' ')).toMatch(/unknown id n99/)
  })

  it('everything invalid: zero chunks and errors to retry with', async () => {
    const { chunkCount, errors } = await run([node('t1', 'n99')])
    expect(chunkCount).toBe(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('empty answer is an error', async () => {
    const { chunkCount, errors } = await run([])
    expect(chunkCount).toBe(0)
    expect(errors).toContain('the model returned no elements')
  })

  it('an error thrown by onChunk (e.g. Redis down) stops the run and surfaces', async () => {
    await expect(consumeGhostStream({
      partials: growing([node('t1', 'n1'), node('t2', 't1')]), idMap,
      onChunk: async () => { throw new Error('redis down') },
    })).rejects.toThrow('redis down')
  })
})
