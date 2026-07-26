---
feature: "frontend-contract-holes"
type: task
task_id: task-03
story: ../story.md
created: 2026-07-05
status: done
---

## Scope
Hole #3 — stop closing the SSE channel after every generation. `src/routes/
stream.ts` resolves its holding promise on the first `done` message, which ends
the HTTP response and forces the browser's EventSource to reconnect. Because
Upstash pub/sub has no replay, any `spawn`/`chunk` published during the ~3s
reconnect window is lost, and when two generations share one session channel
(debounced Expander + immediate Articulator) the first `done` closes the
connection mid-stream for the other (FRONTEND-CONTRACT.md §6.1). Make the
connection live for the whole session: hold it open until **client abort** (or a
write error); `done` becomes purely informational and is still forwarded.

> **Re-verified 2026-07-19:** `stream.ts` is byte-for-byte unchanged since this
> task was written — still open. The payoff is now bigger: the merged
> intervention-spectrum feature can park an offer in `waiting` for up to **10
> minutes** (`step.waitForEvent(..., timeout: '10m')` in `agent-pipeline.ts`),
> versus the old ~seconds-long debounce window. Any *other* pipeline's `done`
> on the same session channel (Articulator, Outer-Sub) can now tear down the
> shared connection at any point during that much longer wait, silently
> dropping the parked offer's eventual `waiting`→`offer`/`withdraw` transition
> until the client reconnects. This is a separate, cross-pipeline version of
> the same-pipeline bug **task-05** fixes — task-03 is what closes it fully.

## Files to Touch
```
MODIFY:
  src/routes/stream.ts              → remove the resolve-on-done; keep ping + abort cleanup
  .ai/context/CANVAS-SYNC.md        → "Hono SSE Endpoint" lifecycle section
  .ai/context/FRONTEND-CONTRACT.md  → rewrite §6.1; drop §11 P0 row #2
```

## Implementation notes
- In the `sub.on('message', …)` handler, keep forwarding every message via
  `stream.writeSSE`, but **remove** the `if (message.type === 'done') cleanup()`
  branch. `done` is now just another forwarded event.
- The holding promise resolves **only** via `stream.onAbort(cleanup)` (client
  disconnect / EventSource close) or a `writeSSE` rejection (`.catch(cleanup)`),
  which is the real backpressure/disconnect signal.
- Keep the 25s `ping` keepalive and the idempotent `settled` guard in `cleanup`
  (unsubscribe + clearInterval exactly once).
- No behavioural change to publishers — they still publish `done` per generation;
  it simply no longer tears down the subscription. One session = one long-lived
  subscription for as many generations as the session produces.

## Depends On
None. Independent of task-01/02/04/05. (Synergistic with task-01: a single
held-open connection is what lets the enriched, per-ghost `done` disambiguate
concurrent generations. Synergistic with task-05: task-05 fixes the
same-pipeline offer-after-done race regardless of whether this task lands;
task-03 is what additionally protects a parked offer from an *unrelated*
pipeline's `done` — neither blocks the other.)

## Definition of Done
- [ ] `stream.ts` no longer resolves/cleans up on `done`; only on abort or write error
- [ ] `ping` keepalive and single-shot `cleanup` (unsubscribe + clearInterval) preserved
- [ ] Two generations published back-to-back on one channel both reach the client on one connection
- [ ] `done` is still forwarded to the client (not swallowed)
- [ ] CANVAS-SYNC.md + FRONTEND-CONTRACT.md §6.1 updated; §11 P0 row #2 removed
- [ ] `npm run build` compiles

## Test Plan
- Unit/integration: publish `spawn → chunk → done → spawn → chunk → done` on one
  channel; assert the SSE handler forwards all six and unsubscribes **once**, on
  abort — not after the first `done`.
- Unit: `stream.onAbort` ⇒ `sub.unsubscribe()` and `clearInterval(ping)` each run
  exactly once (the `settled` guard holds).
- Unit: a `writeSSE` rejection triggers the same single cleanup.
