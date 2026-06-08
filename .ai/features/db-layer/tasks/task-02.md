---
feature: "db-layer"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Create query helpers for edges, agent_threads, and rejection_insights — the tables used by the pipeline and serializer.

## Files to Touch
```
CREATE:
  src/db/edges.ts              → edge reads + both_existing flag
  src/db/threads.ts            → agent thread CRUD + atomic message append
  src/db/rejection-insights.ts → insight CRUD + active lookup + decrement
```

## Key function signatures

**edges.ts:**
```typescript
getEdge(id: string): Promise<Edge>
// both_existing flag is read from DB — never computed in application code
```

**threads.ts:**
```typescript
getByCanvas(canvas_id: string, agent_role: AgentRole): Promise<AgentThread | null>
createThread(canvas_id: string, agent_role: AgentRole): Promise<AgentThread>
appendMessage(thread_id: string, message: ThreadMessage): Promise<void>
// ⚠️ appendMessage must be atomic — use Postgres JSONB append, not read-modify-write
updateActiveInsights(thread_id: string, ids: string[]): Promise<void>
```

**rejection-insights.ts:**
```typescript
getActiveByCanvas(canvas_id: string): Promise<RejectionInsight[]>
createInsight(data: Omit<RejectionInsight, 'id' | 'created_at'>): Promise<RejectionInsight>
decrementTurnsRemaining(id: string): Promise<void>
// After decrement: if turns_remaining reaches 0, set active=false automatically
deactivate(id: string): Promise<void>
```

## Atomic JSONB append for threads.appendMessage()

```typescript
// Use Supabase RPC or raw SQL to append atomically
// Do NOT: read thread, push to array, write back (race condition)
await db.rpc('append_thread_message', { thread_id, message: JSON.stringify(message) })

// Or inline:
await db.from('agent_threads')
  .update({ messages: db.rpc('jsonb_insert_message', { ... }) })
  .eq('id', thread_id)
```

## Depends On
task-01 must be complete (client.ts + core tables exist).

## Definition of Done
- [ ] All functions above are implemented and typed
- [ ] `appendMessage` is atomic (no read-modify-write pattern)
- [ ] `decrementTurnsRemaining` sets `active=false` when count reaches 0
- [ ] No `any` types
- [ ] `npm run build` compiles with no errors
