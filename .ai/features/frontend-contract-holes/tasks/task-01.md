---
feature: "frontend-contract-holes"
type: task
task_id: task-01
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Hole #1 — make `done` addressable. Today all three streaming pipelines publish
`done` **before** persisting the ghost_pair turn, and `done` carries no ids
(`{ type: 'done' }`). The frontend therefore cannot call `POST /api/ghost-status`
without polling `agent_threads` and matching a ghost id, with a retry race
(FRONTEND-CONTRACT.md §7.2). Fix both halves: **persist the turn first**, then
publish a `done` that carries `thread_id`, `turn_index`, and the ghost ids.

## Files to Touch
```
MODIFY:
  types/index.ts                        → enrich RedisMessage['done']
  src/streaming/tokens.ts               → publishDone(sessionId, payload)
  src/pipeline/agent-pipeline.ts        → finalize: append → derive turn_index → publishDone
  src/pipeline/articulator-pipeline.ts  → same reorder (question_ghost_id: null)
  src/pipeline/outer-sub-pipeline.ts    → same reorder
  .ai/context/CANVAS-SYNC.md            → Redis Message Types + finalize step-order note
  .ai/context/FRONTEND-CONTRACT.md      → delete §7.2 workaround; drop §11 P0 row #1; update §6 done shape
```

## Type change (types/index.ts)
```typescript
export type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }
  | {
      type: 'done'
      thread_id: string
      turn_index: number
      trigger_node_id: string
      context_ghost_id: string
      question_ghost_id: string | null
    }
```

## Implementation notes
- `publishDone(sessionId: string, payload: Omit<Extract<RedisMessage,{type:'done'}>,'type'>)`.
- **Reorder `finalize` in each pipeline:** `appendMessage(...)` FIRST, then derive
  `turn_index`, then `publishDone`. If `appendMessage` throws, let it propagate —
  never publish `done` for a turn that failed to persist.
- **Deriving `turn_index` — no RPC/migration needed.** `context_ghost_id` is a
  freshly-minted UUID, globally unique. After the append, re-read the thread
  (`getById`) and take the index of the message whose
  `ghost_pair.context_ghost_id === descriptor.context_node.ghost_id`. Append-only
  writes never shift an existing element's index, so concurrent agent appends to
  the same canvas thread can't move ours — this is race-safe without locking.
- `agent-pipeline.ts` keeps its temporal-deferral decrement in `finalize` after
  the publish (unchanged behaviour). Articulator passes
  `question_ghost_id: null`.

## Depends On
None. (task-02 depends on this — shared `RedisMessage`/`tokens.ts` surface.)

## Definition of Done
- [ ] `RedisMessage['done']` carries `thread_id`, `turn_index`, `trigger_node_id`, `context_ghost_id`, `question_ghost_id`
- [ ] All three pipelines `appendMessage` **before** `publishDone`; a persist failure aborts before any `done` is published
- [ ] `turn_index` derived by matching `context_ghost_id`; correct under a concurrent second append to the same thread
- [ ] `publishDone` forwards the full payload; SSE route still forwards it verbatim (it only reads `.type`)
- [ ] CANVAS-SYNC.md + FRONTEND-CONTRACT.md updated in the same change (§7.2 workaround + §11 row #1 removed)
- [ ] `npm run build` compiles

## Test Plan
- Unit: after a finalize run, the published `done` payload's `turn_index` resolves
  to a `ghost_pair` turn whose `context_ghost_id` matches the descriptor.
- Unit: inject a second `appendMessage` on the same thread between our append and
  read; assert our derived `turn_index` still points at our turn.
- Unit: `appendMessage` rejects ⇒ `publishDone` is never called.
