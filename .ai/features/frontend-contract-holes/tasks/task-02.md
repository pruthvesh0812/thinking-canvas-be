---
feature: "frontend-contract-holes"
type: task
task_id: task-02
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Hole #2 — stop shipping raw control markers over the wire. Today
`streamAgentOutput` tags **every** token with the context ghost id, so the
`[NODE_TYPE: x]` and `[QUESTION]` markers stream verbatim and the frontend must
buffer, parse, strip, and re-route them onto the question ghost itself
(FRONTEND-CONTRACT.md §7.1). Move that split **server-side** — which is what the
`outer-sub-pipeline` comment already assumes ("the token layer splits the
`[QUESTION]` section onto the question ghost"). The FE then just appends
`chunk.data` to `chunk.target` and restyles on a `node_type` message.

## Files to Touch
```
MODIFY:
  types/index.ts                        → add RedisMessage 'node_type' variant
  src/streaming/tokens.ts               → marker-aware streaming (both ghost ids)
  src/pipeline/agent-pipeline.ts        → pass question_ghost_id to the stream helper
  src/pipeline/outer-sub-pipeline.ts    → pass question_ghost_id (always present)
  src/pipeline/articulator-pipeline.ts  → no question ghost; NODE_TYPE only
  .ai/context/CANVAS-SYNC.md            → chunk routing + node_type note
  .ai/context/FRONTEND-CONTRACT.md      → rewrite §7.1 (server splits; FE no longer parses NODE_TYPE/QUESTION)
```

## Type change (types/index.ts)
```typescript
  | { type: 'node_type'; target: string; node_type: ContextNodeType }  // target = context ghost id
```

## Behaviour
`streamAgentOutput(stream, { contextGhostId, questionGhostId }, sessionId)`:
1. **Buffer across chunk boundaries** — a marker can straddle two tokens, so
   accumulate into a small pending buffer and only flush text that cannot be the
   prefix of a marker.
2. On `[NODE_TYPE: x]`: parse `x`, publish `{ type:'node_type', target: contextGhostId, node_type: x }`, and drop the marker from the text stream.
3. Route text: everything before `[QUESTION]` → chunks targeting `contextGhostId`;
   after `[QUESTION]` → chunks targeting `questionGhostId` (drop the marker). If
   `questionGhostId` is null (Articulator) there is no `[QUESTION]`; assert/log if
   one appears.
4. `[ARTICULATION n]` stays **in-band** — it is sub-structure of the single
   Articulator context node, not a ghost split. The FE sub-renders it (documented
   in FRONTEND-CONTRACT.md §7.1). Do not route it.
5. Still return the full accumulated raw text (markers included) so the persisted
   `ghost_pair.content` is unchanged — the thread record stays the source of truth
   for re-parsing.

## Depends On
**task-01** — shares `RedisMessage` + `tokens.ts` + all three pipeline finalize/
stream steps. Land task-01 first to avoid a churned merge.

## Definition of Done
- [ ] `node_type` message published once per generation, targeting the context ghost, marker stripped from chunks
- [ ] Post-`[QUESTION]` text is chunked to `questionGhostId`; pre-`[QUESTION]` to `contextGhostId`
- [ ] Markers split across chunk boundaries are handled (buffer never emits a partial marker as ghost text)
- [ ] Articulator path: `[NODE_TYPE:]` stripped, `[ARTICULATION n]` left in-band, no question routing
- [ ] Persisted `ghost_pair.content` still holds the full raw text (unchanged)
- [ ] CANVAS-SYNC.md + FRONTEND-CONTRACT.md §7.1 rewritten (FE no longer parses NODE_TYPE/QUESTION)
- [ ] `npm run build` compiles

## Test Plan
- Unit: `[NODE_TYPE: reframe]` split as `"[NODE_T"` + `"YPE: reframe]"` across two
  tokens ⇒ one `node_type:reframe` message, zero marker leakage into chunks.
- Unit: a full Expander response ⇒ context chunks before `[QUESTION]`, question
  chunks after, on the right ghost ids.
- Unit: appreciation response (no `[QUESTION]`) ⇒ no chunks on the question ghost.
- Unit: Articulator response ⇒ `[ARTICULATION 1..3]` preserved in the context
  chunks; no question routing.
