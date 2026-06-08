---
feature: "db-layer"
type: story
created: 2026-06-09
status: draft
---

## What
Create all `src/db/*.ts` modules — the typed Supabase query helpers that every other layer (tools, agents, pipelines, routes) calls instead of inline SQL.

## Why
Centralizing all DB queries prevents duplicate SQL, enforces `canvas_id`-scoped queries, and makes it easy to update when the schema changes. Pipelines and tools should never import `@supabase/supabase-js` directly.

## Blast Radius
| Component | Impact |
|---|---|
| `src/db/client.ts` | Supabase service-role client — imported everywhere |
| `src/db/canvases.ts` | Canvas CRUD |
| `src/db/sessions.ts` | Session CRUD + node_sequence updates |
| `src/db/nodes.ts` | Node reads (backend never writes user nodes) |
| `src/db/edges.ts` | Edge reads + both_existing flag |
| `src/db/threads.ts` | agent_threads read/write/append |
| `src/db/rejection-insights.ts` | Rejection insight CRUD + active lookup |

## Files to Touch
```
CREATE:
  src/db/client.ts
  src/db/canvases.ts
  src/db/sessions.ts
  src/db/nodes.ts
  src/db/edges.ts
  src/db/threads.ts
  src/db/rejection-insights.ts
```

## Key Design Constraints

**client.ts:** Service role key only — never anon key on backend.
```typescript
import { createClient } from '@supabase/supabase-js'
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

**nodes.ts:** Backend READS nodes — never writes user nodes (frontend writes directly to Supabase).

**threads.ts:** Must support:
- `getByCanvas(canvas_id, agent_role)` — get canvas-scoped thread
- `appendMessage(thread_id, message)` — append to JSONB messages array
- `updateActiveInsights(thread_id, ids)` — update active_rejection_insight_ids

**rejection-insights.ts:** Must support:
- `getActiveByCanvas(canvas_id)` — fetch all active insights for injection
- `decrementTurnsRemaining(id)` — called after each agent turn for temporal deferrals
- `deactivate(id)` — when turns_remaining reaches 0

## Supabase Migration
No — depends on `database-foundation` being applied first.

## Inngest Events
No.

## Risks
- Service role key is never passed to frontend — confirm it's only used server-side
- `threads.appendMessage()` must be atomic — use Postgres JSONB append (`jsonb_insert` or `||` operator) not read-modify-write

## Task Breakdown
- **task-01:** client.ts + canvases.ts + sessions.ts + nodes.ts
- **task-02:** edges.ts + threads.ts + rejection-insights.ts
