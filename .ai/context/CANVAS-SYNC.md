---
last-verified: 2026-07-19
verified-against: frontend-contract-holes (server-side marker split, enriched done, hold-open SSE, ghost.accepted)
stale-after-days: 30
---

# CANVAS-SYNC.md

> **Load this when:** Working on ghost node streaming, SSE endpoint, Upstash Redis pub/sub, spawn descriptor, ghost status updates, or Rejection Insights UI flow.
>
> **See also:** `.ai/context/intervention-layer/07-streaming-protocol.md` — the
> intervention layer generalised this channel; the `waiting`/`offer`/`withdraw`
> messages and the decide→wait→generate handshake live there.

---

## Single-User Canvas — No Supabase Realtime

ThinkingCanvas is a single-user workspace. The backend **never** pushes unsolicited updates to user nodes or edges. The only server-to-client push is the ghost node pair, streamed via Upstash Redis pub/sub → SSE.

```
BACKEND PUSHES:   ghost node pairs only (via Redis → SSE)
FRONTEND PUSHES:  canvas events to backend (POST /api/canvas-event)
USER NODES/EDGES: written by frontend directly to Supabase. Backend reads them — never writes unsolicited changes.
```

No Supabase Realtime. No WebSocket canvas sync. No collaborative features.

---

## Ghost Node Streaming Architecture

```
Inngest Worker
  │
  ├── 1. Build SpawnDescriptor (before calling agent)
  │         Defines the graph structure the frontend will render:
  │         - trigger_node_id (current node)
  │         - context_node: { ghost_id, node_type: 'reframe'|'mirror'|... }
  │         - context_edge: { type: 'logical', from: trigger, to: context_ghost }
  │         - question_node?: { ghost_id, node_type: 'question' }
  │         - question_edge?: { type: 'logical', from: context, to: question_ghost }
  │
  ├── 2. Publish SPAWN to Redis
  │         redis.publish(`canvas:stream:${sessionId}`,
  │           JSON.stringify({ type: 'spawn', descriptor: SpawnDescriptor }))
  │
  ├── 3. Sleep 1500ms (Inngest sleep)
  │         Frontend animates empty ghost frames + edges onto canvas
  │
  ├── 4. Stream agent output — marker split SERVER-SIDE (src/streaming/tokens.ts)
  │         streamAgentOutput(textStream, { contextGhostId, questionGhostId }, sessionId)
  │         - [NODE_TYPE: x] → { type:'node_type', target: contextGhostId, node_type: x }
  │           (stripped from the text; the FE restyles the context ghost)
  │         - text before [QUESTION] → chunks targeting contextGhostId
  │         - text after  [QUESTION] → chunks targeting questionGhostId (marker dropped)
  │         - [ARTICULATION n] stays in-band (sub-structure of one context node)
  │
  ├── 5. Persist the ghost_pair turn (appendMessage) — BEFORE done, so
  │         thread_id/turn_index in the done payload resolve a persisted turn
  │
  └── 6. Publish DONE — LAST, carrying attribution
            redis.publish(`canvas:stream:${sessionId}`, JSON.stringify({
              type: 'done', thread_id, turn_index,
              trigger_node_id, context_ghost_id, question_ghost_id,
            }))
```

---

## SpawnDescriptor Type

```typescript
// types/index.ts
type SpawnDescriptor = {
  trigger_node_id: string           // the real node that triggered the agent
  session_id: string

  context_node: {
    ghost_id: string                // temporary client-side UUID
    node_type: ContextNodeType      // reframe | mirror | pattern | reference | contradiction | appreciation
    agent_role: AgentRole           // which agent generated this
  }
  context_edge: {
    edge_type: EdgeType             // logical | associative etc.
    from: string                    // trigger_node_id
    to: string                      // context ghost_id
  }

  question_node?: {
    ghost_id: string
    node_type: 'question'
  }
  question_edge?: {
    edge_type: EdgeType
    from: string                    // context ghost_id
    to: string                      // question ghost_id
  }
}
```

---

## Redis Message Types

