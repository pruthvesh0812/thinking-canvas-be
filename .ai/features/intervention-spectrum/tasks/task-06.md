---
feature: "intervention-spectrum"
type: task
task_id: task-06
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Extend the **create-only** canvas sync so deletes/edits/re-parents reach the
backend, and make `node.updated` re-enrich summary + embedding. Source of truth
stays Supabase — no push-full-state endpoint. See DESIGN.md §4g.

> The fingerprint DB trigger itself ships in task-01; this task is the app-level
> sync surface it depends on being fed.

## Files to Touch
```
MODIFY:
  types/index.ts              → canvasEventSchema.event_type += node.updated | node.deleted | edge.deleted
  src/routes/canvas-event.ts  → handle the new event types
  src/db/nodes.ts, src/db/edges.ts → delete helpers if missing
```

## Behaviour
- `node.updated` → **re-run** the directional summary + embedding (the same enrich
  as `node.created`), because an edit makes the create-time values stale (DESIGN §4g).
- `node.deleted` / `edge.deleted` → fire the intervention re-evaluation event so the
  **Impact Check** (task-07) can run against an anchored node/edge that vanished.
  A node re-parent = `edge.deleted` + `edge.created`.
- **Ordering contract** (document at the route): FE writes to Supabase → *then*
  POSTs — so the judge always reads post-mutation state.

## Cross-repo dependency
The FE (separate repo, not started) must actually **persist all mutations** to
Supabase, not just creates. Note this in the route comments.

## Depends On
task-01 (fingerprint trigger + regenerated types). Prereq for task-07 (Impact Check).

## Definition of Done
- [ ] `canvasEventSchema` accepts `node.updated` / `node.deleted` / `edge.deleted`
- [ ] `node.updated` re-runs directional summary + embedding
- [ ] delete events fire the intervention re-eval event for the Impact Check
- [ ] write-then-notify ordering documented at the route
- [ ] `npm run build` compiles
