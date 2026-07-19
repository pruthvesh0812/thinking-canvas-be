import * as threads from '../db/threads.js'
import { hasInFlightForTriggerNode, getLatestSeq } from '../db/intervention-offers.js'
import { logger } from './logger.js'
import type { AgentRole, InterventionOffer, ThreadMessage } from '../../types/index.js'

type GhostPairMsg = Extract<ThreadMessage, { role: 'assistant'; turn_type: 'ghost_pair' }>

function asGhostPairMsg(msg: ThreadMessage): GhostPairMsg | null {
  return msg.role === 'assistant' && msg.turn_type === 'ghost_pair' ? msg : null
}

// Non-negotiable guard — called BEFORE every Orchestrator route (pipeline Step 2).
// Returns false if this trigger node already has:
//   1. a PENDING ghost pair on the thread (post-finalize but pre-user-action), or
//   2. an IN-FLIGHT intervention offer (waiting/shown) — the pre-thread state
//      the ghost-pair check would otherwise miss (§4e single-flight per node).
// Threads are canvas-scoped; offers are canvas+node-scoped.
export async function canAgentFire(
  canvasId: string,
  agentRole: AgentRole,
  triggerNodeId: string
): Promise<boolean> {
  const thread = await threads.getByCanvas(canvasId, agentRole)
  if (thread) {
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
      return false
    }
  }

  const inFlight = await hasInFlightForTriggerNode(canvasId, triggerNodeId)
  if (inFlight) {
    logger.warn('[guard:canAgentFire] in-flight offer blocks fire', {
      canvas_id: canvasId,
      trigger_node_id: triggerNodeId,
    })
    return false
  }

  return true
}

// Version guard — the publish-boundary check (§4e). Called BEFORE publishing
// spawn AND BEFORE streaming so a superseded run that raced through cancellation
// aborts silently. sessions.latest_seq is monotonic, so any offer whose seq
// falls behind is stale by definition. Belt-and-suspenders for Inngest cancelOn.
export async function isStillLatest(offer: InterventionOffer): Promise<boolean> {
  const latest = await getLatestSeq(offer.session_id)
  if (offer.seq !== latest) {
    logger.info('[guard:isStillLatest] stale — aborting', {
      offer_id: offer.id,
      session_id: offer.session_id,
      offer_seq: offer.seq,
      latest_seq: latest,
    })
    return false
  }
  return true
}