```typescript
type RedisMessage =
  | { type: 'waiting';  offer: InterventionOffer; timer_ms: number }  // mature + parked — starts the FE timer
  | { type: 'offer';    offer: InterventionOffer }                    // low-intensity show (glow / sidebar card)
  | { type: 'withdraw'; offer_id: string }                           // supersede / no-longer-mature
  | { type: 'spawn';     descriptor: SpawnDescriptor }
  | { type: 'chunk';     target: string; data: string }              // target = ghost_id
  | { type: 'node_type'; target: string; node_type: ContextNodeType } // server-split [NODE_TYPE:] — target = context ghost id
  | { type: 'done'
      thread_id: string; turn_index: number                          // address the persisted turn for POST /api/ghost-status
      trigger_node_id: string
      context_ghost_id: string; question_ghost_id: string | null }   // disambiguate WHICH pair finished
```

`spawn`/`chunk`/`node_type`/`done` are the **maximal** rung (a full ghost pair
streaming in); `waiting`/`offer`/`withdraw` are the quieter rungs added by the
intervention layer. `stream.ts` forwards every type verbatim and only
special-cases `ping` (keepalive) — it no longer special-cases `done` (the
connection is hold-open now; see below). Full detail:
`.ai/context/intervention-layer/07-streaming-protocol.md`.

`node_type` and the enriched `done` were added by the **frontend-contract-holes**
story (server-side marker split + `done` attribution). The FE no longer parses
`[NODE_TYPE:]`/`[QUESTION]` out of the raw stream, and no longer polls
`agent_threads` to attribute a `done`.

---

## Hono SSE Endpoint

`GET /api/stream/:sessionId` (`src/routes/stream.ts`) subscribes to
`canvas:stream:${sessionId}` via `@upstash/redis` (`redis.subscribe<RedisMessage>`
— messages arrive already deserialized and are re-stringified into
`stream.writeSSE({ data })`). Keepalive `{type:'ping'}` every 25s. Messages are
plain `data:` events — no `event:`/`id:` fields.

**Actual lifecycle (as implemented):** the handler holds the response open on a
promise that settles **only** on client abort (`stream.onAbort`) or a
`writeSSE` rejection (real disconnect/backpressure). `done` is forwarded like
any other message and does **not** close the connection. One session = one
long-lived subscription for every generation (and every parked offer) the
session produces. Consequences:

- No reconnect between generations — nothing is lost to a reconnect window.
- Two concurrent generations on one session both complete on the same
  connection; the enriched `done` (`context_ghost_id`/`question_ghost_id`)
  disambiguates which pair finished.
- A parked intervention offer (up to a 10-minute wait) survives an unrelated
  pipeline's `done` on the same channel.

The `cleanup()` guard (`clearInterval(ping)` + `sub.unsubscribe()`) still runs
exactly once via the `settled` flag. This hold-open behaviour was landed by the
**frontend-contract-holes** story (task-03). If you change it, update both docs.

---

## Ghost Status Update Endpoint

```typescript
// POST /api/ghost-status
// Payload (zod: ghostStatusSchema in types/index.ts):
{
  thread_id: string
  turn_index: number              // index into agent_threads.messages — the RAW array, not just assistant turns
  canvas_id: string
  session_id: string
  context_node_status: 'accepted' | 'rejected'
  question_node_status: 'accepted' | 'rejected' | null   // null = pair has no question node
  rejection_reason?: RejectionReason  // omitted on rejection ⇒ defaults to 'skip_for_now'
  interacted_at: number               // unix ms — validated, currently unused
}

// Backend (src/routes/ghost-status.ts):
// 1. resolvePairStatus() maps the two per-node choices → one GhostStatus
//    (accepted | context_accepted | question_accepted | rejected) and writes it
//    onto the ghost_pair turn (setGhostPairStatus)
// 2. If context_node_status === 'rejected' → fire canvas/ghost.rejected
// 3. NO Realtime broadcast — single-user, no other clients to notify
//
// NOTE: the `done` message now carries thread_id + turn_index (plus the ghost
// ids) directly — the turn is persisted BEFORE done publishes — so the frontend
// takes them straight off `done`, no agent_threads read or retry. See
// FRONTEND-CONTRACT.md §7.2.
```

---

## Frontend Responsibilities (for reference — not implemented here)

> Full consumer-side spec with payloads and workarounds: **`FRONTEND-CONTRACT.md`**.

The frontend (separate repo: thinking-canvas-web) is responsible for:
- Rendering ghost node HTML from the spawn descriptor (backend defines content only)
- Creating ghost node + edge React Flow elements on `spawn` message
- Filling ghost node text content on `chunk` messages (by ghost_id target) —
  chunks arrive **already routed**: context chunks target the context ghost,
  post-`[QUESTION]` chunks target the question ghost. Just append `chunk.data`
  to `chunk.target`; no marker parsing.
