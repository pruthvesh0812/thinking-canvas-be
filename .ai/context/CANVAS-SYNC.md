---
last-verified: 2026-06-08
verified-against: ThinkingCanvas_TechnicalBuild.docx (post single-user refactor)
stale-after-days: 30
---

# CANVAS-SYNC.md

> **Load this when:** Working on ghost node streaming, SSE endpoint, Upstash Redis pub/sub, spawn descriptor, ghost status updates, or Rejection Insights UI flow.

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
  | { type: 'spawn';  descriptor: SpawnDescriptor }
  | { type: 'chunk';  target: string; data: string }  // target = ghost_id
  | { type: 'done' }
```

---

## Hono SSE Endpoint

```typescript
// src/routes/stream.ts
app.get('/api/stream/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  return streamSSE(c, async (stream) => {
    const sub = redis.subscribe(`canvas:stream:${sessionId}`)

    sub.on('message', async (_, message) => {
      await stream.writeSSE({ data: message })

      if (JSON.parse(message).type === 'done') {
        await sub.unsubscribe()
      }
    })

    // Keepalive ping every 25s to prevent SSE timeout
    const ping = setInterval(async () => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'ping' }) })
    }, 25000)

    stream.onAbort(() => {
      clearInterval(ping)
      sub.unsubscribe()
    })
  })
})
```

---

## Ghost Status Update Endpoint

```typescript
// POST /api/ghost-status
// Payload:
{
  thread_id: string
  turn_index: number              // which AssistantMessage in thread
  canvas_id: string
  session_id: string
  context_node_status: 'accepted' | 'rejected'
  question_node_status: 'accepted' | 'rejected' | null
  rejection_reason?: RejectionReason
  interacted_at: number
}

// Backend:
// 1. Update AssistantMessage in agent_thread (canvas-scoped)
// 2. If context_node_status === 'rejected' → fire rejection-insights Inngest event
// 3. NO Realtime broadcast — single-user, no other clients to notify
```

---

## Frontend Responsibilities (for reference — not implemented here)

The frontend (separate repo: thinking-canvas-web) is responsible for:
- Rendering ghost node HTML from the spawn descriptor (backend defines content only)
- Creating ghost node + edge React Flow elements on `spawn` message
- Filling ghost node text content on `chunk` messages (by ghost_id target)
- Accept/Reject UI and calling POST /api/ghost-status
- RejectionReasonSelector component
- Writing user-created nodes/edges directly to Supabase (no backend involvement)

The backend does NOT define how ghost nodes look. It defines:
- What type of node (reframe, mirror, question etc.)
- What text to fill in (streamed tokens)
- What edge connects them

---

## Ghost Status Lifecycle (backend thread perspective)

```
pending → accepted | rejected | context_accepted | question_accepted
pending + (2 new nodes created without interaction) → ignored
```

On rejection:
```typescript
await inngest.send({
  name: 'canvas/ghost.rejected',
  data: {
    canvas_id, session_id, thread_id,
    triggered_by_node_id,
    rejected_ghost_content,
    rejection_reason,
    ghost_type: 'context' | 'question'
  }
})
```

---

## Spawn in Agent Pipeline (Inngest step order)

```typescript
// src/pipeline/agent-pipeline.ts

// Step 4: Build and publish spawn
await step.run('publish-spawn', async () => {
  const descriptor = buildSpawnDescriptor({
    trigger_node_id: event.data.node_id,
    session_id: event.data.session_id,
    agent_role: route.agent,
    // context_node type determined AFTER first Orchestrator decision
    // but ghost_ids are pre-assigned here (UUIDs)
    context_ghost_id: crypto.randomUUID(),
    question_ghost_id: crypto.randomUUID(),
  })

  await redis.publish(
    `canvas:stream:${event.data.session_id}`,
    JSON.stringify({ type: 'spawn', descriptor })
  )

  return descriptor
})

// Step 5: Sleep for ghost animation
await inngest.sleep('ghost-animation', '1500ms')

// Step 6: Stream context node content
await step.run('stream-context', async () => {
  const stream = await agent.stream(serializedContext)
  for await (const token of stream.textStream) {
    await redis.publish(
      `canvas:stream:${event.data.session_id}`,
      JSON.stringify({ type: 'chunk', target: descriptor.context_node.ghost_id, data: token })
    )
  }
})
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
