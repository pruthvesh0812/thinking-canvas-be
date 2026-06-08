---
feature: "ghost-streaming"
type: story
created: 2026-06-09
status: draft
---

## What
Implement the ghost node streaming infrastructure: the Redis client, tier/guard helpers, spawn descriptor builder, and token streaming utility that the pipeline functions use to push ghost nodes to the frontend via SSE.

## Why
Ghost streaming is the only server-to-client push in ThinkingCanvas. Before any pipeline can send content to the frontend, these primitives must exist. The pipelines (Story 9) import directly from `src/streaming/` and `src/lib/`.

## Blast Radius
| Component | Impact |
|---|---|
| `src/lib/redis.ts` | Upstash Redis client — imported by pipelines + stream route |
| `src/lib/tier.ts` | `getAvailableAgents()` — used by Orchestrator |
| `src/lib/guards.ts` | `canAgentFire()` — called before every Orchestrator route |
| `src/streaming/spawn.ts` | `buildSpawnDescriptor()` — Step 4 of agent pipeline |
| `src/streaming/tokens.ts` | `streamAgentOutput()` — Step 7 of agent pipeline |

## Files to Touch
```
CREATE:
  src/lib/redis.ts          → Upstash Redis client singleton
  src/lib/tier.ts           → getAvailableAgents(subscription_tier)
  src/lib/guards.ts         → canAgentFire(canvas_id, agent_role, trigger_node_id)
  src/streaming/spawn.ts    → buildSpawnDescriptor(...) + publishSpawn(...)
  src/streaming/tokens.ts   → streamAgentOutput(agent, ghost_id, session_id)
```

## Key Implementations

**redis.ts:**
```typescript
import { Redis } from '@upstash/redis'
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
// Channel pattern: canvas:stream:${sessionId}
// Message types: spawn | chunk | done | ping
```

**guards.ts — canAgentFire():**
```typescript
// Queries canvas-scoped agent_thread for pending ghost on trigger_node_id
// Returns false if pending ghost exists → pipeline drops silently (no response)
async function canAgentFire(canvasId, agentRole, triggerNodeId): Promise<boolean>
```

**tier.ts — getAvailableAgents():**
```typescript
// Free:  ['expander', 'articulator']
// Pro:   all 5 content agents + rejection insights + session complete
// Power: all Pro + cognitive profile (v1.5, not yet implemented)
function getAvailableAgents(tier: 'free' | 'pro' | 'power'): AgentRole[]
```

**spawn.ts — SpawnDescriptor:**
Ghost IDs are pre-assigned UUIDs before the agent is called. Frontend uses them to target chunk messages. See CANVAS-SYNC.md for the full SpawnDescriptor shape.

## Ghost Redis Message Protocol

```
SPAWN  → { type: 'spawn', descriptor: SpawnDescriptor }
CHUNK  → { type: 'chunk', target: ghost_id, data: token }
DONE   → { type: 'done' }
PING   → { type: 'ping' }  (SSE keepalive only — not from pipeline)
```

## Supabase Migration
No.

## Inngest Events
No.

## Risks
- Redis is pub/sub ONLY — never use as a persistent store or job queue
- `canAgentFire()` is a non-negotiable guard — must be called before every Orchestrator route
- Chunk messages target by `ghost_id` — the SpawnDescriptor must pre-assign UUIDs before calling the agent

## Task Breakdown
- **task-01:** src/lib/redis.ts + src/lib/tier.ts + src/lib/guards.ts
- **task-02:** src/streaming/spawn.ts + src/streaming/tokens.ts
