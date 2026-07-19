---
last-verified: 2026-07-17
verified-against: intervention-spectrum (RedisMessage generalised: waiting/offer/withdraw)
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
  ├── 4. Stream context node content
  │         for await (const token of agent.stream(context)) {
  │           redis.publish(`canvas:stream:${sessionId}`,
  │             JSON.stringify({ type: 'chunk', target: descriptor.context_node.ghost_id, data: token }))
  │         }
  │
  ├── 5. Stream question node content (if present)
  │         for await (const token of questionStream) {
  │           redis.publish(`canvas:stream:${sessionId}`,
  │             JSON.stringify({ type: 'chunk', target: descriptor.question_node.ghost_id, data: token }))
  │         }
  │
  └── 6. Publish DONE
            redis.publish(`canvas:stream:${sessionId}`, JSON.stringify({ type: 'done' }))
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
  | { type: 'spawn';  descriptor: SpawnDescriptor }
  | { type: 'chunk';  target: string; data: string }  // target = ghost_id
  | { type: 'done' }                                   // carries no ids — known P0 gap (FRONTEND-CONTRACT.md §11)
```

`spawn`/`chunk`/`done` are the **maximal** rung (a full ghost pair streaming in);
`waiting`/`offer`/`withdraw` are the quieter rungs added by the intervention layer.
`stream.ts` is unchanged — it forwards every type verbatim and only special-cases
`done`/`ping`. Full detail: `.ai/context/intervention-layer/07-streaming-protocol.md`.

---

## Hono SSE Endpoint

`GET /api/stream/:sessionId` (`src/routes/stream.ts`) subscribes to
`canvas:stream:${sessionId}` via `@upstash/redis` (`redis.subscribe<RedisMessage>`
— messages arrive already deserialized and are re-stringified into
`stream.writeSSE({ data })`). Keepalive `{type:'ping'}` every 25s. Messages are
plain `data:` events — no `event:`/`id:` fields.

**Actual lifecycle (as implemented):** the handler holds the response open on a
promise and resolves it — closing the SSE connection — on the first `done`
message, a write failure, or client abort. Consequences:

- The browser's EventSource must auto-reconnect after every generation
  (default behaviour, ~3s).
- Upstash pub/sub has **no replay** — anything published during the reconnect
  window is lost.
- With two concurrent generations on one session (e.g. debounced Expander +
  immediate Articulator), the first `done` closes the connection mid-stream
  for the other.

This close-on-done behaviour is flagged as P0 in FRONTEND-CONTRACT.md §11
(recommended fix: hold the connection until abort; `done` becomes
informational). If you change it, update both docs.

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
// NOTE: no stream message carries thread_id/turn_index today — the frontend
// resolves them by reading agent_threads (canvas_id, agent_role) and matching
// ghost_pair.context_ghost_id, AFTER done (with retry — the turn is persisted
// after done publishes). See FRONTEND-CONTRACT.md §7.2 / §11 P0.
```

---

## Frontend Responsibilities (for reference — not implemented here)

> Full consumer-side spec with payloads and workarounds: **`FRONTEND-CONTRACT.md`**.

The frontend (separate repo: thinking-canvas-web) is responsible for:
- Rendering ghost node HTML from the spawn descriptor (backend defines content only)
- Creating ghost node + edge React Flow elements on `spawn` message
- Filling ghost node text content on `chunk` messages (by ghost_id target)
- **Parsing the inline markers out of the raw token stream** — `[NODE_TYPE: x]`
  (overrides the descriptor's default type), `[QUESTION]` (split point: route
  the rest into the question ghost — the backend does not split), and the
  Articulator's `[ARTICULATION n]` sections
- Removing an empty question ghost + edge at `done` (appreciation responses may omit `[QUESTION]`)
- Accept/Reject UI and calling POST /api/ghost-status (resolving
  thread_id/turn_index via an agent_threads read — see FRONTEND-CONTRACT.md §7.2)
- **Persisting accepted ghosts itself** — inserting the `nodes` (owner:'ai') and
  `edges` rows; the backend only records the status on the thread
- RejectionReasonSelector component
- Writing user-created nodes/edges directly to Supabase, then notifying via
  POST /api/canvas-event (write-first, notify-second)
- Reconnecting the EventSource after every `done` (the server closes the stream)

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

// Step 7: Stream — streamAgentOutput (src/streaming/tokens.ts) publishes every
// token as a chunk targeting the CONTEXT ghost id and returns the full text.
const responseText = await step.run('stream-context', async () => {
  const stream = await streamExpander({ … })
  return streamAgentOutput(stream.textStream, descriptor.context_node.ghost_id, session_id)
})

// Step 8 ('finalize'): publishDone(session_id) THEN appendMessage(ghost_pair,
// pair_status:'pending') — done is published BEFORE the turn is persisted,
// which is why frontend thread reads after done must retry (FRONTEND-CONTRACT.md §7.2).
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
