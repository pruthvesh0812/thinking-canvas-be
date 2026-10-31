// The logic of POST /api/ghost-status, apart from Hono, so it can be tested with fakes.
// The user decided about ONE ghost node of a ghost structure (accept, or reject with an optional
// "what about the subtree" answer). See src/context/ghost-decisions.ts for the rules.

import { ghostStatusSchema } from '../../types/index.js'
import type { AgentRole, AgentThread, GhostNodeStatus, RejectionReason } from '../../types/index.js'
import { applyDecision } from '../context/ghost-decisions.js'

// Reasons the OLD rejection classifier understands. Free-text reasons are learned from in a later
// slice (Rejection Insights rework); until then they are recorded but do not create a constraint.
const LEGACY_REASONS: string[] = ['too_abstract', 'too_technical', 'skip_for_now']

export type GhostStatusDeps = {
  getThread(threadId: string): Promise<AgentThread | null>
  saveDecision(
    threadId: string,
    turnIndex: number,
    decision: { node_status: Record<string, GhostNodeStatus>; status: 'pending' | 'accepted' | 'rejected' },
  ): Promise<void>
  sendRejected(data: {
    canvas_id: string
    session_id: string
    thread_id: string
    agent_role: AgentRole
    rejected_ghost_content: string
    rejection_reason: RejectionReason
  }): Promise<void>
}

export type GhostStatusResult = { status: 200 | 400 | 404 | 409; body: Record<string, unknown> }

export async function handleGhostStatus(rawBody: unknown, deps: GhostStatusDeps): Promise<GhostStatusResult> {
  // ── 1. well formed? ──
  const parsed = ghostStatusSchema.safeParse(rawBody)
  if (!parsed.success) return { status: 400, body: { error: 'invalid payload', issues: parsed.error.issues } }
  const p = parsed.data

  // ── 2. the thread must exist AND belong to this canvas (else pretend it does not exist) ──
  const thread = await deps.getThread(p.thread_id)
  if (!thread || thread.canvas_id !== p.canvas_id) return { status: 404, body: { error: 'thread not found' } }

  // ── 3. the turn must be a ghost structure ──
  const turn = thread.messages[p.turn_index]
  if (!turn || turn.role !== 'assistant' || turn.turn_type !== 'ghost_structure') {
    return { status: 400, body: { error: 'no ghost structure at turn_index' } }
  }
  const { structure, node_status } = turn.ghost_structure

  // ── 4. decide ──
  const result = applyDecision(structure, node_status, {
    ghostId: p.ghost_id,
    status: p.status,
    subtreeAction: p.subtree_action,
  })
  if (!result.ok) {
    const status = result.code === 'already_decided' ? 409 : 400
    return { status, body: { error: result.message, code: result.code, ...(result.subtree ? { subtree: result.subtree } : {}) } }
  }

  // ── 5. save ──
  await deps.saveDecision(p.thread_id, p.turn_index, { node_status: result.nodeStatus, status: result.turnStatus })

  // ── 6. a rejection WITH a reason teaches the agent (only the node the user rejected, never its subtree) ──
  const reason = p.rejection_reason?.trim()
  if (p.status === 'rejected' && reason && LEGACY_REASONS.includes(reason)) {
    const rejectedNode = structure.nodes.find(node => node.ghost_id === p.ghost_id)
    await deps.sendRejected({
      canvas_id: p.canvas_id,
      session_id: p.session_id,
      thread_id: p.thread_id,
      agent_role: thread.agent_role,
      rejected_ghost_content: rejectedNode?.content ?? '',
      rejection_reason: reason as RejectionReason,
    })
  }

  // ── 7. tell the frontend what changed (the node, plus anything its reject deleted or saved off) ──
  const changed = [p.ghost_id, ...result.subtree].map(ghost_id => ({ ghost_id, status: result.nodeStatus[ghost_id] }))
  return { status: 200, body: { ok: true, turn_status: result.turnStatus, changed } }
}
