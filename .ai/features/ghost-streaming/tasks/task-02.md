---
feature: "ghost-streaming"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement buildSpawnDescriptor() and the token streaming utility — the two functions pipeline steps call to send ghost content to the frontend.

## Files to Touch
```
CREATE:
  src/streaming/spawn.ts   → buildSpawnDescriptor() + publishSpawn()
  src/streaming/tokens.ts  → streamAgentOutput(agent, ghostId, sessionId)
```

## spawn.ts

```typescript
import { redis } from '../lib/redis'
import type { SpawnDescriptor, AgentRole, ContextNodeType, EdgeType } from '../../types'

export function buildSpawnDescriptor(params: {
  trigger_node_id: string
  session_id: string
  agent_role: AgentRole
  context_node_type: ContextNodeType
  has_question_node: boolean
}): SpawnDescriptor {
  const context_ghost_id = crypto.randomUUID()
  const question_ghost_id = params.has_question_node ? crypto.randomUUID() : undefined

  return {
    trigger_node_id: params.trigger_node_id,
    session_id: params.session_id,
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
      question_edge: { edge_type: 'logical', from: context_ghost_id, to: question_ghost_id },
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
}
```

## tokens.ts

```typescript
// Streams agent text output to Redis as chunk messages targeting a specific ghost_id
export async function streamAgentOutput(
  stream: AsyncIterable<string>,  // agent.stream().textStream
  ghostId: string,
  sessionId: string
): Promise<void> {
  for await (const token of stream) {
    await redis.publish(
      `canvas:stream:${sessionId}`,
      JSON.stringify({ type: 'chunk', target: ghostId, data: token })
    )
  }
}

export async function publishDone(sessionId: string): Promise<void> {
  await redis.publish(`canvas:stream:${sessionId}`, JSON.stringify({ type: 'done' }))
}
```

## Depends On
task-01 (redis.ts), `core-types` story (SpawnDescriptor type).

## Definition of Done
- [ ] `buildSpawnDescriptor()` pre-assigns UUIDs before agent is called
- [ ] `publishSpawn()` publishes `{ type: 'spawn', descriptor }` to correct channel
- [ ] `streamAgentOutput()` publishes a `chunk` message per token with correct `target` ghost_id
- [ ] `publishDone()` publishes `{ type: 'done' }`
- [ ] Redis channel format: `canvas:stream:${sessionId}`
- [ ] `npm run build` compiles
