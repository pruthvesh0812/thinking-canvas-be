import { describe, expect, it } from 'vitest'
import { EXPANDER_SYSTEM_PROMPT } from './expander.js'
import { createGhostChunkBuilder, modelOutputSchema } from '../context/ghost-output.js'
import { createIdMap } from '../context/ids.js'

// The prompt shows the model example answers. If the schema or the builder rules change and the
// examples no longer match, the model is being taught a wrong format. This test catches that.
describe('EXPANDER_SYSTEM_PROMPT examples', () => {
  // every `{ "elements": [ ... ] }` block in the prompt
  const examples = [...EXPANDER_SYSTEM_PROMPT.matchAll(/\{ "elements": \[[\s\S]*?\n\] \}/g)].map(m => JSON.parse(m[0]))
  const idMap = createIdMap([{ id: 'uuid-2', seq: 2 }]) // the examples all hang off n2

  it('contains the three examples', () => {
    expect(examples).toHaveLength(3)
  })

  it.each([0, 1, 2])('example %i matches the schema and is accepted whole by the builder', index => {
    const parsed = modelOutputSchema.safeParse(examples[index])
    expect(parsed.success).toBe(true)

    const builder = createGhostChunkBuilder(idMap)
    for (const element of examples[index].elements) {
      const { chunk, errors } = builder.addElement(element)
      expect(errors).toEqual([]) // nothing dropped
      expect(chunk).not.toBeNull()
    }
  })

  it('the prompt carries no user-input placeholders (system prompt is a constant)', () => {
    expect(EXPANDER_SYSTEM_PROMPT).not.toMatch(/\$\{/)
  })
})
