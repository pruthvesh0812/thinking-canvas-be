import * as threads from '../db/threads.js'
import { logger } from './logger.js'
import type { AgentRole, ThreadMessage } from '../../types/index.js'

type GhostPairMsg = Extract<ThreadMessage, { role: 'assistant'; turn_type: 'ghost_pair' }>

function asGhostPairMsg(msg: ThreadMessage): GhostPairMsg | null {
  return msg.role === 'assistant' && msg.turn_type === 'ghost_pair' ? msg : null
}

// Non-negotiable guard — called BEFORE every Orchestrator route (agent-pipeline Step 2).
// Returns false if a PENDING ghost already exists for this trigger node, so the
// pipeline drops silently (no error, no response). Threads are canvas-scoped.
export async function canAgentFire(
  canvasId: string,
  agentRole: AgentRole,
  triggerNodeId: string
): Promise<boolean> {
  const thread = await threads.getByCanvas(canvasId, agentRole)
  if (!thread) return true

  const pending = thread.messages.some((msg) => {
    const gp = asGhostPairMsg(msg)
    return (
      gp?.ghost_pair.triggered_by_node_id === triggerNodeId &&
      gp?.ghost_pair.pair_status === 'pending'
    )
  })

  if (pending) {
    logger.warn('[guard:canAgentFire] pending ghost blocks fire', {
      canvas_id: canvasId,
      agent_role: agentRole,
      trigger_node_id: triggerNodeId,
    })
  }

  return !pending
}
