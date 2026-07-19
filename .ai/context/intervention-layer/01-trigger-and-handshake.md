---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-04 (handshake), task-06 (canvas sync)
stale-after-days: 30
referenced-from: intervention-layer/README.md
---

# 01 · The Trigger and the Handshake

> The **decide → wait → generate** flow. This is the spine everything else hangs
> off. Code: `src/pipeline/agent-pipeline.ts`, `src/routes/intervention.ts`,
> `src/streaming/offer.ts`.

---

## What is done

The old pipeline judged and generated in one uninterrupted run. Now it is split
into two backend phases with the human's consent-timer between them:

```
FRONTEND                          BACKEND (Inngest run)
────────                          ─────────────────────
trigger ruleset passes  ──POST──▶ 1. Attunement (posture from last 5 nodes)
                                  2. guard: pending ghost? → drop
                                  3. JUDGE: mature? which agent? where?
                                        not mature → silent, nothing shown
                                        mature ─┐
                                                ▼
   timer starts   ◀──"waiting"── 4. create offer (status=waiting) + publish
   (glow/waveform)                   the "waiting" message over SSE
      │
      │ user lets it lapse,
      │ hits "process now",
      │ or defers
      ▼
   POST /process ─────────────▶  5. run wakes on waitForEvent
                                  6. re-judge IF the canvas changed during the wait
                                  7. generate: spawn → stream tokens → done
                                  8. show: set directness + headline, publish "offer"
```

The two Inngest events that drive it:

| Event | Fired by | Effect |
|---|---|---|
| `canvas/intervention.trigger` | `POST /api/intervention/trigger` | starts the run: judge → waiting → park |
| `canvas/intervention.process` | `POST /api/intervention/process` | wakes the parked run to generate |

The run parks on `step.waitForEvent('go', { timeout: '10m', match: 'data.offer_id' })`.
The `offer_id` is **pre-generated in the route** so the process event can be matched
back to exactly the run that is waiting for it.

---

## Why it is done this way

- **Consent before cost.** Step 7 (the only step that spends content-agent tokens)
  cannot run until the human resolves the timer. A user who never looks at the
  timer costs one judge call, not a full generation.
- **Eager judge, lazy generation.** The judge runs immediately on a trigger so the
  timer only ever appears when there is genuinely something to show. The waveform /
  glow is honest: it means "ready," not "thinking about whether to think."
- **Durable wait.** The offer is persisted (not held in memory) precisely because
  the run may sit parked for minutes across worker restarts. See
  [`05-receptivity-and-retention.md`](./05-receptivity-and-retention.md) for the
  offer's lifecycle.
- **Abandoned tabs self-clean.** The hard `10m` timeout means a user who walks away
  never leaves a run parked forever — on timeout the offer is `expired` and a
  `withdraw` is published.

---

## Relation to the frontend

This is the most FE-coupled part of the layer. The contract:

1. **The trigger gate is the frontend's job.** The FE watches raw events (cursor,
   dwell, action class, its own deferral timer) and only POSTs `/trigger` when its
   cheap ruleset passes. Maturity is deliberately *not* in that ruleset — that is
   the backend judge's call. So the backend judge only ever runs on a real
   attention signal.
2. **The processing timer is a frontend surface.** The backend's `waiting` message
   *starts* it; the FE renders the countdown (default 10s, 5s on high readiness —
   the exact `timer_ms` rides on the message, see
   [`05-receptivity-and-retention.md`](./05-receptivity-and-retention.md)). The FE
   decides how the countdown looks (the ambient "processing" waveform).
3. **The FE reports how the timer resolved.** `POST /process` carries a
   `reason: 'manual' | 'lapse'` — `manual` when the user hit "process now" or
   resumed a paused timer (they were watching), `lapse` when it ran out on its own.
   That single flag becomes the *attention state* the show ruleset reads (see
   [`03-show-ruleset.md`](./03-show-ruleset.md)).
4. **Source of truth stays Supabase.** The FE writes nodes/edges directly to
   Supabase, then POSTs the id. The backend always reads post-write state. There is
   **no "push full canvas state to backend" endpoint** and there must not be.

---

## The re-judge-on-change step

While the run is parked, the user may keep working. At wake (step 6) the run
compares the canvas's **context fingerprint** now against the one stamped on the
offer:

- unchanged → reuse the cached route, generate immediately;
- changed → re-run Attunement + judge. Still mature → generate with the fresh
  route; no longer mature → abort and `withdraw`.

The timer thus does double duty: it is both the "let them finish" window and the
thing that keeps the decision honest. The fingerprint mechanism is described in
[`04-impact-check-and-staleness.md`](./04-impact-check-and-staleness.md).

---

## The routes

`src/routes/intervention.ts`:

| Route | Purpose |
|---|---|
| `POST /api/intervention/trigger` | FE's trigger ruleset passed — fire the judge |
| `POST /api/intervention/process` | timer resolved (`manual`/`lapse`) — wake the parked run |
| `POST /api/intervention/dismiss` | user waved the offer off — receptivity signal, no event |
| `POST /api/intervention/ghost-interaction` | accept/reject/hover on an OLD ghost — runs the Impact Check |

`dismiss` is a plain DB write plus a receptivity update — it fires no Inngest event
because there is no parked run to wake (the user is declining, not proceeding).

---

## Key constraints

- **Never generate before the wait resolves.** Steps 7–8 always sit behind the
  `waitForEvent`. Adding a generation step before it would defeat the whole layer.
- **`offer_id` is minted in the route, not the pipeline** — the `waitForEvent`
  match depends on it existing before the trigger event is sent.
- **The judge is eager, generation is lazy** — keep that ordering. Judging after
  the wait would make the timer meaningless.
