import { randomUUID } from 'node:crypto'
import { redis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'
import type {
  SpawnDescriptor,
  AgentRole,
  ContextNodeType,
} from '../../types/index.js'

// Builds the graph the frontend will render BEFORE the agent runs. Ghost IDs are
// pre-assigned UUIDs so chunk messages can target each ghost node by id while it
// streams. SpawnDescriptor defines structure; the agent only fills in content.
export function buildSpawnDescriptor(params: {
  trigger_node_id: string
  session_id: string
  agent_role: AgentRole
  context_node_type: ContextNodeType
  has_question_node: boolean
  // Edge-triggered spawns (Articulator via a `relate` edge) pass the edge id.
  trigger_edge_id?: string
  // The nodes the ghost pair anchors to. Defaults to [trigger_node_id] for
  // node-triggered spawns; a relate-triggered Articulator run passes
  // [from_node_id, to_node_id] (source first).
  anchor_node_ids?: string[]
}): SpawnDescriptor {
  const context_ghost_id = randomUUID()
  const question_ghost_id = params.has_question_node ? randomUUID() : undefined

  return {
    trigger_node_id: params.trigger_node_id,
    session_id: params.session_id,
    ...(params.trigger_edge_id && { trigger_edge_id: params.trigger_edge_id }),
    anchor_node_ids: params.anchor_node_ids ?? [params.trigger_node_id],
    context_node: {
      ghost_id: context_ghost_id,
      node_type: params.context_node_type,
      agent_role: params.agent_role,
    },
    context_edge: {
      edge_type: 'logical',
      from: params.trigger_node_id,
      to: context_ghost_id,
    },
    ...(question_ghost_id && {
      question_node: { ghost_id: question_ghost_id, node_type: 'question' },
      question_edge: {
        edge_type: 'logical',
        from: context_ghost_id,
        to: question_ghost_id,
      },
    }),
  }
}

export async function publishSpawn(
  sessionId: string,
  descriptor: SpawnDescriptor
): Promise<void> {
  await redis.publish(
    `canvas:stream:${sessionId}`,
    JSON.stringify({ type: 'spawn', descriptor })
  )
  logger.info('[streaming:spawn] published', {
    session_id: sessionId,
    context_ghost_id: descriptor.context_node.ghost_id,
    question_ghost_id: descriptor.question_node?.ghost_id ?? null,
  })
}
