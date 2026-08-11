---
last-verified: 2026-07-19
verified-against: src/routes/* · src/pipeline/* · src/streaming/* · src/agents/* prompts · types/index.ts · supabase/migrations/* — §6/§6.1/§7.1/§7.2/§7.3/§11 updated for the frontend-contract-holes fix (server-side marker split, enriched done, hold-open SSE, ghost.accepted)
stale-after-days: 30
---

# FRONTEND-CONTRACT.md — The Integration Contract for thinking-canvas-web

> **Load this when:** Implementing or reviewing ANYTHING in the frontend repo
> (thinking-canvas-web), or changing any backend surface the frontend touches
> (routes, Redis messages, agent output format, RLS, Zod schemas).
>
> **Authority rule:** this file documents what the backend ACTUALLY does today,
> verified against code. Where the product design says something the code does
> not do yet, that lives in [§10 Designed but NOT built](#10-designed-but-not-built-yet)
> and [§11 Known gaps](#11-known-gaps--recommended-backend-fixes) — never build
> the frontend against an unimplemented design without checking those sections.

---

## 1. The Three Data Planes

Every piece of data moves over exactly one of three planes. Confusing them is
the #1 integration mistake to avoid.

```
PLANE 1 — Supabase direct (supabase-js + anon key + user JWT, RLS-scoped)
  FE READS:  canvases, sessions, nodes, edges, agent_threads,
             session_learnings, subscriptions
  FE WRITES: canvases (create), nodes, edges
             (ghost accept: FE writes the accepted nodes/edges itself — §7)

PLANE 2 — Backend REST API (fetch → Railway/localhost:3001, JSON, no auth today)
  POST /api/canvas-event      notify backend AFTER a Supabase write (§5.1)
  POST /api/ghost-status      accept/reject a ghost pair (§5.2)
  POST /api/session/start     open a session — NEVER insert sessions directly (§5.3)
  POST /api/session/complete  close a session / fire Observer (§5.4)
  GET  /health                liveness probe

PLANE 3 — SSE (EventSource → GET /api/stream/:sessionId)
  The ONLY server→client push. Ghost spawn descriptors + token chunks + done.
  Backend never pushes user-node/edge state. No Supabase Realtime anywhere.
```

**The ordering contract:** the frontend always writes to Supabase FIRST, then
notifies the backend with only the row's id (Plane 2). The backend re-reads the
authoritative row — it never trusts flags in the request body. Skipping the
notify means the node never gets a summary/embedding, never enters
`sessions.node_sequence`, and never triggers agents.

---

## 2. Connection Facts

| Fact | Value |
|---|---|
| Backend base URL | `http://localhost:3001` local · Railway URL in prod (`src/index.ts` hardcodes port 3001) |
| CORS | Allowed origin = `FRONTEND_URL` env (default `http://localhost:3000`). No credentials mode needed. |
| Auth on Plane 2/3 | **NONE today.** No Authorization header, no cookie. CORS is the only guard. Flagged in §11 — when backend auth lands, every fetch + the EventSource URL will need the Supabase JWT. Do not bake "no auth" deep into the FE API layer; isolate it in one client module. |
| Auth on Plane 1 | Standard Supabase Auth (anonymous session first, Google OAuth / email+password after). RLS = canvas ownership via `auth.uid()`, `FOR ALL` (read+write) on every canvas-scoped table. |
| Content type | `application/json` on every Plane 2 endpoint (except Stripe webhook, which the FE never calls). |
| Error shape | `400 {error:'invalid payload', issues:[...zod issues]}` · `404 {error:'...'}` · `500 {error:'internal error'}`. Success is `{ok:true}` unless stated otherwise. |

---

## 3. Plane 1 — Direct Supabase Surface

### 3.1 Column ownership on `nodes`

| Column | Written by | Notes |
|---|---|---|
| `id, canvas_id, session_id, owner, content, created_at` | **Frontend** | `owner`: `'human'` for user nodes, `'ai'` for accepted ghosts. `content` NULL is legal and meaningful ("empty node" = unarticulated thought). |
| `x, y, width, height` | **Frontend** | Canvas layout — written on create AND on every move/resize commit, so a refetch restores the exact previous position and size. Backend never reads or writes these; agent serialization is content-oriented, not spatial. All four are nullable in the schema for backward-compatibility with pre-migration rows, but new rows should always carry them. No Plane 2 notify needed on move/resize — the backend is intentionally blind to spatial changes (they don't invalidate a fingerprint or wake an agent). |
| `summary, direction_marker, embedding` | **Backend** | Filled asynchronously after `POST /api/canvas-event` (node.created). FE must render nodes with these NULL and never write them. |

### 3.2 `edges` — the frontend computes the routing flags

The backend routes agent pipelines off two columns the FRONTEND must set
correctly at insert time (the backend reads them verbatim, never recomputes):

- `edge_type`: `'logical' | 'doubt' | 'question' | 'associative'` — a
  `question` edge is the "I wonder about this" gesture → Outer Subconscious.
- `both_existing`: `true` only when BOTH endpoints already existed on the
  canvas before the edge was drawn → Articulator. A drag-out-to-new-node edge
  is `both_existing: false`.

Two additional columns are also frontend-owned, purely for restoring the
exact visual reconnection on refetch (backend never reads them):

- `from_handle`, `to_handle`: `'TOP' | 'RIGHT' | 'LEFT' | 'BOTTOM'` — which
  side of the source / target node the edge attaches to (React Flow handle
  id). Written on edge create; a CHECK constraint on the table rejects any
  other value (NULL passes for backward-compatibility with pre-migration
  rows). No Plane 2 notify on a handle-only change — the backend is
  intentionally blind to visual reconnection.

### 3.3 Other tables the FE touches

| Table | FE access | Purpose |
|---|---|---|
| `canvases` | INSERT + SELECT | FE creates the canvas row directly (`title`, `original_intent`, `user_id`). `original_intent` is IMMUTABLE — an UPDATE changing it is rejected by RLS `WITH CHECK`. Never offer an "edit intent" UI. |
| `sessions` | SELECT only | Read `current_phase`, `status`, `node_sequence`. **Never INSERT** — session creation must go through `POST /api/session/start` (§5.3) or agent threads miss their session-boundary markers. |
| `agent_threads` | SELECT (optional) | No longer needed for ghost-status — `thread_id`/`turn_index` come off the `done` message now (§7.2). Still readable for ground-truth reconciliation. One row per `(canvas_id, agent_role)`; `messages` is the JSONB turn array. Treat as read-only — writing it corrupts agent memory. |
| `session_learnings` | SELECT | Observer output surfaced at next canvas open (`content`, `type: question|contradiction|empty_node`). Written by the session-complete pipeline, asynchronously after `POST /api/session/complete`. |
| `subscriptions` | SELECT | Read `tier` + `status` for UI gating (upsell surfaces). Missing row or `status != 'active'` ⇒ treat as `free` (matches backend `getTierByUser`). Enforcement itself is server-side — the FE only mirrors it cosmetically. |

---

## 4. What Triggers What — the Gesture Matrix

| User gesture | FE Supabase write | FE notify (Plane 2) | Backend result |
|---|---|---|---|
| Create a node | `nodes` insert | `canvas-event` `node.created` | Enrich (summary+embedding) → append to `node_sequence` → **debounced 10s** agent pipeline → maybe a ghost pair (Expander/Stress-Tester) |
| Drag edge out of a node into a NEW node | `nodes` insert + `edges` insert (`both_existing:false`) | **ONE event only:** `canvas-event` `edge.created` | Backend converts it to `node.created` for the edge's `to` node. Sending node.created AND edge.created for the same gesture double-fires the pipeline. |
| Connect two EXISTING nodes (non-question) | `edges` insert (`both_existing:true`) | `canvas-event` `edge.created` | **Immediate** Articulator ghost (no debounce, no Orchestrator) |
| Draw a `question` edge | `edges` insert (`edge_type:'question'`) | `canvas-event` `edge.created` | **Immediate** Outer Subconscious ghost pair |
| Accept/reject a ghost | on accept: `nodes`/`edges` inserts (§7.3) | `ghost-status` + (on accept) `canvas-event` `ghost.accepted` | Thread turn status updated; accept → enrich AI nodes (summary/embedding/sequence) + audit; rejection → Rejection Insights engine |
| Start a session | — | `session/start` | Session row created; boundary turn appended to threads |
| End a session ("Session Complete") | — | `session/complete` | Observer pass → `session_learnings` rows; session closed — both async |
| Move/delete/edit a node or edge | Supabase write | **No event type exists yet** (§10, §11) | Backend is blind to these today |

**Silence is normal — design for it.** A notify frequently produces NO ghost:
the 10s debounce collapses bursts to one run; `canAgentFire` silently drops the
run if a ghost triggered by that node is still `pending`; the Orchestrator can
route to a non-streamable role (dropped); free tier never routes beyond
Expander/Articulator. The FE must never spinner-block awaiting a ghost — ghosts
arrive opportunistically on Plane 3 or not at all.

---

## 5. Plane 2 — Endpoint Reference (as implemented)

### 5.1 `POST /api/canvas-event`

```jsonc
// node created:   { "canvas_id": uuid, "session_id": uuid, "event_type": "node.created", "node_id": uuid }
// edge created:   { "canvas_id": uuid, "session_id": uuid, "event_type": "edge.created", "edge_id": uuid }
// ghost accepted: { "canvas_id": uuid, "session_id": uuid, "event_type": "ghost.accepted", "node_ids": [uuid], "agent_role": "expander" }  // §7.3
```
- Zod: `canvasEventSchema` (`types/index.ts`) — the refinement rejects a
  node.created without node_id (and vice versa), and a `ghost.accepted` without
  `node_ids` + `agent_role`, with a 400.
- `node.created` is **synchronous and slow** (~1-3s: Gemini summary + embedding
  happen before the response). Fire-and-forget from the FE; never block the
  canvas on it.
- Returns `{ok:true}` | 400 | 500.

### 5.2 `POST /api/ghost-status`

```jsonc
{
  "thread_id": uuid,            // take straight off the `done` message (§7.2)
  "turn_index": 0,              // also on `done`; index into agent_threads.messages (the WHOLE array)
  "canvas_id": uuid,
  "session_id": uuid,
  "context_node_status": "accepted" | "rejected",
  "question_node_status": "accepted" | "rejected" | null,   // null when the pair has no question node
  "rejection_reason": "too_abstract" | "too_technical" | "skip_for_now",  // optional; omitted on a rejection ⇒ backend defaults to skip_for_now
  "interacted_at": 1751700000000   // unix ms; validated but not currently used
}
```
- Errors: 404 thread not found · 400 no ghost_pair at that turn_index.
- Pair status the backend records (`resolvePairStatus`):
  context ✓ + question (✓ or null) → `accepted` · context ✓ + question ✗ →
  `context_accepted` · context ✗ + question ✓ → `question_accepted` · both ✗ →
  `rejected`.
- A rejected CONTEXT node (regardless of question) fires the Rejection
  Insights engine. Rejecting only the question node does not.
- Reason → behavior mapping (drives your RejectionReasonSelector copy):
  `too_abstract`→hard block · `too_technical`→approach pivot ·
  `skip_for_now`→pause the theme ~3 agent turns.

### 5.3 `POST /api/session/start`

`{ "canvas_id": uuid }` → **`200 { "session_id": uuid }`**. New sessions start
`status:'active'`, `current_phase:'diverging'`. If prior sessions exist, a
session-boundary marker turn is appended to every agent thread — this is why
the FE must never insert `sessions` rows directly. Only one active session per
canvas is a **convention the FE must enforce** (complete the old one first);
the backend does not reject a second active session.

### 5.4 `POST /api/session/complete`

`{ "session_id": uuid, "canvas_id": uuid, "carry_forward_ids": uuid[] }` →
`{ok:true}` immediately (enqueue only). The Observer pass, `session_learnings`
writes, and the session-row close all happen **asynchronously afterwards** —
the Session Complete UI must poll `session_learnings`/`sessions.status` or
tolerate eventual consistency.

> ⚠️ `carry_forward_ids` is validated but **currently ignored** by the route
> and pipeline (§11). Don't build the "Carry Forward / Discard" screen
> expecting it to persist anything yet.

---

## 6. Plane 3 — SSE Stream Protocol

**Connect:** `new EventSource(`${API}/api/stream/${sessionId}`)` — open it at
session start, one connection per session (single-user canvas; the backend
assumes exactly one listener).

**Framing:** every message is a default `message` event (`onmessage`); there is
no `event:`/`id:`/`retry:` field. `event.data` is a JSON string:

```typescript
type StreamMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }   // render placeholder ghost frames + edges NOW
  | { type: 'chunk'; target: string; data: string }  // append data to the ghost node with ghost_id === target
  | { type: 'node_type'; target: string; node_type: ContextNodeType } // restyle the context ghost (server split [NODE_TYPE:])
  | { type: 'done'                                    // generation finished — now carries attribution:
      thread_id: string; turn_index: number           //   → POST /api/ghost-status, no agent_threads read (§7.2)
      trigger_node_id: string
      context_ghost_id: string; question_ghost_id: string | null }  // which pair finished
  | { type: 'ping' }                                  // keepalive every 25s — ignore
```

> Both `node_type` and the enriched `done` were added by the
> frontend-contract-holes fix. Chunks now arrive **pre-routed** (context vs
> question) — the FE no longer parses `[NODE_TYPE:]`/`[QUESTION]` (§7.1).

`SpawnDescriptor` (verbatim from `types/index.ts` — structure only, never
content): `trigger_node_id`, `session_id`, `context_node {ghost_id, node_type,
agent_role}`, `context_edge {edge_type:'logical', from: trigger_node_id, to:
context ghost_id}`, optional `question_node {ghost_id, node_type:'question'}` +
`question_edge {edge_type:'logical', from: context ghost_id, to: question
ghost_id}`. Ghost ids are backend-minted UUIDs — key all chunk routing on them.

**Timing:** spawn → ~1.5s pause (your placeholder animation window) → chunks →
done. The FE defines all ghost visuals (opacity, dashed border, layout);
the backend defines only structure + text.

### 6.1 Connection lifecycle (verified in `src/routes/stream.ts`)

1. **The connection is hold-open for the whole session.** The route's promise
   settles only on client abort (you closing the EventSource) or a server write
   error — **not** on `done`. Open ONE EventSource at session start and keep it;
   there is no reconnect-per-generation loop to design around.
2. **Nothing is lost to a reconnect window**, because there is no routine
   reconnect. Every `spawn`/`chunk`/`node_type`/`done` for the session arrives
   on the one connection. (A genuine network drop still needs a reconnect — treat
   that as an error path, and reconcile ground truth from Supabase on reload.)
3. **Concurrent generations share one channel and `done` is now attributed.** A
   debounced Expander run and an immediate Articulator run can interleave;
   `chunk.target` disambiguates chunks, and `done` now carries
   `context_ghost_id`/`question_ghost_id` so you know WHICH pair finished. A
   `done` from one generation no longer tears down the other — finalize the pair
   named in the `done` payload.

---

## 7. The Ghost Lifecycle — Frontend Playbook

### 7.1 Rendering the stream — the backend splits markers for you

Control markers are stripped **server-side** (`src/streaming/tokens.ts`). You do
NOT buffer/parse/re-route the raw stream. Two things arrive instead:

- **`chunk` messages are already routed.** Text before `[QUESTION]` targets the
  context ghost id; text after it targets the question ghost id. Just append
  `chunk.data` to the ghost whose id === `chunk.target`.
- **`node_type` message restyles the context ghost.** The backend parses
  `[NODE_TYPE: x]` and sends `{ type:'node_type', target: <context ghost id>,
  node_type: x }`. This overrides the spawn descriptor's pre-assigned default
  (expander→`reframe`, stress_tester→`contradiction`,
  outer_subconscious→`pattern`, articulator→`reframe`) — restyle when it arrives.

Still on the FE:
- **Articulator sub-structure stays in-band.** The Articulator never has a
  question node; its body streams `[ARTICULATION 1] … [ARTICULATION 2] …
  [ARTICULATION 3 (optional)]` as ordinary context-ghost chunks (these are
  sub-structure of one node, not a ghost split). Sub-render as 2–3 selectable
  readings — this is the one marker the FE still reads.
- **Empty question ghost:** expander/stress-tester spawns always pre-create a
  question ghost, but an `appreciation` response omits `[QUESTION]`, so the
  question ghost simply receives no chunks. If it has received none by `done`,
  remove it and its edge silently.

Per-agent cheat sheet:

| agent_role (spawn) | Question node | Body format |
|---|---|---|
| `expander` | usually (omit allowed only for appreciation) | NODE_TYPE + paragraph + QUESTION |
| `stress_tester` | usually (same rule) | NODE_TYPE + paragraph + QUESTION |
| `outer_subconscious` | always | NODE_TYPE (pattern/reference/reframe only) + paragraph + QUESTION |
| `articulator` | never | NODE_TYPE + ARTICULATION 1..3 |
| `observer` | — never streams a ghost pair (session-complete only, §10.1) | — |

### 7.2 Resolving `thread_id` + `turn_index` — take them off `done`

`POST /api/ghost-status` needs `thread_id` + `turn_index`, and the `done`
message now carries both (plus `context_ghost_id`/`question_ghost_id` to match
`done` to the right pair). The backend persists the ghost_pair turn **before**
publishing `done`, so there is no race and no retry: read the ids straight off
`done` and enable Accept/Reject.

No `agent_threads` read is needed for ghost-status anymore. (You may still read
`agent_threads` for other ground-truth reconciliation, but not for this.)

### 7.3 On ACCEPT — the frontend persists the ghost itself

The backend does NOT write accepted ghosts to the canvas. The FE must:
1. Insert `nodes` rows (`owner:'ai'`, `content` = ghost text) for the context
   node and, if accepted, the question node. Reuse the ghost UUIDs as node ids
   so thread records and canvas rows correlate.
2. Insert the `edges` rows mirroring `context_edge` / `question_edge`
   (`both_existing:false`).
3. `POST /api/ghost-status` with the statuses.
4. **`POST /api/canvas-event` with `event_type:'ghost.accepted'`** to enrich the
   AI nodes:
   ```jsonc
   { "canvas_id": uuid, "session_id": uuid, "event_type": "ghost.accepted",
     "node_ids": [uuid, ...],        // the accepted node id(s) — 1 (context) or 2 (context+question)
     "agent_role": "expander" | "stress_tester" | "outer_subconscious" | "articulator" | "observer" }
   ```
   The backend runs summary + embedding + `node_sequence` append for each id and
   writes an `ai_contributions` audit row — the same enrichment a user node gets.
   It does **NOT** re-trigger any agent (an AI acceptance is not a new-node
   event). Idempotent — safe to retry. Send `agent_role` from the spawn
   descriptor. This replaces the old "do NOT notify" workaround: accepted AI
   nodes are now first-class in agent context and semantic search.

On REJECT: discard the ghost visuals, then `POST /api/ghost-status` with the
reason from the RejectionReasonSelector. Nothing is written to `nodes`/`edges`.

---

## 8. Tier Behavior the FE Should Mirror

| Tier | Ghost sources actually reachable today |
|---|---|
| `free` | Expander (debounced) + Articulator (existing-nodes edge) — Orchestrator never routes further. **Caveat:** question edges still fire Outer Subconscious for free users (tier is not checked on that pipeline — backend inconsistency, §11). Don't advertise it; don't rely on it. |
| `pro` / `power` | All of the above + Stress-Tester (blocked until phase transitions land — §10.3) + Observer at session complete. |

Enforcement is server-side only. FE gating is cosmetic (upsell UI), driven by
the `subscriptions` read (§3.3). There is **no checkout endpoint yet** — only
the Stripe webhook exists; starting a subscription is unbuilt (§11).

---

## 9. Session Lifecycle Summary

```
open canvas → read session_learnings (unreviewed) → POST /api/session/start
  → open EventSource(/api/stream/:sessionId)
  → work loop: Supabase write → canvas-event → (maybe) spawn/chunk/done → ghost-status
  → POST /api/session/complete → close EventSource
  → (async) Observer writes session_learnings; session row closes
```

Sessions are episodic; the canvas and agent threads persist across them.
`sessions.node_sequence` (backend-written) is the ordered trail of THIS
session only — read it for trail visualizations, never write it.

---

## 10. Designed but NOT Built Yet

Product docs describe these; **no backend surface exists**. Building FE
against them today = building against nothing.

1. **Observer structures UX** (anchor highlighting, hover-to-reveal DAG,
   per-edge accept/reject — CORE-CONCEPTS.md → The Observer Structure).
   `observer_structures`/`observer_edges` tables exist but are never written;
   `observerEdgeStatusSchema` exists in `types/index.ts` but **`POST
   /api/observer-edge-status` is not a route**. Today the Observer's output
   surfaces only as flat `session_learnings` rows. Build the learnings review
   list for v1; the structure UX comes with its feature.
2. **Intervention Spectrum** (`.ai/features/intervention-spectrum/DESIGN.md`,
   status: draft). Will change this contract materially: new stream message
   types (`waiting`/`offer`/`withdraw`), a FE-side trigger ruleset + processing
   timer + glow/sidebar surfaces, ghosts keyed by `(anchor_node_id, seq)`, and
   the FE persisting ALL mutations (delete/edit/move) with new canvas-event
   types. Design the FE event bus + stream-message handling to be
   extensible for unknown `type` values (ignore-unknown, don't throw).
3. **Phase transitions / Stress-Tester.** `sessions.current_phase` is frozen at
   `'diverging'` (`updatePhase()` has zero callers) ⇒ Stress-Tester ghosts are
   currently unreachable. Don't chase "missing" contradiction ghosts.
4. **`ignored` pair status.** Typed (`GhostStatus`) and documented ("2 new
   nodes without interaction → ignored") but no code sets it, and
   `ghost-status` only accepts accepted/rejected.
5. **Velocity-adaptive debounce.** Docs say 8–25s adaptive; code is a fixed
   `10s` per `session_id`.
6. **Mutation events** (`node.updated`/`node.deleted`/`edge.deleted`) — schema
   accepts only `node.created`/`edge.created`; edits never re-enrich
   summary/embedding.

---

## 11. Known Gaps — Recommended Backend Fixes

Durable record of the 2026-07-05 frontend-contract audit. Fixing these
deletes the FE workarounds noted above.

> **Resolved by the frontend-contract-holes story (2026-07-19):** the three
> original P0 rows — (1) `done` carried nothing, (2) SSE closed on every `done`,
> (3) accepted ghosts had no enrich path — are now fixed in code. `done` carries
> attribution (§6/§7.2), the SSE connection is hold-open (§6.1), and
> `ghost.accepted` enriches accepted AI nodes (§7.3). They are removed from the
> table below; the remaining gaps keep their original audit numbering intent but
> are re-listed fresh.

| # | Severity | Gap | Recommended fix |
|---|---|---|---|
| 1 | P1 | No auth on Plane 2/3 — any origin-bypassing client can post events / read a session's stream by uuid | Verify Supabase JWT (Authorization: Bearer) on all /api routes; token query-param for EventSource |
| 2 | P1 | Free tier reaches Outer Subconscious via question edges (tier checked only in the debounced pipeline) | `getTierByUser` + `getAvailableAgents` gate inside `outer-sub-pipeline` (and articulator for symmetry) |
| 3 | P1 | `carry_forward_ids` accepted, ignored | Wire into session-complete (persist chosen unresolved threads as `session_learnings`) or drop from the schema until built |
| 4 | P2 | No Stripe checkout endpoint; webhook expects `metadata.user_id` set by whoever creates the subscription | Add `POST /api/stripe/checkout` creating the session with `metadata.user_id` |
| 5 | P2 | `interacted_at` validated but unused | Use for `ignored`-status heuristics or drop |
| 6 | P2 | Second active session per canvas isn't rejected by `session/start` | Return 409 when an active session exists for the canvas |
