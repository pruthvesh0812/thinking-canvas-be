import { describe, expect, it } from 'vitest'
import type { AgentThread } from '../../types/index.js'
import { focusOverlaps, whyBlocked } from './block-rules.js'

const threadWith = (status: 'pending' | 'accepted' | 'rejected', focus_node_ids: string[]): AgentThread => ({
  id: 't', canvas_id: 'c', agent_role: 'expander', active_rejection_insight_ids: [], updated_at: '',
  messages: [{
    role: 'assistant', turn_type: 'ghost_structure', content: 'x', timestamp: '2026-01-01T00:00:00Z',
    ghost_structure: { run_id: 'r', focus_node_ids, structure: { frames: [], nodes: [], edges: [] }, status },
  }],
})

describe('focusOverlaps', () => {
  it('true when they share a node', () => expect(focusOverlaps(['a', 'b'], ['b', 'c'])).toBe(true))
  it('false when they share nothing', () => expect(focusOverlaps(['a'], ['b'])).toBe(false))
  it('canvas-wide (empty) overlaps with everything', () => {
    expect(focusOverlaps([], ['a'])).toBe(true)
    expect(focusOverlaps(['a'], [])).toBe(true)
  })
})

describe('whyBlocked', () => {
  it('allows a run when nothing is going on', () => {
    expect(whyBlocked({ focusNodeIds: ['a'], activeRuns: [], thread: null })).toBeNull()
  })

  it('blocks while the same agent is running on the same focus', () => {
    expect(whyBlocked({ focusNodeIds: ['a'], activeRuns: [{ focus_node_ids: ['a'] }], thread: null })).toBe('run_in_progress')
  })

  it('allows the same agent on a DIFFERENT focus', () => {
    expect(whyBlocked({ focusNodeIds: ['b'], activeRuns: [{ focus_node_ids: ['a'] }], thread: null })).toBeNull()
  })

  it('blocks while its ghosts on this focus are still pending', () => {
    expect(whyBlocked({ focusNodeIds: ['a'], activeRuns: [], thread: threadWith('pending', ['a']) })).toBe('ghosts_pending')
  })

  it('allows again once the user decided (accepted or rejected)', () => {
    expect(whyBlocked({ focusNodeIds: ['a'], activeRuns: [], thread: threadWith('accepted', ['a']) })).toBeNull()
    expect(whyBlocked({ focusNodeIds: ['a'], activeRuns: [], thread: threadWith('rejected', ['a']) })).toBeNull()
  })

  it('pending ghosts on a different focus do not block', () => {
    expect(whyBlocked({ focusNodeIds: ['b'], activeRuns: [], thread: threadWith('pending', ['a']) })).toBeNull()
  })
})
