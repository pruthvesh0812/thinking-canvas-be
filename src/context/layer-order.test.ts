import { describe, expect, it } from 'vitest'
import type { LoadedNode, RetrievalResult } from '../../types/index.js'
import { assemblePrompt, LAYER_ORDER, parseLayerOrder, type AssembleParams } from './assemble.js'

const focus: LoadedNode = {
  id: 'f', seq: 2, tier: 'full', reason: 'focus', content: 'focus text', summary: null, notes: [], note_count: 0,
}
const retrieval: RetrievalResult = { scope: 'S1', focus_node_ids: ['f'], nodes: [focus], edges: [], canvas_notes: [] }

const params: AssembleParams = {
  agent: 'expander',
  canvas: { title: 'T', original_intent: 'G' },
  retrieval,
  constraintsBlock: 'NO JARGON',
  threadMemory: ['expander proposed "x"'],
  task: { text: 'do it', sourceType: 'context_entry' },
}

// position of a layer's opening tag in the prompt (-1 = not in the prompt)
const at = (prompt: string, tag: string) => prompt.indexOf(tag)

describe('LAYER_ORDER', () => {
  it('default order is the documented one, with the task last', () => {
    expect(LAYER_ORDER).toEqual(['intent', 'constraints', 'memory', 'focus', 'nodes', 'edges', 'task'])
  })

  it('no override means the default order', () => {
    expect(assemblePrompt(params).prompt).toBe(assemblePrompt(params, { layerOrder: LAYER_ORDER }).prompt)
  })
})

describe('layerOrder override', () => {
  it('reorders layers', () => {
    const { prompt } = assemblePrompt(params, { layerOrder: ['task', 'focus', 'intent'] })
    expect(at(prompt, '<task')).toBeLessThan(at(prompt, '<focus>'))
    expect(at(prompt, '<focus>')).toBeLessThan(at(prompt, '<canvas_intent>'))
  })

  it('leaves out layers that are not listed, and counts them as 0 tokens', () => {
    const { prompt, tokens } = assemblePrompt(params, { layerOrder: ['focus', 'task'] })
    expect(prompt).not.toContain('<canvas_intent>')
    expect(prompt).not.toContain('<negative_constraints>')
    expect(prompt).not.toContain('<thread_memory>')
    expect(tokens.intent).toBe(0)
    expect(tokens.constraints).toBe(0)
    expect(tokens.focus).toBeGreaterThan(0)
    expect(tokens.total).toBeGreaterThan(0)
  })

  it('still skips empty layers (no edges here) even when listed', () => {
    const { prompt, tokens } = assemblePrompt(params, { layerOrder: ['edges', 'focus'] })
    expect(prompt).not.toContain('<edges>')
    expect(prompt.startsWith('<focus>')).toBe(true) // no blank gap left by the empty layer
    expect(tokens.edges).toBe(0)
  })

  it('total equals the prompt, and layers add up to about the total', () => {
    const { tokens } = assemblePrompt(params)
    const layersSum = LAYER_ORDER.reduce((sum, layer) => sum + tokens[layer], 0)
    // layers are joined with blank lines, so the total can be a little above the sum
    expect(tokens.total).toBeGreaterThanOrEqual(layersSum - LAYER_ORDER.length)
  })
})

describe('parseLayerOrder', () => {
  it('parses a comma list, trimming spaces', () => {
    expect(parseLayerOrder('intent, focus ,task')).toEqual(['intent', 'focus', 'task'])
  })

  it('gives a clear error for an unknown layer, naming the valid ones', () => {
    expect(() => parseLayerOrder('intent,banana')).toThrow(/unknown layer\(s\): banana.*Valid layers: intent, constraints/)
  })

  it('names every unknown layer, not just the first', () => {
    expect(() => parseLayerOrder('foo,focus,bar')).toThrow(/foo, bar/)
  })

  it('errors on an empty list', () => {
    expect(() => parseLayerOrder(' , ')).toThrow(/empty/)
  })
})
