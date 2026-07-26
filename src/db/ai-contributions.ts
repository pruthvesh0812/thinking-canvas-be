import { db } from './client.js'
import { logger } from '../lib/logger.js'
import type { AgentRole, GhostStatus } from '../../types/index.js'

// First (and currently only) writer for the ai_contributions audit table.
// Records that an AI ghost reached a terminal state on the canvas — today the
// accepted-ghost record written by the ghost.accepted canvas-event branch.
//
// Idempotent: the frontend may retry ghost.accepted, so a row for the same
// (canvas_id, ghost_id, status) is written at most once. This is an
// application-layer guard (no unique constraint / migration) — safe here because
// the canvas is single-user, so there is no concurrent writer for the same ghost.
export async function recordContribution(params: {
  canvas_id: string
  session_id: string | null
  agent_role: AgentRole
  ghost_id: string
  status: GhostStatus
}): Promise<void> {
  const { canvas_id, session_id, agent_role, ghost_id, status } = params

  const { data: existing, error: readError } = await db
    .from('ai_contributions')
    .select('id')
    .eq('canvas_id', canvas_id)
    .eq('ghost_id', ghost_id)
    .eq('status', status)
    .maybeSingle()

  if (readError) throw new Error(`recordContribution read failed: ${readError.message}`)
  if (existing) {
    logger.info('[db:ai-contributions] already recorded — skipping', {
      canvas_id,
      ghost_id,
      status,
    })
    return
  }

  const { error } = await db
    .from('ai_contributions')
    .insert({ canvas_id, session_id, agent_role, ghost_id, status })

  if (error) throw new Error(`recordContribution insert failed: ${error.message}`)
  logger.info('[db:ai-contributions] recorded', {
    canvas_id,
    session_id,
    ghost_id,
    status,
    agent_role,
  })
}
