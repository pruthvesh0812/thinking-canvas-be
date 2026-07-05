---
last-verified: 2026-07-05
verified-against: src/routes/* · src/pipeline/* · src/streaming/* · src/agents/* prompts · types/index.ts · supabase/migrations/* (all read line-by-line on this date)
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
| `summary, direction_marker, embedding` | **Backend** | Filled asynchronously after `POST /api/canvas-event` (node.created). FE must render nodes with these NULL and never write them. |

### 3.2 `edges` — the frontend computes the routing flags

The backend routes agent pipelines off two columns the FRONTEND must set
correctly at insert time (the backend reads them verbatim, never recomputes):

- `edge_type`: `'logical' | 'doubt' | 'question' | 'associative'` — a
  `question` edge is the "I wonder about this" gesture → Outer Subconscious.
- `both_existing`: `true` only when BOTH endpoints already existed on the
  canvas before the edge was drawn → Articulator. A drag-out-to-new-node edge
  is `both_existing: false`.

### 3.3 Other tables the FE touches

| Table | FE access | Purpose |
|---|---|---|
| `canvases` | INSERT + SELECT | FE creates the canvas row directly (`title`, `original_intent`, `user_id`). `original_intent` is IMMUTABLE — an UPDATE changing it is rejected by RLS `WITH CHECK`. Never offer an "edit intent" UI. |
| `sessions` | SELECT only | Read `current_phase`, `status`, `node_sequence`. **Never INSERT** — session creation must go through `POST /api/session/start` (§5.3) or agent threads miss their session-boundary markers. |
| `agent_threads` | SELECT (workaround) | Needed today to resolve `thread_id`/`turn_index` for ghost-status (§7.2). One row per `(canvas_id, agent_role)`; `messages` is the JSONB turn array. Treat as read-only — writing it corrupts agent memory. |
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
| Accept/reject a ghost | on accept: `nodes`/`edges` inserts (§7.3) | `ghost-status` | Thread turn status updated; rejection → Rejection Insights engine |
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
// node created:  { "canvas_id": uuid, "session_id": uuid, "event_type": "node.created", "node_id": uuid }
// edge created:  { "canvas_id": uuid, "session_id": uuid, "event_type": "edge.created", "edge_id": uuid }
```
- Zod: `canvasEventSchema` (`types/index.ts`) — the refinement rejects a
  node.created without node_id (and vice versa) with a 400.
- `node.created` is **synchronous and slow** (~1-3s: Gemini summary + embedding
  happen before the response). Fire-and-forget from the FE; never block the
  canvas on it.
- Returns `{ok:true}` | 400 | 500.

### 5.2 `POST /api/ghost-status`

```jsonc
{
  "thread_id": uuid,            // see §7.2 for how the FE obtains this today
  "turn_index": 0,              // index into agent_threads.messages (the WHOLE array, not just assistant turns)
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
  | { type: 'done' }                                  // generation finished — carries NOTHING else (see below)
  | { type: 'ping' }                                  // keepalive every 25s — ignore
```

`SpawnDescriptor` (verbatim from `types/index.ts` — structure only, never
content): `trigger_node_id`, `session_id`, `context_node {ghost_id, node_type,
agent_role}`, `context_edge {edge_type:'logical', from: trigger_node_id, to:
context ghost_id}`, optional `question_node {ghost_id, node_type:'question'}` +
`question_edge {edge_type:'logical', from: context ghost_id, to: question
ghost_id}`. Ghost ids are backend-minted UUIDs — key all chunk routing on them.

**Timing:** spawn → ~1.5s pause (your placeholder animation window) → chunks →
done. The FE defines all ghost visuals (opacity, dashed border, layout);
the backend defines only structure + text.

### 6.1 Connection lifecycle — sharp edges (verified in `src/routes/stream.ts`)

1. **The server CLOSES the SSE connection after every `done`.** The route's
   promise resolves on `done`, ending the response. EventSource auto-reconnects
   (~3s default) — you must treat reconnects as routine, not errors.
2. **Messages published while you are reconnecting are LOST.** Upstash pub/sub
   has no replay. A spawn that fires in the reconnect window never reaches the
   FE. Mitigation until the backend fix (§11): reconnect immediately on
   `close`/`error`, and reconcile pending ghosts from `agent_threads` when the
   Session Complete screen or a canvas reload needs ground truth.
3. **Concurrent generations share one channel and `done` is anonymous.** A
   debounced Expander run and an immediate Articulator run can interleave;
   `chunk.target` disambiguates chunks, but `done` does not say WHICH pair
   finished — and the first `done` also closes the connection mid-stream for
   the other run (§11 P0). Until fixed: treat `done` as "a generation
   finished", finalize any ghost that has received chunks, and rely on
   reconnect for the remainder.

---

## 7. The Ghost Lifecycle — Frontend Playbook

### 7.1 Rendering the stream — you MUST parse inline markers

Agent output is streamed RAW. The markers are part of the token stream, may be
**split across chunk boundaries** (buffer before matching — never regex a lone
chunk), and are NOT to be rendered as ghost text:

```
[NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
<context node text>
[QUESTION]                     ← only for pair-producing agents
<question node text>
```

Frontend responsibilities:
- **`[NODE_TYPE: x]` overrides the descriptor.** The spawn descriptor's
  `node_type` is only a pre-assigned default (expander→`reframe`,
  stress_tester→`contradiction`, outer_subconscious→`pattern`,
  articulator→`reframe`); the agent's own marker is the real type — restyle the
  ghost when it arrives.
- **Everything streams to the CONTEXT ghost id.** There is no server-side
  splitting: on `[QUESTION]`, the FE must route subsequent text into the
  question ghost itself.
- **Articulator format differs:** no question node ever; its body is
  `[ARTICULATION 1] … [ARTICULATION 2] … [ARTICULATION 3 (optional)]` sections
  inside the single context node — render as 2–3 selectable readings.
- **Empty question ghost:** expander/stress-tester spawns always pre-create a
  question ghost, but an `appreciation` response may legitimately omit
  `[QUESTION]`. If the question ghost has received no text by `done`, remove it
  and its edge silently.

Per-agent cheat sheet:

| agent_role (spawn) | Question node | Body format |
|---|---|---|
| `expander` | usually (omit allowed only for appreciation) | NODE_TYPE + paragraph + QUESTION |
| `stress_tester` | usually (same rule) | NODE_TYPE + paragraph + QUESTION |
| `outer_subconscious` | always | NODE_TYPE (pattern/reference/reframe only) + paragraph + QUESTION |
| `articulator` | never | NODE_TYPE + ARTICULATION 1..3 |
| `observer` | — never streams a ghost pair (session-complete only, §10.1) | — |

### 7.2 Resolving `thread_id` + `turn_index` (the workaround — read this)

`POST /api/ghost-status` needs `thread_id` + `turn_index`, but **no stream
message carries them** (§11 P0). Until the backend enriches `done`, do this:

1. From the spawn descriptor keep `(agent_role, context_node.ghost_id)`.
2. After `done`, query
   `agent_threads` where `canvas_id = X AND agent_role = Y` (unique row).
3. `turn_index` = index in `messages[]` of the turn where
   `turn_type === 'ghost_pair' && ghost_pair.context_ghost_id === <ghost_id>`.
4. **Race:** the turn is appended AFTER `done` is published — retry the read
   (e.g. 3× with ~500ms backoff) before enabling the Accept/Reject buttons.

### 7.3 On ACCEPT — the frontend persists the ghost itself

The backend does NOT write accepted ghosts to the canvas. The FE must:
1. Insert `nodes` rows (`owner:'ai'`, `content` = parsed ghost text — markers
   stripped) for the context node and, if accepted, the question node. Reuse
   the ghost UUIDs as node ids so thread records and canvas rows correlate.
2. Insert the `edges` rows mirroring `context_edge` / `question_edge`
   (`both_existing:false`).
3. `POST /api/ghost-status` with the statuses.
4. **Do NOT send `canvas-event` for these AI writes.** Today that would fire
   the agent pipeline off an AI node (ghost-on-ghost feedback) — there is no
   "enrich-only" event type yet. Known cost: accepted AI nodes have NULL
   summary/embedding, so they are second-class citizens in agent context and
   semantic search until the backend adds an accepted-ghost enrich path (§11).

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

| # | Severity | Gap | Recommended fix |
|---|---|---|---|
| 1 | **P0** | `done` carries nothing → FE can't attribute it, can't get `thread_id`/`turn_index` for ghost-status (workaround §7.2 + race) | Publish `{type:'done', thread_id, turn_index, context_ghost_id, question_ghost_id}` — persist the turn BEFORE publishing done (swap `finalize` step order in all 3 pipelines) |
| 2 | **P0** | SSE closes on every `done`; kills concurrent streams; pub/sub loss window on reconnect | `stream.ts`: stop resolving on `done` — hold the connection until client abort. (`done` becomes purely informational.) |
| 3 | **P0** | Accepted ghosts can't be enriched without re-triggering the pipeline | Add `event_type:'ghost.accepted'` (or `node.accepted_ghost`) to canvas-event: run summary/embedding + node_sequence append, skip the Inngest agent event |
| 4 | P1 | No auth on Plane 2/3 — any origin-bypassing client can post events / read a session's stream by uuid | Verify Supabase JWT (Authorization: Bearer) on all /api routes; token query-param for EventSource |
| 5 | P1 | Free tier reaches Outer Subconscious via question edges (tier checked only in the debounced pipeline) | `getTierByUser` + `getAvailableAgents` gate inside `outer-sub-pipeline` (and articulator for symmetry) |
| 6 | P1 | `carry_forward_ids` accepted, ignored | Wire into session-complete (persist chosen unresolved threads as `session_learnings`) or drop from the schema until built |
| 7 | P2 | No Stripe checkout endpoint; webhook expects `metadata.user_id` set by whoever creates the subscription | Add `POST /api/stripe/checkout` creating the session with `metadata.user_id` |
| 8 | P2 | `interacted_at` validated but unused | Use for `ignored`-status heuristics or drop |
| 9 | P2 | Second active session per canvas isn't rejected by `session/start` | Return 409 when an active session exists for the canvas |
