import { describe, expect, it, vi } from 'vitest'
import type { AgentThread, Canvas, Node } from '../../types/index.js'
import { loadRealCanvas, type RealCanvasDeps } from './real-canvas.js'

// All database access is faked: this tests the logic that wires real data into a preview.
const canvas = { id: 'c1', title: 'Real canvas', original_intent: 'Real goal' } as Canvas
const focusNode = { id: 'node-uuid', content: '@expander dig deeper' } as Node
const threads: AgentThread[] = [{
  id: 't', canvas_id: 'c1', agent_role: 'expander', active_rejection_insight_ids: [], updated_at: '',
  messages: [{
    role: 'assistant', turn_type: 'ghost_structure', content: 'an idea', timestamp: '2026-01-01T00:00:01Z',
    ghost_structure: { run_id: 'r', focus_node_ids: [], structure: { frames: [], nodes: [], edges: [] }, status: 'accepted' },
  }],
}]

function fakeDeps(over: Partial<RealCanvasDeps> = {}): RealCanvasDeps {
  return {
    getCanvas: vi.fn(async () => canvas),
    createSource: vi.fn(() => ({ getNodes: async () => [], getEdgesTouching: async () => [], getNotes: async () => ({ byNode: new Map(), byEdge: new Map(), canvas: [] }) })),
    getThreads: vi.fn(async () => threads),
    getConstraints: vi.fn(async () => 'NEGATIVE CONSTRAINTS: x'),
    getNodes: vi.fn(async () => [focusNode]),
    getEntryText: vi.fn(async () => 'text of the note'),
    ...over,
  }
}

const base = { canvasId: 'c1', focusNodeIds: ['node-uuid'], agent: 'expander' as const, sourceNode: false }

describe('loadRealCanvas', () => {
  it('builds canvas intent, thread memory and constraints from real data', async () => {
    const deps = fakeDeps()
    const result = await loadRealCanvas(base, deps)

    expect(result.assembleBase.canvas).toEqual({ title: 'Real canvas', original_intent: 'Real goal' })
    expect(result.assembleBase.threadMemory).toEqual(['expander proposed "an idea" -> accepted'])
    expect(result.assembleBase.constraintsBlock).toBe('NEGATIVE CONSTRAINTS: x')
    expect(deps.getConstraints).toHaveBeenCalledWith('c1', 'expander')
    expect(result.focusNodeIds).toEqual(['node-uuid'])
  })

  it('no --source-node / --entry: the agent default task is used', async () => {
    const result = await loadRealCanvas(base, fakeDeps())
    expect(result.assembleBase.task).toEqual({ text: null, sourceType: 'context_entry' })
    expect(result.excludeEntryId).toBeUndefined()
  })

  it('--source-node: the focus node text is the request', async () => {
    const result = await loadRealCanvas({ ...base, sourceNode: true }, fakeDeps())
    expect(result.assembleBase.task).toEqual({ text: '@expander dig deeper', sourceType: 'node', sourceNodeId: 'node-uuid' })
  })

  it('--entry: the note text is the request and that note is left out of its node', async () => {
    const deps = fakeDeps()
    const result = await loadRealCanvas({ ...base, entryId: 'entry-1' }, deps)
    expect(deps.getEntryText).toHaveBeenCalledWith('c1', 'entry-1')
    expect(result.assembleBase.task).toEqual({ text: 'text of the note', sourceType: 'context_entry' })
    expect(result.excludeEntryId).toBe('entry-1')
  })

  it('errors clearly when the note is missing, deleted or on another canvas', async () => {
    const deps = fakeDeps({ getEntryText: vi.fn(async () => null) })
    await expect(loadRealCanvas({ ...base, entryId: 'gone' }, deps)).rejects.toThrow(/--entry: note gone not found/)
  })

  it('errors clearly when the source node is missing or set aside', async () => {
    const deps = fakeDeps({ getNodes: vi.fn(async () => []) })
    await expect(loadRealCanvas({ ...base, sourceNode: true }, deps)).rejects.toThrow(/--source-node: node node-uuid not found/)
  })

  it('refuses --source-node together with --entry', async () => {
    await expect(loadRealCanvas({ ...base, sourceNode: true, entryId: 'e' }, fakeDeps())).rejects.toThrow(/either --source-node or --entry/)
  })
})
