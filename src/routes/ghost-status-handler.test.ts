import { describe, expect, it, vi } from 'vitest'
import type { AgentThread, GhostNodeStatus, GhostStructure } from '../../types/index.js'
import { handleGhostStatus, type GhostStatusDeps } from './ghost-status-handler.js'

const U = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const CANVAS = U(1), SESSION = U(2), THREAD = U(3)
const A = U(10), A1 = U(11), B = U(12) // ghost ids

// anchor ──▶ A ──▶ A1     anchor ──▶ B
const structure: GhostStructure = {
  frames: [],
  nodes: [
    { ghost_id: A, content: 'idea A', frame_id: null, depth: 1 },
    { ghost_id: A1, content: 'detail of A', frame_id: null, depth: 2 },
    { ghost_id: B, content: 'idea B', frame_id: null, depth: 1 },
  ],
  edges: [
    { from: U(50), to: A, label: null },
    { from: A, to: A1, label: null },
    { from: U(50), to: B, label: null },
  ],
}

const threadWith = (node_status?: Record<string, GhostNodeStatus>, canvas_id = CANVAS): AgentThread => ({
  id: THREAD, canvas_id, agent_role: 'expander', active_rejection_insight_ids: [], updated_at: '',
  messages: [{
    role: 'assistant', turn_type: 'ghost_structure', content: 'x', timestamp: '2026-01-01T00:00:00Z',
    ghost_structure: { run_id: 'r', focus_node_ids: [], structure, node_status, status: 'pending' },
  }],
})

const body = (over: Record<string, unknown> = {}) => ({
  thread_id: THREAD, turn_index: 0, canvas_id: CANVAS, session_id: SESSION, ghost_id: A,
  status: 'accepted', interacted_at: 1, ...over,
})

function makeDeps(thread: AgentThread | null = threadWith()): GhostStatusDeps & { saveDecision: ReturnType<typeof vi.fn>; sendRejected: ReturnType<typeof vi.fn> } {
  return { getThread: async () => thread, saveDecision: vi.fn(async () => {}), sendRejected: vi.fn(async () => {}) }
}

describe('handleGhostStatus', () => {
  it('accept: saves the node status and answers with the new turn status', async () => {
    const deps = makeDeps()
    const result = await handleGhostStatus(body(), deps)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ ok: true, turn_status: 'pending', changed: [{ ghost_id: A, status: 'accepted' }] })
    expect(deps.saveDecision).toHaveBeenCalledWith(THREAD, 0, expect.objectContaining({ status: 'pending' }))
    expect(deps.sendRejected).not.toHaveBeenCalled()
  })

  it('turn becomes decided once every first-level node is decided (unblocks the agent)', async () => {
    const deps = makeDeps(threadWith({ A: 'pending', [A]: 'accepted', [A1]: 'pending', [B]: 'pending' }))
    const result = await handleGhostStatus(body({ ghost_id: B, status: 'rejected' }), deps)
    expect(result.body.turn_status).toBe('accepted')
  })

  it('reject with a subtree and no choice: 400 listing who would hang', async () => {
    const deps = makeDeps()
    const result = await handleGhostStatus(body({ status: 'rejected' }), deps)
    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ code: 'subtree_action_required', subtree: [A1] })
    expect(deps.saveDecision).not.toHaveBeenCalled()
  })

  it('reject + delete: the node and its subtree change, both are reported', async () => {
    const deps = makeDeps()
    const result = await handleGhostStatus(body({ status: 'rejected', subtree_action: 'delete' }), deps)
    expect(result.status).toBe(200)
    expect(result.body.changed).toEqual([{ ghost_id: A, status: 'rejected' }, { ghost_id: A1, status: 'deleted' }])
  })

  it('reject + save_off keeps the subtree', async () => {
    const result = await handleGhostStatus(body({ status: 'rejected', subtree_action: 'save_off' }), makeDeps())
    expect(result.body.changed).toEqual([{ ghost_id: A, status: 'rejected' }, { ghost_id: A1, status: 'saved_off' }])
  })

  it('a leaf reject needs no subtree choice', async () => {
    const result = await handleGhostStatus(body({ ghost_id: B, status: 'rejected' }), makeDeps())
    expect(result.status).toBe(200)
  })

  it('rejection with a known reason teaches the agent, from the rejected node only', async () => {
    const deps = makeDeps()
    await handleGhostStatus(body({ status: 'rejected', subtree_action: 'delete', rejection_reason: 'too_abstract' }), deps)
    expect(deps.sendRejected).toHaveBeenCalledTimes(1) // not once per subtree node
    expect(deps.sendRejected).toHaveBeenCalledWith(expect.objectContaining({
      rejected_ghost_content: 'idea A', rejection_reason: 'too_abstract', agent_role: 'expander',
    }))
  })

  it('no reason (or free text) records the outcome but fires no learning', async () => {
    const none = makeDeps()
    await handleGhostStatus(body({ ghost_id: B, status: 'rejected' }), none)
    const free = makeDeps()
    await handleGhostStatus(body({ ghost_id: B, status: 'rejected', rejection_reason: 'too wordy' }), free)
    expect(none.sendRejected).not.toHaveBeenCalled()
    expect(free.sendRejected).not.toHaveBeenCalled()
    expect(none.saveDecision).toHaveBeenCalled() // outcome still saved
  })

  it('409 when the node was already decided', async () => {
    const result = await handleGhostStatus(body(), makeDeps(threadWith({ [A]: 'accepted' })))
    expect(result.status).toBe(409)
  })

  it('400 for a ghost id that is not in this structure', async () => {
    expect((await handleGhostStatus(body({ ghost_id: U(99) }), makeDeps())).status).toBe(400)
  })

  it('404 when the thread is missing or belongs to another canvas', async () => {
    expect((await handleGhostStatus(body(), makeDeps(null))).status).toBe(404)
    expect((await handleGhostStatus(body(), makeDeps(threadWith(undefined, U(77))))).status).toBe(404)
  })

  it('400 when turn_index does not point at a ghost structure', async () => {
    expect((await handleGhostStatus(body({ turn_index: 5 }), makeDeps())).status).toBe(400)
  })

  it('400 for the old pair payload', async () => {
    const old = { thread_id: THREAD, turn_index: 0, canvas_id: CANVAS, session_id: SESSION, context_node_status: 'accepted', question_node_status: null, interacted_at: 1 }
    expect((await handleGhostStatus(old, makeDeps())).status).toBe(400)
  })
})
