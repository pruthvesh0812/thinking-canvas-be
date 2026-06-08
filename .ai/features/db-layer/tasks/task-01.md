---
feature: "db-layer"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Create the Supabase client singleton and the query helpers for canvases, sessions, and nodes.

## Files to Touch
```
CREATE:
  src/db/client.ts      → Supabase service-role client
  src/db/canvases.ts    → canvas CRUD
  src/db/sessions.ts    → session CRUD + node_sequence updates
  src/db/nodes.ts       → node reads (backend never writes user nodes)
```

## Key function signatures

**client.ts:**
```typescript
export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

**canvases.ts:**
```typescript
getCanvas(id: string): Promise<Canvas>
createCanvas(data: { user_id, title, original_intent }): Promise<Canvas>
// NOTE: never update original_intent
```

**sessions.ts:**
```typescript
getSession(id: string): Promise<Session>
createSession(canvas_id: string): Promise<Session>
appendToNodeSequence(session_id: string, node_id: string): Promise<void>
closeSession(session_id: string): Promise<void>
updatePhase(session_id: string, phase: SessionPhase): Promise<void>
```

**nodes.ts:**
```typescript
getNode(id: string): Promise<Node>
getRecentNodes(canvas_id: string, limit: number): Promise<Node[]>
updateSummary(node_id: string, summary: string, direction_marker: DirectionMarker): Promise<void>
updateEmbedding(node_id: string, embedding: number[]): Promise<void>
// ❌ No insertNode — frontend writes nodes directly to Supabase
```

## Depends On
`database-foundation` story must be complete (tables must exist). `core-types` story must be complete (types imported).

## Definition of Done
- [ ] `src/db/client.ts` exports `db` (Supabase service role client)
- [ ] All functions above are implemented and typed
- [ ] No `any` types
- [ ] `npm run build` compiles with no errors
