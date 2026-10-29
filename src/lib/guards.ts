import * as threads from '../db/threads.js'
import { getActiveRuns } from '../db/agent-runs.js'
import { logger } from './logger.js'
import type { AgentRole } from '../../types/index.js'
import { whyBlocked } from './block-rules.js'

// Non-negotiable guard: called BEFORE every agent run.
// Returns false when the same agent must not run now (see whyBlocked).
// Threads are canvas-scoped, so the thread of this agent on this canvas is the one checked.
export async function canAgentFire(
  canvasId: string,
  agentRole: AgentRole,
  focusNodeIds: string[],
): Promise<boolean> {
  const [activeRuns, thread] = await Promise.all([
    getActiveRuns(canvasId, agentRole),
    threads.getByCanvas(canvasId, agentRole),
  ])

  const reason = whyBlocked({ focusNodeIds, activeRuns, thread })
  if (reason) {
    logger.warn('[guard:canAgentFire] blocked', {
      canvas_id: canvasId,
      agent_role: agentRole,
      focus_node_ids: focusNodeIds,
      reason,
    })
    return false
  }

  return true
}
