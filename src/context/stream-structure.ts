// Reads the model's streamed answer and turns it into ghost chunks, one by one.
// Pure: no Redis, no database, no model. The caller gives us the stream and says what to do
// with each chunk (publish it). That keeps this testable with a fake stream.
//
// What happens:
//   1. the model streams a growing { elements: [...] } object
//   2. every time an element is finished (the next one started) we check it and build a chunk
//   3. each good chunk goes to onChunk right away, so the user sees the structure grow
//   4. at the end we hand back everything accepted + the errors we hit

import type { GhostStructure } from '../../types/index.js'
import { createGhostChunkBuilder, createNodeEmitter, type GhostChunk } from './ghost-output.js'
import type { IdMap } from './ids.js'

// What the stream gives us. Items may be half-written, that is why we hold the last one back.
export type PartialModelOutput = { elements?: unknown[] }

export type ConsumeResult = {
  // everything accepted, in order. Saved on the thread when the run ends.
  structure: GhostStructure
  // why elements were dropped (also used as the hint for a retry)
  errors: string[]
  // how many chunks were sent. 0 = the user saw nothing
  chunkCount: number
}

export async function consumeGhostStream(params: {
  partials: AsyncIterable<PartialModelOutput>
  // The complete final object, when the stream source offers one. If missing we use the last partial.
  getFinal?: () => Promise<PartialModelOutput | undefined>
  idMap: IdMap
  onChunk: (chunk: GhostChunk) => Promise<void>
}): Promise<ConsumeResult> {
  const { partials, getFinal, idMap, onChunk } = params

  const emitter = createNodeEmitter()
  const builder = createGhostChunkBuilder(idMap)
  const errors: string[] = []
  let chunkCount = 0
  let lastElements: unknown[] = []

  // check one finished element, send its chunk if it is good
  async function handle(element: unknown) {
    const { chunk, errors: elementErrors } = builder.addElement(element)
    errors.push(...elementErrors)
    if (chunk) {
      chunkCount++
      await onChunk(chunk)
    }
  }

  // ── 1. while streaming: handle every element that just became final ──
  for await (const partial of partials) {
    lastElements = partial.elements ?? []
    for (const element of emitter.feed(lastElements)) await handle(element)
  }

  // ── 2. stream over: the last element is final too ──
  const final = getFinal ? await getFinal() : undefined
  const finalElements = final?.elements ?? lastElements
  for (const element of emitter.finish(finalElements)) await handle(element)

  // ── 3. an answer with no elements at all is an error too (nothing for the user) ──
  if (finalElements.length === 0) errors.push('the model returned no elements')

  return { structure: builder.accepted(), errors, chunkCount }
}
