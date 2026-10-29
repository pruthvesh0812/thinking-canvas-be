import { describe, expect, it, vi } from 'vitest'
import type { AgentRun, Canvas, Node, Session } from '../../types/index.js'
import { handleAgentRun, type AgentRunDeps } from './agent-run-handler.js'

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}` // valid uuids for the zod schema
const CANVAS = U(1), SESSION = U(2), NODE = U(3), ENTRY = U(4)

const body = (over: Record<string, unknown> = {}) => ({
  canvas_id: CANVAS, session_id: SESSION, agent: 'expander', focus_node_ids: [NODE],
  source: { type: 'node', id: NODE }, ...over,
})

function makeDeps(over: Partial<AgentRunDeps> = {}): AgentRunDeps {
  return {
    getCanvas: async () => ({ id: CANVAS, user_id: 'u1' }) as Canvas,
    getSession: async () => ({ id: SESSION, canvas_id: CANVAS }) as Session,
    getTierByUser: async () => 'free',
    getAvailableAgents: () => ['expander', 'stress_tester', 'observer', 'general'],
    getNodesByIds: async ids => ids.map(id => ({ id, canvas_id: CANVAS }) as Node),
    getInvokingEntryText: async () => 'some note',
    canAgentFire: async () => true,
    createRun: vi.fn(async () => ({ id: 'run-1' }) as AgentRun),
    sendRunRequested: vi.fn(async () => {}),
    ...over,
  }
}

describe('handleAgentRun', () => {
  it('good request: creates the run, sends the event, answers 202 with run_id', async () => {
    const deps = makeDeps()
    const result = await handleAgentRun(body(), deps)

    expect(result).toEqual({ status: 202, body: { run_id: 'run-1' } })
    expect(deps.createRun).toHaveBeenCalledWith({
      canvas_id: CANVAS, session_id: SESSION, agent: 'expander', focus_node_ids: [NODE], source_type: 'node', source_id: NODE,
    })
    expect(deps.sendRunRequested).toHaveBeenCalledWith({ run_id: 'run-1', canvas_id: CANVAS, agent: 'expander' })
  })

  it('400 for a malformed payload, and nothing is created', async () => {
    const deps = makeDeps()
    const result = await handleAgentRun({ canvas_id: 'nope' }, deps)
    expect(result.status).toBe(400)
    expect(deps.createRun).not.toHaveBeenCalled()
  })

  it('400 for an agent that is not in the request contract (observer has its own route)', async () => {
    expect((await handleAgentRun(body({ agent: 'observer' }), makeDeps())).status).toBe(400)
  })

  it('501 for agents not built yet', async () => {
    expect((await handleAgentRun(body({ agent: 'stress_tester' }), makeDeps())).status).toBe(501)
  })

  it('404 when the canvas or session does not exist', async () => {
    const deps = makeDeps({ getCanvas: async () => { throw new Error('not found') } })
    expect((await handleAgentRun(body(), deps)).status).toBe(404)
  })

  it('400 when the session belongs to another canvas', async () => {
    const deps = makeDeps({ getSession: async () => ({ id: SESSION, canvas_id: U(9) }) as Session })
    expect((await handleAgentRun(body(), deps)).status).toBe(400)
  })

  it('403 when the tier does not allow the agent (enforced server side)', async () => {
    const deps = makeDeps({ getAvailableAgents: () => [] })
    expect((await handleAgentRun(body(), deps)).status).toBe(403)
  })

  it('400 when a focus node is on another canvas, missing or set aside', async () => {
    const deps = makeDeps({ getNodesByIds: async ids => ids.map(id => ({ id, canvas_id: U(9) }) as Node) })
    const result = await handleAgentRun(body(), deps)
    expect(result.status).toBe(400)
    expect(deps.createRun).not.toHaveBeenCalled()
  })

  it('400 when there is no focus', async () => {
    expect((await handleAgentRun(body({ focus_node_ids: [] }), makeDeps())).status).toBe(400)
  })

  it('context_entry source: needs a live, linked note', async () => {
    const source = { type: 'context_entry', id: ENTRY }
    expect((await handleAgentRun(body({ source }), makeDeps())).status).toBe(202)
    expect((await handleAgentRun(body({ source }), makeDeps({ getInvokingEntryText: async () => null }))).status).toBe(400)
  })

  it('400 when the source node is not on this canvas', async () => {
    const other = U(5)
    const deps = makeDeps({
      getNodesByIds: async ids => ids.map(id => ({ id, canvas_id: id === other ? U(9) : CANVAS }) as Node),
    })
    expect((await handleAgentRun(body({ source: { type: 'node', id: other } }), deps)).status).toBe(400)
  })

  it('409 when canAgentFire says no, and nothing is created', async () => {
    const deps = makeDeps({ canAgentFire: async () => false })
    const result = await handleAgentRun(body(), deps)
    expect(result.status).toBe(409)
    expect(deps.createRun).not.toHaveBeenCalled()
    expect(deps.sendRunRequested).not.toHaveBeenCalled()
  })
})
