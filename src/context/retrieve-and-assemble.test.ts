import { describe, expect, it } from 'vitest'
import { retrieveS1 } from './retrieve-s1.js'
import { assemblePrompt } from './assemble.js'
import { createIdMap } from './ids.js'
import { createPricingCanvas } from './__fixtures__/pricing-canvas.js'

// End to end on the sample canvas: retrieve (S1) -> assemble -> what the agent reads.
describe('S1 retrieve + assemble on the pricing canvas', () => {
  const { canvas, source } = createPricingCanvas()

  async function promptFor(task: { text: string | null; sourceType: 'context_entry' | 'node'; sourceNodeId?: string }, excludeEntryId?: string) {
    const retrieval = await retrieveS1(source(), { canvasId: 'c1', focusNodeIds: ['n2-id'], excludeEntryId })
    return { retrieval, ...assemblePrompt({ agent: 'expander', canvas, retrieval, constraintsBlock: '', threadMemory: [], task }) }
  }

  it('loads the focus, its direct neighbours and the parent chain, and nothing else', async () => {
    const { retrieval } = await promptFor({ text: 'dig deeper', sourceType: 'context_entry' })
    expect(retrieval.nodes.map(n => [n.seq, n.reason, n.tier])).toEqual([
      [2, 'focus', 'full'],
      [5, 'hop1', 'full'],      // newest neighbours first: n5 was created after n4
      [4, 'hop1', 'full'],
      [1, 'hop1', 'full'],      // n1 is the parent, so also a direct neighbour
    ])
    // sibling n3, unrelated n7 and the set-aside n6 are all absent
    expect(retrieval.nodes.some(n => [3, 6, 7].includes(n.seq))).toBe(false)
  })

  it('the prompt contains the right notes and hides the wrong ones', async () => {
    const { prompt } = await promptFor({ text: 'dig deeper', sourceType: 'context_entry' })
    expect(prompt).toContain('Heavy API users make up 70% of revenue')        // note on focus
    expect(prompt).toContain('Finance wants predictable monthly bills')        // second note, oldest first
    expect(prompt.indexOf('Heavy API')).toBeLessThan(prompt.indexOf('Finance wants'))
    expect(prompt).toContain('Sample was only 12 customers')                   // note on an edge
    expect(prompt).toContain('Launch is in Q1, budget is tight')               // canvas note
    expect(prompt).not.toContain('Deleted by the user')                        // deleted note
    expect(prompt).not.toContain('Note on the set-aside node')                 // note on a set-aside node
    expect(prompt).not.toContain('old AI idea the user set aside')             // set-aside node itself
  })

  it('edges read with their labels', async () => {
    const { prompt } = await promptFor({ text: 'x', sourceType: 'context_entry' })
    expect(prompt).toContain('n4 -"contradicts"-> n2')
    expect(prompt).toContain('n2 -"needs"-> n5')
    expect(prompt).toContain('n1 --> n2')
  })

  it('an invoking context entry shows in the task layer only, not inside its node', async () => {
    // note-1 is the entry that said "@expander ..." in this scenario
    const { prompt } = await promptFor({ text: 'Heavy API users make up 70% of revenue', sourceType: 'context_entry' }, 'note-1')
    const afterFocus = prompt.slice(prompt.indexOf('<focus>'), prompt.indexOf('</focus>'))
    expect(afterFocus).not.toContain('Heavy API users')
    expect(prompt.match(/Heavy API users make up 70% of revenue/g)).toHaveLength(1)
    expect(prompt).toContain('<task agent="expander" scope="S1">')
  })

  it('the id map accepts exactly the nodes in the prompt', async () => {
    const { shownNodes } = await promptFor({ text: 'x', sourceType: 'context_entry' })
    const idMap = createIdMap(shownNodes)
    expect(idMap.uuidFor('n5')).toBe('n5-id')
    expect(idMap.uuidFor('n3')).toBeNull() // exists on the canvas but was not shown
    expect(idMap.uuidFor('n6')).toBeNull() // set aside
  })
})
