---
feature: "frontend-contract-holes"
type: story
created: 2026-07-05
status: draft
git_branch: "fix/frontend-contract-holes-2026-07-05T1200"
---

> **Source:** the 2026-07-05 frontend AI-context audit. These are the four
> backend surfaces that force a frontend workaround today — catalogued in
> `.ai/context/FRONTEND-CONTRACT.md` §11 (P0 rows) and referenced from
> `CANVAS-SYNC.md`. Fixing them deletes the corresponding §7.2 / §10 workarounds.

> **Re-audit note (2026-07-19):** the intervention-spectrum feature (all 9
> tasks) merged into `main` since this story was written and rewrote
> `agent-pipeline.ts` around a decide→wait→generate handshake. Re-verified
> holes #1–4 line-by-line against the new code: **all four are still fully
> open** — `streaming/tokens.ts` and `routes/stream.ts` are byte-for-byte
> unchanged, and `canvasEventSchema` still has no `ghost.accepted` variant.
> Nobody built against this story (all statuses were still `draft`). Two things
> changed the picture enough to warrant new content, not just a re-stamped date:
> 1. **A fifth, more severe hole opened** — the new `finalize` step in
>    `agent-pipeline.ts` publishes the intervention offer's `directness`/
>    `headline` (the Show ruleset's entire output — DESIGN.md §5, the feature's
>    core deliverable) **after** `publishDone`, which — because hole #3 is
>    still open — closes the SSE connection first. That message is now
>    systematically dropped. See **task-05**.
> 2. **`canvas/node.created` is now a dead Inngest event** — nothing subscribes
>    to it (`src/index.ts` only wires `agentPipeline` to
>    `canvas/intervention.trigger`). The old debounced auto-fire model is gone;
>    Expander/Stress-Tester now only run via an explicit
>    `POST /api/intervention/trigger`. This incidentally removes the specific
>    risk task-04 was framed around (firing `node.created` for an accepted
>    ghost no longer re-triggers an agent — there's no listener left to
>    trigger) but does **not** close the hole: relying on an event nobody
>    happens to subscribe to today is an undocumented accident, not a contract.
>    task-04 still stands, reframed accordingly.

## What
Close the backend contract holes that make `thinking-canvas-web` unbuildable
without reverse-engineering the pipeline: (1) an un-addressable `done`, (2) a
raw, unsplit token stream, (3) an SSE channel that closes on every `done`,
(4) no way to persist an accepted ghost without an undocumented reliance on a
currently-unsubscribed event, and (5) the intervention offer's own show-signal
losing a race against its own `done`.

## Why
The backend is feature-complete (features 1–10) but the frontend has not
started, so these holes are cheap to close now and expensive later — every one
of them would otherwise harden into a permanent FE workaround (a thread-polling
race, a cross-chunk marker parser, a reconnect-loss reconciler, and NULL-enriched
AI nodes). All five are small, isolated backend changes. Landing them before FE
work begins means the frontend needs **zero** workarounds against this contract.

## The five holes → the five tasks

