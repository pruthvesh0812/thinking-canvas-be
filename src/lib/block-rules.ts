// The pure rules behind canAgentFire (src/lib/guards.ts). Kept apart from the database calls
// so they can be tested, and read, on their own.

import type { AgentRun, AgentThread } from '../../types/index.js'

// Do two focus lists point at the same part of the canvas?
// An empty list means "the whole canvas", which overlaps with everything.
export function focusOverlaps(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true
  return a.some(id => b.includes(id))
}

// Pure decision, so it is easy to test. Returns the reason it is blocked, or null if the agent may run.
//   - the SAME agent is still running (or queued) on this focus
//   - the same agent has a ghost structure on this focus that the user has not decided yet
// Different agents never block each other.
export function whyBlocked(params: {
  focusNodeIds: string[]
  activeRuns: Pick<AgentRun, 'focus_node_ids'>[]
  thread: AgentThread | null
}): 'run_in_progress' | 'ghosts_pending' | null {
  const { focusNodeIds, activeRuns, thread } = params

  // 1. a run for this agent is already going
  if (activeRuns.some(run => focusOverlaps(run.focus_node_ids, focusNodeIds))) {
    return 'run_in_progress'
  }

  // 2. earlier ghosts from this agent still wait for the user
  const hasPendingGhosts = (thread?.messages ?? []).some(
    message =>
      message.role === 'assistant' &&
      message.turn_type === 'ghost_structure' &&
      message.ghost_structure.status === 'pending' &&
      focusOverlaps(message.ghost_structure.focus_node_ids, focusNodeIds),
  )
  if (hasPendingGhosts) return 'ghosts_pending'

  return null
}
