---
last-verified: 2026-07-17
verified-against: intervention-spectrum task-05 (concurrency + version guard)
stale-after-days: 30
referenced-from: intervention-layer/README.md
---

# 06 · Concurrency & Versioning

> The long "waiting" phase means a newer trigger can arrive while an older one is
> still parked. Freshest context must always win. Code: `src/lib/guards.ts`
> (`canAgentFire`, `isStillLatest`), `src/db/intervention-offers.ts`
> (`allocateSeq`, `markSuperseded`, `getInFlightForSession`),
> `supabase/migrations/*_allocate_session_seq.sql`.

---

## What is done

Because an offer can sit parked for minutes, two runs can overlap. The layer
guarantees the newer one wins, with a two-part mechanism:

### 1. Single-flight per session + a monotonic seq

- Every intervention gets a per-session **`seq`**, allocated atomically by the
  `allocate_session_seq` Postgres RPC (bump + `RETURNING` in one statement — never
  read-modify-write, or two workers hand back the same number).
- The session tracks **`latest_seq`** — the highest seq allocated so far.

### 2. Supersession (the common case)

When a new mature judgement arrives, the pipeline:

1. finds any in-flight offer for the session (`getInFlightForSession`),
2. marks it `superseded` (`markSuperseded`),
3. publishes a `withdraw` for it,
4. fires `canvas/intervention.superseded` with the *old* offer_id.

The parked run's Inngest `cancelOn: [{ event: 'canvas/intervention.superseded',
match: 'data.offer_id' }]` matches and cancels it.

### 3. The version guard (handles the race)

Cancellation always races — the stale run may already be past the cancel point and
generating. So every run **re-checks that it is still the latest at the publish
boundary**: `isStillLatest(offer)` compares `offer.seq` to the session's current
`latest_seq`, and it is called **twice** — before publishing `spawn`, and again
before streaming tokens. A stale run wakes, sees it lost, and **aborts silently** —
no spawn, no tokens, nothing to the frontend beyond the withdraw the winner already
sent.

> This is the answer to "what if the stale pipe finishes after the fresh one?" — it
> can't, because it re-checks and drops before it publishes anything.

### `canAgentFire()` — the pre-flight guard

Still runs before every judge route. It now blocks on **two** conditions:

- a **pending ghost pair** on the trigger node's thread (post-generation, pre-user-
  action) — the pre-existing check; and
- an **in-flight offer** (`waiting`/`shown`) for the same trigger node — the new
  pre-thread state the ghost-pair check would otherwise miss.

---

## Why it is done this way

- **An earlier judge saw less canvas.** Whichever run was triggered later has, by
  definition, the fresher context — so seq order is the correct tiebreak.
- **Cancellation alone is not enough.** Distributed cancel is best-effort and
  racy; the version guard is the belt to `cancelOn`'s suspenders. It is
  **mandatory, not optional** — it is the only thing that makes stale-ordering
  actually correct.
- **Single-flight keeps it simple for v1.** One user, one frontier → at most one
  live intervention per session. That assumption is encoded as the guard *key*
  being `session`.

---

## Relation to the frontend

- The FE keys ghosts by **`(anchor_node_id, seq)`**. A late, stale message carrying
  an older seq is simply ignored — idempotency on the FE side complements the
  backend guard.
- A `withdraw` message tells the FE to remove a waiting/shown offer that was
  superseded or is no longer mature (see [`07-streaming-protocol.md`](./07-streaming-protocol.md)).

---

## Forward compatibility

The guard is written as "latest seq **per key**." Today the key is `session`. When
branching-from-any-node lands, the key becomes `branch`/`subtree` — concurrent
pipelines on *different* branches will coexist, and only same-branch collisions
supersede. That is a key swap, not a redesign. Captured in
[`.ai/features/branching/story.md`](../../features/branching/story.md).

---

## Key constraints

- **`seq` allocation is atomic (RPC)** — never bump `latest_seq` with a read then a
  write in application code.
- **The version guard runs at every publish boundary** — before spawn *and* before
  streaming. Removing either check reopens the stale-finish race.
- **A stale run aborts silently** — it must not publish a withdraw or mutate offer
  status; the winning run already owns the frontend's state.
