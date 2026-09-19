---
last-verified: 2026-07-05
verified-against: thinking-canvas-api src/routes/* + src/streaming/* + src/pipeline/* + src/agents/*.ts prompts + types/index.ts (actual implemented code, not design docs)
stale-after-days: 30
---

# API-CONTRACT.md

> **Load this when:** Calling any backend endpoint, handling SSE messages, shaping
> payloads, or deciding what the frontend vs the backend is responsible for.

This file documents the backend contract **as actually implemented** in
`thinking-canvas-api`. When in doubt, the backend repo's `types/index.ts` wins —
our `types/index.ts` is a mirror of it (see `.ai/skills/sync-contract-types.md`).

---

## The Division of Labour

```
FRONTEND WRITES:  user nodes + edges → Supabase directly (anon key, RLS)
                  accepted ghost nodes + edges → Supabase (owner: 'ai')
FRONTEND TELLS:   POST /api/canvas-event — IDs only, after the Supabase write
BACKEND WRITES:   node enrichment (summary, embedding), threads, insights,
                  learnings, observer structures — never user nodes/edges
BACKEND PUSHES:   ghost node pairs ONLY, via SSE. Nothing else, ever.
```

The backend reads the **authoritative row back from Supabase** on every canvas
event. It never trusts flags from the request body — which means the frontend
must write `edge_type` and `both_existing` correctly *before* notifying.

---

## Base URLs

| Env | Backend |
|---|---|
| Local | `http://localhost:3001` |
| Prod | Railway URL — `NEXT_PUBLIC_API_URL` |

CORS on the backend is locked to exactly one origin (`FRONTEND_URL`). If SSE or
fetches fail cross-origin, the backend env var is wrong — not a frontend bug.

---

## Endpoints

### `POST /api/canvas-event`

Notify the backend that a node or edge row now exists in Supabase. Fire this
**after** the Supabase insert succeeds — the backend immediately reads the row.

```typescript
// Request — canvasEventSchema
{
  canvas_id: string     // uuid
  session_id: string    // uuid
  event_type: 'node.created' | 'edge.created'
  node_id?: string      // required when node.created
  edge_id?: string      // required when edge.created
}
// Response: { ok: true } | 400 { error, issues } | 500 { error }
```

What the backend does with it (so you know what to expect on canvas):
- `node.created` → generates summary + embedding on the row, appends the node to
  `sessions.node_sequence`, then fires the **debounced** agent pipeline
  (~10s after the user pauses). A ghost pair *may* arrive on the stream.
- `edge.created` with `both_existing=true` (non-question) → **Articulator, immediate.**
- `edge.created` with `edge_type='question'` → **Outer Subconscious, immediate.**
- other edges → part of the debounced flow.

> Only creates exist today. There are **no** `node.updated` / `*.deleted` events —
> the backend can read stale state after client-side edits. Known gap (see below).

### `GET /api/stream/:sessionId` — SSE

The only server push channel. Open one `EventSource` per active session.

```typescript
// Every SSE data event is one JSON-encoded message:
type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }  // render empty ghost frames NOW
  | { type: 'chunk'; target: string; data: string } // append data to ghost node `target`
  | { type: 'done' }                                 // pair fully streamed
  | { type: 'ping' }                                 // keepalive every 25s — ignore
```

Protocol sequence per ghost pair: `spawn` → *(~1.5s gap for your animation)* →
`chunk`* → `done`. **Every `chunk` targets `context_node.ghost_id`** — the
backend streams the agent's raw output (one stream, markers included) and never
targets the question node or strips markers. The frontend parses `[NODE_TYPE:]`
/ `[QUESTION]` / `[ARTICULATION n]` out of that stream itself (Known Gap #6).
The 1.5s gap is a real backend sleep — animate the empty frames during it.
Full frontend handling + the marker grammar in `GHOST-STREAMING.md`.

### `POST /api/ghost-status`

Record the user's accept/reject decision on a ghost pair.

```typescript
// Request — ghostStatusSchema
{
  thread_id: string                                  // uuid  ⚠ see Known Gaps
  turn_index: number                                 // which assistant turn in the thread
  canvas_id: string
  session_id: string
  context_node_status: 'accepted' | 'rejected'
  question_node_status: 'accepted' | 'rejected' | null  // null when pair has no question node
  rejection_reason?: 'too_abstract' | 'too_technical' | 'skip_for_now'
  interacted_at: number                              // unix ms
}
// Response: { ok: true } | 400 | 404 | 500
```

A context rejection fires the Rejection Insights Engine backend-side — always
collect a reason via `RejectionReasonSelector` before sending a rejection
(backend defaults to `skip_for_now` if omitted).

### `POST /api/session/start`

```typescript
// Request: { canvas_id: string }
// Response: { session_id: string }
```

Creates the session row and (on canvas reopen) drops a session-boundary marker
into every agent thread. Call this when the user opens a canvas without an
active session — before any node can be created.

### `POST /api/session/complete`

```typescript
// Request: { session_id: string, canvas_id: string, carry_forward_ids: string[] }
// Response: { ok: true }   — the work is ASYNC
```

Enqueues the session-complete pipeline: Observer runs over the whole canvas,
its observations are persisted as `session_learnings` rows, then the session is
closed. **Nothing streams back** — the response is an ack. The Session Complete
UI reads `session_learnings` / `observer_structures` from Supabase afterwards
(see `SESSION-FLOWS.md`).

### `POST /api/stripe/webhook`

Backend-only (Stripe calls it). The frontend never touches this endpoint.

### `GET /health`

`{ status: 'ok' }` — use for env smoke tests.

---

## What the Frontend Reads Directly from Supabase

The backend has no generic read endpoints — canvas state is loaded straight
from Supabase under RLS:

| Table | Frontend reads it for |
|---|---|
| `canvases` | dashboard list, north star header (`original_intent`) |
| `sessions` | active session lookup, `current_phase`, `node_sequence` |
| `nodes` | canvas hydration on mount (all sessions of the canvas) |
| `edges` | canvas hydration on mount |
| `session_learnings` | Session Complete screen 2 + next-session carry-forward |
| `observer_structures` / `observer_edges` | Observer structure UI |
| `subscriptions` | current tier for UI show/hide (enforcement stays server-side) |

Frontend also **writes** directly (RLS-scoped): `canvases` (insert only —
`original_intent` is INSERT-once, RLS blocks UPDATE), `nodes`, `edges`, and
`sessions.current_phase` (the phase toggle).

---

## Known Gaps (cross-repo — do not silently work around)

These are real holes in the contract, confirmed against backend code. Each
needs a backend change; frontend stories that hit one must flag it, not fudge it.

| # | Gap | Impact | Direction |
|---|---|---|---|
| 1 | `ghost-status` requires `thread_id` + `turn_index`, but no SSE message carries them — `done` is empty | Frontend cannot make the accept/reject call for a freshly streamed pair | Backend should enrich `done` (or `spawn`) with `{ thread_id, turn_index }` |
| 2 | `observerEdgeStatusSchema` exists in backend types but **no route implements it** | Per-edge Observer accept/reject UI has nothing to call | Backend must add `POST /api/observer-edge-status` |
| 3 | Canvas events are create-only — no update/delete/re-parent | Backend agents read stale canvas after edits or deletes | Backend intervention-spectrum task-06 extends the event surface |
| 4 | No endpoint to initiate Stripe checkout — only the webhook exists | Upgrade flow can't start a subscription | Use Stripe Payment Links short-term, or backend adds a checkout route |
| 5 | Accepted-ghost enrichment undecided — if the frontend persists an accepted ghost as an `owner:'ai'` node without firing `canvas-event` (correct: the pipeline must not react to its own output), that node never gets a summary/embedding | AI nodes are second-class in later semantic recall | Needs a backend decision (e.g. enrich on ghost-status accept) |
| 6 | **Ghost content is delivered as one raw stream on `context_node.ghost_id`, markers and all** — `[NODE_TYPE:]`/`[QUESTION]`/`[ARTICULATION n]` are not stripped and the question node is never streamed to. The backend's intended server-side split (`src/streaming/tokens.ts`) was never implemented | Frontend must parse markers and route the question text itself, or it renders raw markup + an empty question node | Backend should split server-side (emit a typed `node_type` message + route post-`[QUESTION]` chunks to the question ghost). Until then, frontend parses — see GHOST-STREAMING.md → Content Delivery |
| 6b | **The SSE connection closes after every `done`** (`src/routes/stream.ts` resolves on first `done`) → reconnect after every ghost; pub/sub has no replay, so a `spawn` in the reconnect window is lost and overlapping generations truncate each other | Not every triggered agent yields a visible ghost; concurrent Expander+Articulator can collide | Backend should hold the connection open until client abort (`done` becomes informational) |
| 7 | **Tier enforcement is inconsistent backend-side:** question edges fire the Outer Subconscious with **no tier check** (`outer-sub-pipeline.ts`), while the debounced Expander/Stress-Tester path *is* tier-gated. So a **free** user drawing a question edge gets an Outer-Sub ghost | A tier-driven `UpgradePrompt` on question edges would be wrong; the FE can't derive "which agents can fire" from tier alone | Backend should gate the immediate pipelines by tier too (or intentionally make Outer-Sub free — then document it) |

---

## Streaming Protocol Forward-Compatibility

The intervention-spectrum design (backend, drafted, not yet ratified) will add
message types `waiting`, `offer`, and `withdraw` to the stream. The frontend
dispatcher must therefore route on `type` with an explicit ignore-and-log
default branch — never an exhaustive switch that throws on unknown types.
