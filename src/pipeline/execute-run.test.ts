import { describe, expect, it, vi } from 'vitest'
import type { AgentRun, AgentThread } from '../../types/index.js'
import { createPricingCanvas } from '../context/__fixtures__/pricing-canvas.js'
import type { PartialModelOutput } from '../context/stream-structure.js'
import { executeAgentRun, type ExecuteRunDeps } from './execute-run.js'

const pricing = createPricingCanvas()

const run: AgentRun = {
  id: 'run-1', canvas_id: 'c1', session_id: 'session-1', agent: 'expander', focus_node_ids: ['n2-id'],
  source_type: 'node', source_id: 'n2-id', status: 'queued', scope: null, error: null, thread_id: null,
  created_at: '2026-01-01T00:00:00Z', finished_at: null,
}
const emptyThread: AgentThread = { id: 'thread-1', canvas_id: 'c1', agent_role: 'expander', messages: [], active_rejection_insight_ids: [], updated_at: '' }

// A fake model answer: one node hanging off n2
const goodElements = [{ kind: 'node', temp_id: 't1', content: 'a new idea', links: [{ target: 'n2', direction: 'FROM' }] }]
const badElements = [{ kind: 'node', temp_id: 't1', content: 'points nowhere', links: [{ target: 'n99', direction: 'FROM' }] }]

async function* streamOf(elements: unknown[]): AsyncGenerator<PartialModelOutput> {
  yield { elements }
}

// events: everything that happened, in order, so tests can check the sequence
function makeDeps(answers: unknown[][], over: Partial<ExecuteRunDeps> = {}) {
  const events: string[] = []
  const prompts: string[] = []
  let call = 0

  const deps: ExecuteRunDeps = {
    getRun: async () => ({ ...run }),
    markRunning: async () => { events.push('markRunning') },
    markDone: vi.fn(async () => { events.push('markDone') }),
    markFailed: vi.fn(async () => { events.push('markFailed') }),
    getCanvas: async () => pricing.canvas,
    getAllThreads: async () => [],
    getOrCreateThread: async () => ({ ...emptyThread }),
    appendMessage: vi.fn(async () => { events.push('appendMessage') }),
    getConstraints: async () => 'NEGATIVE CONSTRAINTS: no jargon',
    createSource: () => pricing.source(),
    getInvokingText: async () => '@expander dig deeper',
    streamAgent: async ({ prompt }) => {
      prompts.push(prompt)
      const elements = answers[Math.min(call++, answers.length - 1)]
      return { partials: streamOf(elements), getFinal: async () => ({ elements }) }
    },
    publisher: {
      start: async () => { events.push('start') },
      chunk: async () => { events.push('chunk') },
      done: async () => { events.push('done') },
      error: vi.fn(async () => { events.push('error') }),
    },
    ...over,
  }
  return { deps, events, prompts }
}

