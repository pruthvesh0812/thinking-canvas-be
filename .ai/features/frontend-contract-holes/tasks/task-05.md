---
feature: "frontend-contract-holes"
type: task
task_id: task-05
story: ../story.md
created: 2026-07-19
status: done
---

## Scope
Hole #5 (new, found in the 2026-07-19 re-audit) — the intervention pipeline's
own `finalize` step publishes `done` **before** it publishes the offer's
`directness`/`headline`, and because hole #3 (SSE closes on `done`) is still
open, that offer publish races a connection that has already been torn down.
In practice it is not a rare race — it loses every time. The result: the Show
ruleset's entire output (DESIGN.md §5 — "how loudly to present it," the
feature's core deliverable) never reaches a live frontend connection.

**Exact sequence today, `src/pipeline/agent-pipeline.ts` `Step 8: Show +
finalize`:**
```typescript
await step.run('finalize', async () => {
  await publishDone(session_id)                              // (a) closes the SSE connection — see stream.ts
  // ...compute directness/headline...
  await updateOfferStatus(offer.id, 'shown', { directness, headline })
  const shownOffer = { ...offer, status: 'shown' as const, directness, headline }
  await publishOffer(session_id, shownOffer)                  // (b) published into an already-torn-down subscription
  // ...appendMessage persists the ghost_pair turn...          // (c) also after (a) — see task-01
})
```

`src/routes/stream.ts`'s `cleanup()` runs synchronously the moment `done` is
written to the SSE response — `clearInterval(ping)`, `void sub.unsubscribe()`,
then `resolve()` immediately (not awaited) — which ends the Hono response.
Nothing published on this channel after that point can reach this connection,
and Upstash pub/sub has no replay. Since (a) is `await`ed before (b) even
starts, (b) is issued well after the client's subscription has already been
torn down.

## Files to Touch
```
MODIFY:
  src/pipeline/agent-pipeline.ts                          → reorder `finalize`
  .ai/context/intervention-layer/03-show-ruleset.md       → correct the "publishes it" claim
  .ai/context/intervention-layer/07-streaming-protocol.md → note the ordering constraint
  .ai/context/CANVAS-SYNC.md                              → cross-reference if it documents finalize ordering
```
No changes to `articulator-pipeline.ts` / `outer-sub-pipeline.ts` — neither
creates or publishes an `InterventionOffer`, so this bug doesn't exist there.

## Implementation notes
- **Reorder `finalize` so `publishDone` is the LAST statement in the step** —
  after `updateOfferStatus` + `publishOffer` AND after `appendMessage`:
  1. Compute `directness` / `headline` (pure + one `getReceptivity` read).
  2. `updateOfferStatus(offer.id, 'shown', { directness, headline })`.
  3. Build the `ghost_pair` and `appendMessage` (persists the turn — this is
     also task-01's requirement; do both reorders in the same edit).
  4. Derive `turn_index` per task-01 (match `context_ghost_id`).
  5. `publishOffer(session_id, shownOffer)`.
  6. `publishDone(session_id, { thread_id, turn_index, ...ghost ids })` — LAST.
  7. Temporal-deferral decrement can stay anywhere after step 3 — it has no
     Redis publish, so its position relative to `done` doesn't matter.
- **This does not by itself fix the cross-pipeline collision** (a *different*
  pipeline's `done` tearing down the connection while this offer is still
  `waiting`, unpublished) — that needs task-03. This task only fixes the
  self-inflicted race where a pipeline's own `finalize` outruns its own `done`.
- **Coordinate with task-01**, which touches the same block for a different
  reason (turn attribution). Implement both in one edit to `agent-pipeline.ts`
  — see task-01's "Re-verified 2026-07-19" note.

## Depends On
None to start (this is a pure reorder, independent of task-01/02/03/04's
scope) — but **must be implemented together with task-01 for
`agent-pipeline.ts`**, since both reorder the same `finalize` step and a
partial reorder from either task alone leaves the other's bug in place.

## Definition of Done
- [ ] In `agent-pipeline.ts`'s `finalize`, `publishDone` is textually the last
      publish call — after `updateOfferStatus`/`publishOffer` and after
      `appendMessage`
- [ ] A test asserts call order: `publishOffer` and `appendMessage` both fire
      before `publishDone`
- [ ] An integration test exercising one full intervention flow (trigger →
      process → generate → finalize) against a live SSE client observes the
      `offer` message (with `directness`/`headline` populated) arriving on the
      connection before `done` closes it
- [ ] `articulator-pipeline.ts` / `outer-sub-pipeline.ts` unaffected (no offer
      logic there — regression check only)
- [ ] `.ai/context/intervention-layer/03-show-ruleset.md` and
      `07-streaming-protocol.md` updated to state the ordering constraint
      ("the offer publish must precede `done`") rather than silently assuming it
- [ ] `npm run build` compiles

## Test Plan
- Unit: spy on `publishOffer`/`appendMessage`/`publishDone`; run `finalize`;
  assert `publishDone` is the last of the three called.
- Integration: connect an `EventSource`-equivalent test client to
  `/api/stream/:sessionId`, run an intervention through to completion, assert
  an `offer` message with non-null `directness`/`headline` is received before
  the connection closes (i.e., before/without needing a reconnect).
- Regression: existing `articulator-pipeline.ts` / `outer-sub-pipeline.ts`
  finalize tests unaffected (they have no offer to reorder around).
