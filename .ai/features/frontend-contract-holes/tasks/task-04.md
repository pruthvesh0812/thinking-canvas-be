---
feature: "frontend-contract-holes"
type: task
task_id: task-04
story: ../story.md
created: 2026-07-05
status: done
---

## Scope
Hole #4 — give accepted ghosts an *intentional* enrich path. When the user
accepts a ghost the frontend writes the `nodes`/`edges` rows itself
(`owner:'ai'`), but there is no explicit way to tell the backend "enrich this AI
node." Today accepted AI nodes are left with NULL `summary`/`embedding` and are
second-class in serialization + semantic search (FRONTEND-CONTRACT.md §7.3). Add
a `ghost.accepted` event to `POST /api/canvas-event` that runs the same enrich
(directional summary + embedding + `node_sequence` append), and write the
first-ever `ai_contributions` audit row.

> **Reframed 2026-07-19.** This task was originally written against a
> debounced pipeline that auto-fired on every `canvas/node.created` — so firing
> that event for an accepted ghost risked re-running an agent on its own output
> (ghost-on-ghost). Since the intervention-spectrum merge, `canvas/node.created`
> is a **dead Inngest event**: `src/index.ts` only wires `agentPipeline` to
> `canvas/intervention.trigger`, and nothing subscribes to `node.created`
> anymore. So the specific re-trigger risk no longer exists — but that is an
> **accident of the current wiring, not a documented contract.** The task's
> goal is unchanged: an explicit `ghost.accepted` event is still needed so the
> enrich path doesn't silently depend on an event nobody happens to be
> listening to today. If a future feature ever resubscribes to
> `canvas/node.created` (plausible — this codebase has already replaced its
> trigger model once), relying on the current accident would silently
> reintroduce ghost-on-ghost re-triggering with no test to catch it. Build
> `ghost.accepted` as the correct, intentional path regardless.

## Files to Touch
```
MODIFY:
  types/index.ts                    → canvasEventSchema.event_type + 'ghost.accepted' (+ node_ids)
  src/routes/canvas-event.ts        → 'ghost.accepted' branch: enrich, NO inngest.send(node.created)
  .ai/context/FRONTEND-CONTRACT.md  → rewrite §7.3 ("do NOT send canvas-event"); drop §11 P0 row #3
  .ai/context/CANVAS-SYNC.md        → note the accepted-ghost enrich path
CREATE:
  src/db/ai-contributions.ts        → first writer for the (currently unwritten) ai_contributions table
```

## Schema change (types/index.ts)
Extend the enum and carry the accepted node id(s). Keep the create paths intact.
```typescript
event_type: z.enum(['node.created', 'edge.created', 'ghost.accepted'])
// ghost.accepted carries node_ids: z.array(z.string().uuid()).min(1)
//   (a pair accept is 1–2 nodes: context, optional question)
```
Refine so `ghost.accepted` requires `node_ids` (mirroring the existing
node_id/edge_id refinement).

## Behaviour (canvas-event.ts `ghost.accepted` branch)
For each `node_id` in `node_ids` — reuse the existing `node.created` enrich block
(directional summary via `models.fast()` + embedding via `generateEmbedding` +
`appendToNodeSequence`), then insert an `ai_contributions` row
(`agent_role`, `ghost_id = node_id`, `status: 'accepted'`). **Do NOT**
`inngest.send('canvas/node.created')` — semantically an AI acceptance is not a
new-node event, regardless of whether anything currently subscribes to it.
- **Idempotent:** the FE may retry. Enrich is an overwrite (safe); guard the
  `node_sequence` append + audit insert so a retry doesn't duplicate.
- `agent_role` for the audit: accept it in the payload (the FE knows it from the
  spawn descriptor) — do not re-derive.

## Depends On
None. Independent of task-01/02/03.

## Definition of Done
- [ ] `canvasEventSchema` accepts `ghost.accepted` with a required non-empty `node_ids[]`; create paths unchanged
- [ ] The branch enriches each node (summary + direction_marker + embedding + sequence) and writes an `ai_contributions` row
- [ ] It does **NOT** enqueue `canvas/node.created` (no agent re-trigger) — asserted in a test
- [ ] Retrying the same `ghost.accepted` does not duplicate the sequence entry or the audit row
- [ ] `src/db/ai-contributions.ts` created (first writer for `ai_contributions`); uses `logger`, no `console.log`
- [ ] FRONTEND-CONTRACT.md §7.3 rewritten (accept ⇒ send `ghost.accepted`); §11 P0 row #3 removed; CANVAS-SYNC.md noted
- [ ] `npm run build` compiles

## Test Plan
- Unit: `ghost.accepted` with two node ids ⇒ two enrich calls + two audit rows,
  and `inngest.send` is **not** called with `canvas/node.created`.
- Unit: invalid payload (`ghost.accepted` without `node_ids`) ⇒ 400.
- Unit: replaying the same event ⇒ no duplicate `node_sequence` / `ai_contributions`.
- Unit: `node.created` / `edge.created` behaviour is unchanged (regression).

## Notes / follow-up (out of scope)
- This writes the `accepted` audit record only. Full `ai_contributions` lifecycle
  (a `pending` row at spawn, flipped on accept/reject/ignore) is a separate story
  — flagged in the parent story's Open Questions.