describe('executeAgentRun', () => {
  it('good run: start, chunk, save thread turn, save log, done (in that order)', async () => {
    const { deps, events } = makeDeps([goodElements])
    const outcome = await executeAgentRun('run-1', deps)

    expect(outcome.status).toBe('done')
    expect(events).toEqual(['markRunning', 'start', 'chunk', 'appendMessage', 'markDone', 'done'])
  })

  it('saves a pending ghost_structure turn and a full run log', async () => {
    const { deps } = makeDeps([goodElements])
    await executeAgentRun('run-1', deps)

    const turn = (deps.appendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(turn.turn_type).toBe('ghost_structure')
    expect(turn.ghost_structure.status).toBe('pending')
    expect(turn.ghost_structure.focus_node_ids).toEqual(['n2-id'])
    expect(turn.ghost_structure.structure.nodes[0].content).toBe('a new idea')

    const log = (deps.markDone as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(log.scope).toBe('S1')
    expect(log.context_snapshot).toContain('<task agent="expander" scope="S1">')
    expect(log.context_tokens).toBeGreaterThan(0)
    expect(log.referenced_node_ids).toEqual(['n2-id']) // the real node the answer hangs off
    expect(log.loaded_nodes.some((n: { seq: number }) => n.seq === 2)).toBe(true)
    expect(log.thread_id).toBe('thread-1')
  })

  it('the prompt carries the constraints and the node-sourced task', async () => {
    const { deps, prompts } = makeDeps([goodElements])
    await executeAgentRun('run-1', deps)
    expect(prompts[0]).toContain('NEGATIVE CONSTRAINTS: no jargon')
    expect(prompts[0]).toContain('The request is the text of node n2.')
  })

  it('retries ONCE when nothing was usable, showing the model its errors', async () => {
    const { deps, prompts, events } = makeDeps([badElements, goodElements])
    const outcome = await executeAgentRun('run-1', deps)

    expect(outcome.status).toBe('done')
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('<previous_errors>')
    expect(prompts[1]).toContain('unknown id n99')
    expect(events.filter(e => e === 'chunk')).toHaveLength(1) // the user only saw the good answer
  })

  it('fails after two bad answers: failed run, structure_error, nothing saved', async () => {
    const { deps, events } = makeDeps([badElements, badElements])
    const outcome = await executeAgentRun('run-1', deps)

    expect(outcome.status).toBe('failed')
    expect(outcome.reason).toMatch(/validation failed after 2 attempts/)
    expect(events).toEqual(['markRunning', 'start', 'markFailed', 'error'])
    expect(deps.appendMessage).not.toHaveBeenCalled()
    expect(deps.markDone).not.toHaveBeenCalled()
  })

  it('does NOT retry once chunks reached the user (no answer on top of an answer)', async () => {
    // one good node and one bad node in the same answer: user saw a chunk, so it counts as done
    const { deps, prompts } = makeDeps([[...goodElements, { ...badElements[0], temp_id: 't2' }]])
    const outcome = await executeAgentRun('run-1', deps)
    expect(outcome.status).toBe('done')
    expect(prompts).toHaveLength(1)
  })

  it('shows the user a safe message, not the internal error', async () => {
    const { deps } = makeDeps([badElements, badElements])
    await executeAgentRun('run-1', deps)
    const reason = (deps.publisher.error as ReturnType<typeof vi.fn>).mock.calls[0][2]
    expect(reason).toBe('The agent could not produce a usable answer. Please try again.')
    expect(reason).not.toContain('n99')
  })

  it('a model crash fails the run cleanly', async () => {
    const { deps } = makeDeps([goodElements], { streamAgent: async () => { throw new Error('model overloaded') } })
    const outcome = await executeAgentRun('run-1', deps)
    expect(outcome).toEqual({ status: 'failed', reason: 'model overloaded' })
    expect(deps.markFailed).toHaveBeenCalledWith('run-1', 'model overloaded')
  })

  it('fails when the invoking text is gone', async () => {
    const { deps } = makeDeps([goodElements], { getInvokingText: async () => null })
    const outcome = await executeAgentRun('run-1', deps)
    expect(outcome.status).toBe('failed')
    expect(outcome.reason).toMatch(/invoking text is gone/)
  })

  it('fails for an agent whose scope is not built yet', async () => {
    const { deps } = makeDeps([goodElements], { getRun: async () => ({ ...run, agent: 'stress_tester' }) })
    const outcome = await executeAgentRun('run-1', deps)
    expect(outcome.status).toBe('failed')
    expect(outcome.reason).toMatch(/only S1 is built/)
  })

  it('skips a run that is missing or already started (duplicate event)', async () => {
    const missing = makeDeps([goodElements], { getRun: async () => null })
    expect((await executeAgentRun('run-1', missing.deps)).status).toBe('skipped')

    const started = makeDeps([goodElements], { getRun: async () => ({ ...run, status: 'running' }) })
    expect((await executeAgentRun('run-1', started.deps)).status).toBe('skipped')
    expect(started.events).toEqual([]) // nothing happened
  })
})
