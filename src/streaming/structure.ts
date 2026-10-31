import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'
import type { AgentRole, GhostEdge, GhostFrame, GhostNode, RedisMessage } from '../../types/index.js'

// Publishes the ghost-structure stream (structure_start / ghost_chunk / structure_done / structure_error)
// on the session's Redis channel. The frontend reads it through GET /api/stream/:sessionId.
// Ghost stream only: never canvas state (non-negotiable #9).

async function publish(sessionId: string, message: RedisMessage): Promise<void> {
  await redis.publish(`canvas:stream:${sessionId}`, JSON.stringify(message))
}

// First message of a run. focus_node_ids tell the frontend where to draw its anchor halos.
export async function publishStructureStart(
  sessionId: string,
  params: { run_id: string; agent: AgentRole; focus_node_ids: string[] },
): Promise<void> {
  await publish(sessionId, { type: 'structure_start', ...params })
  logger.info('[streaming:structure] start', { session_id: sessionId, run_id: params.run_id })
}

// One piece of the structure: a node (or a whole frame) with the edges that are ready to draw.
export async function publishGhostChunk(
  sessionId: string,
  runId: string,
  chunk: { frames: GhostFrame[]; nodes: GhostNode[]; edges: GhostEdge[] },
): Promise<void> {
  await publish(sessionId, { type: 'ghost_chunk', run_id: runId, ...chunk })
}

// Last message of a good run. The thread turn is saved BEFORE this, so thread_id + turn_index are valid.
export async function publishStructureDone(
  sessionId: string,
  params: { run_id: string; thread_id: string; turn_index: number },
): Promise<void> {
  await publish(sessionId, { type: 'structure_done', ...params })
  logger.info('[streaming:structure] done', { session_id: sessionId, run_id: params.run_id })
}

// Last message of a failed run. `reason` is shown to the user, so keep it short and safe.
export async function publishStructureError(sessionId: string, runId: string, reason: string): Promise<void> {
  await publish(sessionId, { type: 'structure_error', run_id: runId, reason })
  logger.warn('[streaming:structure] error', { session_id: sessionId, run_id: runId, reason })
}