| # | Hole (FE symptom today) | Task | Fix in one line |
|---|---|---|---|
| 1 | `done` carries nothing; the ghost_pair turn is persisted *after* `done` → FE can't get `thread_id`/`turn_index` for `POST /api/ghost-status` without polling `agent_threads` (FRONTEND-CONTRACT.md §7.2) | **task-01** | Persist the turn **before** publishing `done`, and put `thread_id`/`turn_index`/ghost ids **into** the `done` message |
| 2 | Agent markers (`[NODE_TYPE:]`, `[QUESTION]`) stream raw; every chunk targets the context ghost; FE must buffer + parse + re-route (FRONTEND-CONTRACT.md §7.1) | **task-02** | Split the stream **server-side**: strip `[NODE_TYPE:]` → typed message; route post-`[QUESTION]` text to the question ghost id |
| 3 | The SSE route resolves on the first `done`, closing the connection → EventSource must reconnect (lossy; no pub/sub replay) and a `done` from one of two concurrent generations kills the other (FRONTEND-CONTRACT.md §6.1) — now much likelier, since an intervention offer can sit parked for up to 10 minutes | **task-03** | Hold the connection open until client abort; `done` becomes purely informational |
| 4 | Accepted ghosts have no *intentional* enrich path — the FE either skips notify (AI nodes get NULL summary/embedding) or relies on `canvas/node.created` currently having no subscriber (undocumented, fragile) | **task-04** | New `ghost.accepted` event: enrich (summary+embedding) + sequence + audit, as an explicit contract — not an accident of the current wiring |
| 5 | **NEW (2026-07-19).** In `agent-pipeline.ts`'s `finalize` step, `publishOffer` (carrying `directness`/`headline` — the Show ruleset's output) fires *after* `publishDone`, which closes the connection (hole #3) first — the offer is dropped every time | **task-05** | Publish `done` **last** in `finalize` — after the offer publish and the thread append, not before either |

## Blast Radius
| Component | Impact |
|---|---|
| `types/index.ts` | `RedisMessage`: enrich `done` (task-01), add `node_type` variant + document chunk routing (task-02); extend `canvasEventSchema.event_type` with `ghost.accepted` (task-04) |
| `src/streaming/tokens.ts` | `publishDone()` grows an ids argument (task-01); `streamAgentOutput()` becomes marker-aware and takes both ghost ids (task-02) |
| `src/pipeline/agent-pipeline.ts`, `articulator-pipeline.ts`, `outer-sub-pipeline.ts` | `finalize`/`Step 8: Show + finalize` reordered (offer publish + persist → then `done` last); pass ids to `publishDone` (task-01); pass both ghost ids to the stream helper (task-02); in `agent-pipeline.ts` specifically, `publishOffer`/`updateOfferStatus` must also land before `publishDone` (task-05) |
| `src/routes/stream.ts` | Stop resolving on `done` (task-03) |
| `src/routes/canvas-event.ts` | New `ghost.accepted` branch (task-04) |
| `src/db/ai-contributions.ts` | **NEW** — the `ai_contributions` audit table has a schema but **zero writers today**; task-04 gives it its first (accepted-ghost record) |
| `.ai/context/intervention-layer/03-show-ruleset.md`, `07-streaming-protocol.md` | Currently describe the offer publish as if it reliably reaches the client — task-05 corrects this once fixed (or flags it as a known bug beforehand) |
| `.ai/context/FRONTEND-CONTRACT.md`, `CANVAS-SYNC.md` | Each task removes its own workaround text + §11 row in the same change (non-negotiable: FE-consumed change ⇒ update the contract) |

## Files to Touch
```
MODIFY:
  types/index.ts                        (RedisMessage done+node_type; canvasEventSchema)
  src/streaming/tokens.ts               (publishDone ids; marker-aware streaming)
  src/pipeline/agent-pipeline.ts        (finalize reorder + ids + offer-before-done — task-01 + task-05)
  src/pipeline/articulator-pipeline.ts  (finalize reorder + ids)
  src/pipeline/outer-sub-pipeline.ts    (finalize reorder + ids)
  src/routes/stream.ts                  (hold-open lifecycle)
  src/routes/canvas-event.ts            (ghost.accepted branch)
  .ai/context/intervention-layer/03-show-ruleset.md      (offer delivery is no longer racing done)
  .ai/context/intervention-layer/07-streaming-protocol.md (note the ordering constraint)
  .ai/context/FRONTEND-CONTRACT.md      (retire §7.2/§7.1/§6.1/§7.3 workarounds + §11 rows)
  .ai/context/CANVAS-SYNC.md            (done payload, SSE lifecycle, chunk routing)
CREATE:
  src/db/ai-contributions.ts            (first writer for ai_contributions)
```

## Redis / Streaming Protocol (amendment)
`spawn`/`chunk` unchanged in intent; `done` gains attribution fields; a
`node_type` signal is added. `stream.ts` stays payload-agnostic (only
special-cases `ping`, and — after task-03 — no longer `done`).
```typescript
| { type: 'done'; thread_id; turn_index; trigger_node_id; context_ghost_id; question_ghost_id }  // task-01 (was: {type:'done'})
| { type: 'node_type'; target: string; node_type: ContextNodeType }                              // task-02 (new)
```

## Supabase Migration
**None.** No schema changes. `ai_contributions` already exists (migration
`…0002`); task-04 only adds the first application-layer writer. Turn-index is
derived by matching the unique `context_ghost_id` in the thread — no RPC change.

## Inngest Events
| Event | Change |
|---|---|
| `canvas/node.created` | **Unchanged — and now has zero subscribers** (the intervention-spectrum merge retired the debounced auto-fire model). task-04's `ghost.accepted` still deliberately does NOT fire it: semantically an AI acceptance isn't a new-node event, independent of whether anything currently listens. |

No new Inngest events. `ghost.accepted` is handled inline in the route (enrich is
synchronous today, same as `node.created`'s enrich step).

## Risks
- **`RedisMessage` is a shared surface** — task-01 (`done`) and task-02
  (`node_type` + chunk routing) both edit the union and `tokens.ts`. Sequence
  them (task-02 after task-01) to avoid a churned merge; task-03/task-04 are
  independent.
- **Server-side vs frontend marker parsing (task-02)** is a genuine design
  choice — see Open Questions. Picking "server-side" restores what the
  `outer-sub-pipeline` comment already assumed ("the token layer splits the
  `[QUESTION]` section") and keeps "backend owns structure+content, FE owns
  visuals" clean, but adds a cross-chunk buffer in `tokens.ts`.
- **`done` ordering is load-bearing (task-01):** persisting the turn before
  publishing `done` means an `appendMessage` failure must abort *before* `done`
  — don't swallow it, or the FE waits on a `done` that never comes.
- **Idempotency (task-04):** the FE may retry `ghost.accepted`; re-enriching the
  same node must be safe (it is — summary/embedding are overwrites; guard the
  `node_sequence` append + audit insert against duplicates).
- **task-01 and task-05 touch the same `finalize` block in `agent-pipeline.ts`
  — implement together.** task-01's principle ("persist/publish every side
  effect before `done`") only fully holds for this file if it also covers the
  offer publish task-05 fixes. Doing task-01's reorder there without task-05
  re-introduces exactly the bug task-05 exists to close.
- **task-03's payoff is now bigger, not just "nice to have".** With the
  decide→wait→generate handshake, an offer can sit `waiting` for up to 10
  minutes (`step.waitForEvent(..., timeout: '10m')`). Any other pipeline's
  `done` on the same session channel (Articulator, Outer-Sub) can tear down the
  shared SSE connection at any point in that window, silently losing the
  parked offer's eventual `waiting`→`offer`/`withdraw` transition. task-05 fixes
  the *same-pipeline* self-race; only task-03 fixes this *cross-pipeline* one.

## Open Questions
- **task-02 direction:** split markers server-side (recommended) **or** formally
  bless FE parsing and just document it? If server-side: does `[ARTICULATION n]`
  stay in-band (it's sub-structure of a *single* Articulator node, not a ghost
  split — recommended: leave in-band, FE sub-renders) or also get structured?
- **task-04 shape:** one `ghost.accepted` event carrying an array of accepted
  node ids, or one call per node? (Rec: array — a pair accept is 1–2 nodes.)
- **task-04 audit scope:** does this task also backfill `ai_contributions` at
  *spawn* time (full lifecycle pending→accepted/rejected), or only write the
  `accepted` record now and leave lifecycle to a later story? (Rec: accepted-only
  now; note the gap.)

## Test Plan
Vitest (`npm run test`). Per-task unit tests listed in each task file. Overall:
- `RedisMessage` type round-trips (enriched `done`, `node_type`) compile + parse.
- Marker-split unit tests with markers straddling chunk boundaries.
- `stream.ts`: two interleaved generations both complete on one connection; no
  close until abort.
- `canvas-event` `ghost.accepted`: enriches + audits, does **not** enqueue
  `canvas/node.created`.
- `agent-pipeline.ts` `finalize`: `publishOffer` and `appendMessage` are both
  called before `publishDone`, in that step's call order (task-05).

## Known Issues (from learnings.json)
None in `.ai/memory/learnings.json` touch streaming, the SSE route, or
canvas-event (the single entry is a Spring Boot `sdk-delivery-filter` note from a
different project — ignore).

## Task Breakdown
Full task files in [`tasks/`](./tasks/).
- **task-01:** `done` attribution + `finalize` reorder (persist-before-publish) — hole #1 · *implement together with task-05 in `agent-pipeline.ts`*
- **task-02:** server-side marker split (`[NODE_TYPE:]` → typed msg; `[QUESTION]` → question ghost) — hole #2 · *after task-01*
- **task-03:** SSE hold-open lifecycle — hole #3
- **task-04:** `ghost.accepted` enrich-only event + first `ai_contributions` writer — hole #4 (reframed 2026-07-19: `canvas/node.created` has no subscriber today, but that's an accident, not a contract)
- **task-05 (NEW 2026-07-19):** publish `done` last in `agent-pipeline.ts`'s `finalize` — the offer's `directness`/`headline` is currently dropped every time — hole #5