- Restyling the context ghost on a `node_type` message (backend split the
  `[NODE_TYPE: x]` marker server-side; `target` is the context ghost id)
- The Articulator's `[ARTICULATION n]` sections still arrive **in-band** in the
  context chunks (sub-structure of one node) — sub-render as 2–3 readings
- Removing an empty question ghost + edge at `done` (appreciation responses may
  omit `[QUESTION]`, so the question ghost simply receives no chunks)
- Accept/Reject UI and calling POST /api/ghost-status, taking `thread_id` +
  `turn_index` straight off the `done` message (no agent_threads read)
- **Persisting accepted ghosts itself** — inserting the `nodes` (owner:'ai') and
  `edges` rows — then POSTing `canvas-event` `ghost.accepted` so the backend
  enriches them (summary/embedding/sequence). See FRONTEND-CONTRACT.md §7.3.
- RejectionReasonSelector component
- Writing user-created nodes/edges directly to Supabase, then notifying via
  POST /api/canvas-event (write-first, notify-second)
- Holding ONE EventSource open per session — the server no longer closes on
  `done`, so there is no reconnect-per-generation loop

The backend does NOT define how ghost nodes look. It defines:
- What type of node (reframe, mirror, question etc.)
- What text to fill in (streamed tokens)
- What edge connects them

---

## Ghost Status Lifecycle (backend thread perspective)

```
pending → accepted | rejected | context_accepted | question_accepted
pending + (2 new nodes created without interaction) → ignored   ← DESIGNED, not implemented — nothing sets 'ignored' today
```

On rejection (actual event payload — src/routes/ghost-status.ts):
```typescript
await inngest.send({
  name: 'canvas/ghost.rejected',
  data: {
    canvas_id, session_id, thread_id,
    agent_role,                       // read from the thread row
    rejected_ghost_content,           // the whole ghost_pair turn's content
    rejection_reason,                 // payload value, or 'skip_for_now' default
  },
})
```

---

## Spawn in Agent Pipeline (Inngest step order)

```typescript
// src/pipeline/agent-pipeline.ts (same shape in articulator/outer-sub pipelines)

// Step 4: Build and publish spawn — ghost ids are minted INSIDE
// buildSpawnDescriptor (src/streaming/spawn.ts); the node_type passed here is
// only the pre-assigned default (the agent's [NODE_TYPE:…] marker in the
// token stream drives the final rendered type on the frontend).
const descriptor = await step.run('publish-spawn', async () => {
  const d = buildSpawnDescriptor({
    trigger_node_id: node_id,
    session_id,
    agent_role: agentRole,                          // 'expander' | 'stress_tester' here
    context_node_type: DEFAULT_CONTEXT_TYPE[agentRole],
    has_question_node: true,                        // articulator pipeline passes false
  })
  await publishSpawn(session_id, d)
  return d
})

// Step 5: Sleep for ghost animation (step.sleep — inngest.sleep does not exist)
await step.sleep('ghost-animation', '1500ms')

// Step 7: Stream — streamAgentOutput (src/streaming/tokens.ts) splits control
// markers server-side (node_type message + [QUESTION] routing) and returns the
// full RAW text (markers included) for the thread turn.
const responseText = await step.run('stream-context', async () => {
  const stream = await streamExpander({ … })
  return streamAgentOutput(
    stream.textStream,
    { contextGhostId: descriptor.context_node.ghost_id,
      questionGhostId: descriptor.question_node?.ghost_id ?? null },
    session_id,
  )
})

// Step 8 ('finalize'): appendMessage(ghost_pair, pair_status:'pending') FIRST,
// derive turn_index by matching context_ghost_id, THEN publishDone LAST with the
// attribution payload. The offer publish (agent-pipeline only) also lands before
// done. Persist-before-done means a FE reading the turn off `done` never races an
// unpersisted turn (FRONTEND-CONTRACT.md §7.2). A failed append aborts BEFORE done.
```

---

## What NOT to Do

```typescript
// ❌ Never use Supabase Realtime for anything
// supabase.channel(...).subscribe() — PROHIBITED in backend

// ❌ Never push node/edge writes to frontend via Redis
// Redis is ONLY for ghost node spawn + token streaming

// ❌ Never write user nodes or edges from backend
// User canvas changes are frontend → Supabase direct writes

// ❌ Never assume multiple simultaneous frontend connections
// Single-user canvas — one active SSE connection per session
```
