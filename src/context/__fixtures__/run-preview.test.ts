import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HUB_FULLTEXT_NEIGHBORS } from '../settings.js'
import { loadFixture, parseFixture } from './load-fixture.js'
import { buildPreview } from './run-preview.js'

// Runs the real JSON fixture through the real retrieval + assembly, like the CLI does.
const pricing = JSON.parse(readFileSync('scripts/fixtures/pricing-canvas.json', 'utf8'))

async function preview(raw: unknown, layerOrder?: Parameters<typeof buildPreview>[0]['options']) {
  const loaded = loadFixture(raw)
  return buildPreview({
    canvasId: 'preview',
    source: loaded.source,
    focusNodeIds: loaded.focusNodeIds,
    excludeEntryId: loaded.excludeEntryId,
    assembleBase: loaded.assembleBase,
    options: layerOrder,
  })
}

describe('fixture -> preview', () => {
  it('the shipped pricing fixture builds a prompt with the expected behaviour', async () => {
    const result = await preview(pricing)
    expect(result.prompt).toContain('Usage-based billing via Stripe metered plans')
    expect(result.prompt).toContain('Heavy API users make up 70% of revenue') // note on focus
    expect(result.prompt).toContain('Launch is in Q1')                         // canvas note
    expect(result.prompt).toContain('n4 -"contradicts"-> n2')                  // edge label
    expect(result.prompt).not.toContain('old AI idea')                         // set-aside node hidden
    expect(result.prompt).not.toContain('set-aside node: must never')          // note on a set-aside node hidden
    expect(result.prompt).not.toContain('Flat annual license')                 // sibling, not S1
    expect(result.prompt).not.toContain('Hire a designer')                     // unrelated
    expect(result.prompt).toContain('The request is the text of node n2.')     // node-sourced task
    expect(result.tokens.total).toBeGreaterThan(0)
  })

  it('the layer override reaches the real assembly', async () => {
    const result = await preview(pricing, { layerOrder: ['task', 'focus'] })
    expect(result.prompt.startsWith('<task')).toBe(true)
    expect(result.tokens.intent).toBe(0)
  })

  it('an invoking note is shown in the task and left out of its node', async () => {
    const raw = {
      ...pricing,
      task: { text: 'Heavy API users make up 70% of revenue', sourceType: 'context_entry' },
      notes: pricing.notes.map((n: { text: string }) => (n.text.startsWith('Heavy') ? { ...n, invoking: true } : n)),
    }
    const { prompt } = await preview(raw)
    expect(prompt.match(/Heavy API users make up 70% of revenue/g)).toHaveLength(1)
  })

  it('hub guard shows up: neighbours past the limit become titles', async () => {
    const total = HUB_FULLTEXT_NEIGHBORS + 3
    const nodes = [{ id: 'n1', text: 'hub', summary: 'hub' }]
    const edges = []
    for (let i = 0; i < total; i++) {
      nodes.push({ id: `n${i + 2}`, text: `child ${i}`, summary: `child ${i}` })
      edges.push({ from: 'n1', to: `n${i + 2}` })
    }
    const result = await preview({ focus: ['n1'], nodes, edges })
    expect(result.loadedNodes.filter(n => n.tier === 'title')).toHaveLength(3)
  })

  it('retrieval failure surfaces as an error (focus node is set aside)', async () => {
    const raw = { focus: ['n1'], nodes: [{ id: 'n1', text: 'x', setAside: true }] }
    await expect(preview(raw)).rejects.toThrow(/none of the focus nodes/)
  })
})

describe('fixture validation', () => {
  it('lists every problem at once', () => {
    expect(() => loadFixture({ focus: ['n9'], nodes: [{ id: 'n1', text: 'a' }], notes: [{ on: 'zzz', text: 'hello' }] }))
      .toThrow(/focus "n9" is not in nodes[\s\S]*is on "zzz"/)
  })

  it('rejects a bad node id and an empty focus', () => {
    expect(() => parseFixture({ focus: [], nodes: [{ id: 'node-2', text: 'a' }] })).toThrow(/focus needs at least one node[\s\S]*must look like n12/)
  })

  it('needs sourceNode when the task comes from a node', () => {
    expect(() => loadFixture({ focus: ['n1'], nodes: [{ id: 'n1', text: 'a' }], task: { sourceType: 'node' } })).toThrow(/sourceNode is missing/)
  })

  it('an edge note must point at an existing edge', () => {
    expect(() => loadFixture({ focus: ['n1'], nodes: [{ id: 'n1', text: 'a' }, { id: 'n2', text: 'b' }], notes: [{ on: 'edge:n1>n2', text: 'x' }] }))
      .toThrow(/edge "n1>n2", which does not exist/)
  })
})
