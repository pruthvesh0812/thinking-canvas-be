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

## What
Close the four backend contract holes that make `thinking-canvas-web`
unbuildable without reverse-engineering the pipeline: (1) an un-addressable
`done`, (2) a raw, unsplit token stream, (3) an SSE channel that closes on every
`done`, and (4) no way to persist an accepted ghost without re-triggering the
agent pipeline.

## Why
The backend is feature-complete (features 1–10) but the frontend has not
started, so these holes are cheap to close now and expensive later — every one
of them would otherwise harden into a permanent FE workaround (a thread-polling
race, a cross-chunk marker parser, a reconnect-loss reconciler, and NULL-enriched
AI nodes). All four are small, isolated backend changes. Landing them before FE
work begins means the frontend needs **zero** workarounds against this contract.

## The four holes → the four tasks

| # | Hole (FE symptom today) | Task | Fix in one line |
|---|---|---|---|
| 1 | `done` carries nothing; the ghost_pair turn is persisted *after* `done` → FE can't get `thread_id`/`turn_index` for `POST /api/ghost-status` without polling `agent_threads` (FRONTEND-CONTRACT.md §7.2) | **task-01** | Persist the turn **before** publishing `done`, and put `thread_id`/`turn_index`/ghost ids **into** the `done` message |
| 2 | Agent markers (`[NODE_TYPE:]`, `[QUESTION]`) stream raw; every chunk targets the context ghost; FE must buffer + parse + re-route (FRONTEND-CONTRACT.md §7.1) | **task-02** | Split the stream **server-side**: strip `[NODE_TYPE:]` → typed message; route post-`[QUESTION]` text to the question ghost id |
| 3 | The SSE route resolves on the first `done`, closing the connection → EventSource must reconnect (lossy; no pub/sub replay) and a `done` from one of two concurrent generations kills the other (FRONTEND-CONTRACT.md §6.1) | **task-03** | Hold the connection open until client abort; `done` becomes purely informational |
| 4 | Accepted ghosts have no enrich path — the FE either skips notify (AI nodes get NULL summary/embedding) or fires `canvas-event` and re-triggers the pipeline on an AI node (FRONTEND-CONTRACT.md §7.3) | **task-04** | New `ghost.accepted` event: enrich (summary+embedding) + sequence + audit, **without** firing `canvas/node.created` |

## Blast Radius
| Component | Impact |
|---|---|
| `types/index.ts` | `RedisMessage`: enrich `done` (task-01), add `node_type` variant + document chunk routing (task-02); extend `canvasEventSchema.event_type` with `ghost.accepted` (task-04) |
| `src/streaming/tokens.ts` | `publishDone()` grows an ids argument (task-01); `streamAgentOutput()` becomes marker-aware and takes both ghost ids (task-02) |
| `src/pipeline/agent-pipeline.ts`, `articulator-pipeline.ts`, `outer-sub-pipeline.ts` | `finalize` step reordered (persist → then `done`); pass ids to `publishDone` (task-01); pass both ghost ids to the stream helper (task-02) |
| `src/routes/stream.ts` | Stop resolving on `done` (task-03) |
| `src/routes/canvas-event.ts` | New `ghost.accepted` branch (task-04) |
| `src/db/ai-contributions.ts` | **NEW** — the `ai_contributions` audit table has a schema but **zero writers today**; task-04 gives it its first (accepted-ghost record) |
| `.ai/context/FRONTEND-CONTRACT.md`, `CANVAS-SYNC.md` | Each task removes its own workaround text + §11 row in the same change (non-negotiable: FE-consumed change ⇒ update the contract) |

## Files to Touch
```
MODIFY:
  types/index.ts                        (RedisMessage done+node_type; canvasEventSchema)
  src/streaming/tokens.ts               (publishDone ids; marker-aware streaming)
  src/pipeline/agent-pipeline.ts        (finalize reorder + ids)
  src/pipeline/articulator-pipeline.ts  (finalize reorder + ids)
  src/pipeline/outer-sub-pipeline.ts    (finalize reorder + ids)
  src/routes/stream.ts                  (hold-open lifecycle)
  src/routes/canvas-event.ts            (ghost.accepted branch)
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
| `canvas/node.created` | **Unchanged.** task-04's `ghost.accepted` deliberately does NOT fire it (that is the whole point — no agent re-trigger on an AI node). |

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

## Known Issues (from learnings.json)
None in `.ai/memory/learnings.json` touch streaming, the SSE route, or
canvas-event (the single entry is a Spring Boot `sdk-delivery-filter` note from a
different project — ignore).

## Task Breakdown
Full task files in [`tasks/`](./tasks/).
- **task-01:** `done` attribution + `finalize` reorder (persist-before-publish) — hole #1
- **task-02:** server-side marker split (`[NODE_TYPE:]` → typed msg; `[QUESTION]` → question ghost) — hole #2 · *after task-01*
- **task-03:** SSE hold-open lifecycle — hole #3
- **task-04:** `ghost.accepted` enrich-only event + first `ai_contributions` writer — hole #4
