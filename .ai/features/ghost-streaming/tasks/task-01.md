---
feature: "ghost-streaming"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Create the three library helpers: Redis client, tier enforcement utility, and canAgentFire() guard.

## Files to Touch
```
CREATE:
  src/lib/redis.ts   → Upstash Redis singleton
  src/lib/tier.ts    → getAvailableAgents(tier)
  src/lib/guards.ts  → canAgentFire(canvas_id, agent_role, trigger_node_id)
```

## redis.ts

```typescript
import { Redis } from '@upstash/redis'
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
// Exported singleton — imported by streaming/* and routes/stream.ts
```

## tier.ts

```typescript
// Tier → available agents mapping (server-side enforcement)
// Free:  Expander + Articulator only
// Pro:   All 5 content agents + Rejection Insights + Session Complete
// Power: All Pro + cognitive profile (placeholder for v1.5)

export function getAvailableAgents(
  tier: 'free' | 'pro' | 'power'
): AgentRole[]
```

## guards.ts — canAgentFire()

```typescript
// Returns false if there is already a PENDING ghost triggered by this node
// Called BEFORE routing in agent-pipeline.ts (Step 2)
// If false → pipeline drops silently (no error, no response)

export async function canAgentFire(
  canvasId: string,
  agentRole: AgentRole,
  triggerNodeId: string
): Promise<boolean> {
  const thread = await db.threads.getByCanvas(canvasId, agentRole)
  if (!thread) return true

  return !thread.messages.find(
    (msg) =>
      msg.role === 'assistant' &&
      msg.ghost_pair?.triggered_by_node_id === triggerNodeId &&
      msg.ghost_pair?.pair_status === 'pending'
  )
}
```

## Depends On
`core-types` story (AgentRole type), `db-layer` task-02 (threads.ts for thread lookup).

## Definition of Done
- [ ] `redis` singleton exported from `src/lib/redis.ts`
- [ ] `getAvailableAgents('free')` returns only `['expander', 'articulator']`
- [ ] `canAgentFire()` returns `false` when pending ghost exists for trigger node
- [ ] `npm run build` compiles
