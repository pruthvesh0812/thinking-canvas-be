---
feature: "intervention-spectrum"
type: task
task_id: task-05
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Concurrency & stale ordering: **single-flight per session** via `seq` /
`sessions.latest_seq`, supersession of a parked offer, and the **version guard**
re-checked at the publish boundary so a stale run aborts. See DESIGN.md §4e.

## Files to Touch
```
MODIFY:
  src/db/intervention-offers.ts  → allocateSeq(), isLatest(offer), markSuperseded()
  src/lib/guards.ts              → in-flight offer counts for canAgentFire; isStillLatest()
  src/pipeline/agent-pipeline.ts → supersede prior on new mature; guard before spawn + before stream
  src/streaming/offer.ts         → publishWithdraw() on supersede
  supabase/migrations/           → RPC for atomic seq allocation (like decrement_insight_turns)
```

## Mechanics
```typescript
// atomic — never read-modify-write (concurrent Inngest workers)
allocateSeq(session_id): Promise<number>   // = RPC bump of sessions.latest_seq, returns new value

// supersession: a NEW mature judgement pre-empts a parked one
markSuperseded(prevOfferId) + publishWithdraw(prevOfferId) + cancel the parked run

// version guard — checked BEFORE publishing spawn AND before streaming
async function assertLatestOrAbort(offer): Promise<boolean> {
  const latest = await getLatestSeq(offer.session_id)
  return offer.seq === latest            // false → abort silently (no spawn, no stream)
}
```
- Parked-run cancellation: Inngest `cancelOn` the supersede event, and/or the
  publish-boundary guard makes a lost run a no-op.
- Frontend keys ghosts by `(anchor_node_id, seq)` (note for FE — not this repo).

## Depends On
task-01 (`seq` / `sessions.latest_seq`), task-04 (the pipeline to guard).

## Definition of Done
- [ ] `allocateSeq` is atomic (RPC) — no read-modify-write
- [ ] A newer mature offer supersedes: prior `superseded` + `withdraw` published + parked run aborts
- [ ] A stale run aborts at the publish boundary (`seq != latest_seq`) — no spawn, no stream
- [ ] `canAgentFire` treats a `waiting`/`shown` offer as in-flight
- [ ] `npm run build` compiles
