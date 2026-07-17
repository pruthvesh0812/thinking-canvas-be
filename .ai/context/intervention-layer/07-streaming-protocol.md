---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-01 (RedisMessage), task-04 (offer publishers), task-08 (timer_ms)
stale-after-days: 30
referenced-from: intervention-layer/README.md, CANVAS-SYNC.md
---

# 07 · The Streaming Protocol

> The intervention layer generalises the ghost-streaming protocol. Code:
> `types/index.ts` (`RedisMessage`), `src/streaming/offer.ts` (publishers),
> `src/routes/stream.ts` (SSE forwarder — unchanged).

---

## What is done

The Redis pub/sub channel `canvas:stream:${sessionId}` used to carry three message
types (`spawn`, `chunk`, `done`). The intervention layer adds three more, so the
full `RedisMessage` union is now:

```typescript
type RedisMessage =
  | { type: 'waiting';  offer: InterventionOffer; timer_ms: number }  // mature + parked — starts the FE timer
  | { type: 'offer';    offer: InterventionOffer }                    // low-intensity show (glow / sidebar card)
  | { type: 'withdraw'; offer_id: string }                           // supersede / no-longer-mature
  | { type: 'spawn';    descriptor: SpawnDescriptor }                // ghost graph structure (existing)
  | { type: 'chunk';    target: string; data: string }               // a token for one ghost_id (existing)
  | { type: 'done' }                                                  // stream finished (existing)
```

Publishers live in `src/streaming/offer.ts`: `publishWaiting` (carries the
receptivity-tuned `timer_ms`), `publishOffer`, `publishWithdraw` — mirrors of
`spawn.ts`'s `publishSpawn`.

The three tiers of "loudness," from quietest to loudest:

- **`waiting`** — "something is ready; here's the timer." No content yet, just the
  offer handle + timer length.
- **`offer`** — the low-intensity show: a glow or a sidebar card
  (see [`03-show-ruleset.md`](./03-show-ruleset.md)).
- **`spawn` → `chunk`… → `done`** — the maximal form: a full ghost pair
  materialising and streaming token-by-token. This is the top rung, unchanged.

---

## Why it is done this way

- **One channel, one union.** The SSE endpoint stays payload-agnostic — it forwards
  whatever it receives and only special-cases `done`/`ping` for connection
  lifecycle. Adding message types didn't require touching `stream.ts` at all.
- **The ghost stream is the *maximal* intervention, not a separate thing.** Framing
  `waiting`/`offer` as quieter rungs of the same protocol keeps the model coherent:
  the layer chooses how far up the loudness ladder to climb.
- **Still no canvas *state* over Redis.** The new messages carry *offers and
  signals*, not node/edge writes. The single-user rule holds: user nodes and edges
  are written by the frontend directly to Supabase; the backend never pushes
  unsolicited canvas state.

---

## Relation to the frontend

- `stream.ts` forwards every message verbatim; the FE switches on `type`.
- **`waiting`** → start the processing timer using `timer_ms`; render the ambient
  waveform / glow.
- **`offer`** → render the glow-or-card, choosing the surface from viewport position
  and `directness` (see [`03-show-ruleset.md`](./03-show-ruleset.md)).
- **`withdraw`** → remove the waiting/shown offer with that `offer_id`.
- **`spawn`/`chunk`/`done`** → the existing ghost-materialisation flow, unchanged.
- The FE keys offers/ghosts by **`(anchor_node_id, seq)`** so a late stale message
  is ignored (see [`06-concurrency-and-versioning.md`](./06-concurrency-and-versioning.md)).

---

## Key constraints

- **`stream.ts` is payload-agnostic** — don't add per-offer logic there; it only
  handles connection lifecycle (`done`/`ping`).
- **Never send canvas state over Redis** — only intervention signals + ghost
  streaming. This is non-negotiable #9 (amended); the ghost stream is its maximal
  form.
- **`timer_ms` belongs on `waiting`** — the FE must not hard-code the countdown; the
  backend tunes it by receptivity.
