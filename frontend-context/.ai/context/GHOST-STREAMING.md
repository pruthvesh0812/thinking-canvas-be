---
last-verified: 2026-07-05
verified-against: backend CANVAS-SYNC.md (2026-06-08) + src/streaming/spawn.ts + src/streaming/tokens.ts + src/routes/stream.ts
stale-after-days: 30
---

# GHOST-STREAMING.md

> **Load this when:** Working on the SSE hook, ghost node rendering, the ghost
> store, accept/reject flow, or anything touching `spawn`/`chunk`/`done` handling.

---

## The Protocol (frontend side)

One `EventSource` per active session. Every ghost pair arrives as this sequence:

```
spawn ──1.5s──▶ chunk* (context node) ──▶ chunk* (question node) ──▶ done
```

The 1.5s gap is a deliberate backend sleep (`inngest.sleep('ghost-animation')`)
— it exists so the frontend can animate empty ghost frames onto the canvas
before text starts arriving. Use it.

```typescript
type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }   // target = ghost_id
  | { type: 'done' }
  | { type: 'ping' }                                   // keepalive — ignore
```

---

## SpawnDescriptor → Canvas Elements

The descriptor **is** the ghost layout. The frontend maps it 1:1 to React Flow
elements — it never invents structure, and the backend never dictates pixels.

```typescript
type SpawnDescriptor = {
  trigger_node_id: string          // the real node the pair anchors to
  session_id: string
  context_node: {
    ghost_id: string               // pre-assigned UUID — chunk messages target this
    node_type: ContextNodeType     // reframe | mirror | pattern | reference | contradiction | appreciation
    agent_role: AgentRole          // shown as the small role icon
  }
  context_edge: { edge_type: EdgeType; from: string; to: string }
  question_node?: { ghost_id: string; node_type: 'question' }   // absent for some appreciations
  question_edge?: { edge_type: EdgeType; from: string; to: string }
}
```

On `spawn` the frontend:
1. If a pending pair already exists for `trigger_node_id` → remove it
   (one-pair-per-node rule; the new pair replaces the old).
2. Create ghost React Flow nodes (empty content) + dotted ghost edges,
   positioned floating near the trigger node — above the canvas layer,
   non-blocking.
3. If `context_node.node_type === 'appreciation'` and there is no question
   node → render at full opacity with no reject button (the sole exception).
4. Start the ghost-frame entrance animation (~the 1.5s window).

On `chunk`: append `data` to the ghost node whose `ghost_id === target`.
Tokens arrive in order per target; context streams fully before question starts.

On `done`: mark the pair streamed — enable the accept/reject controls.
(Controls before `done` would let the user judge a half-streamed thought.)

---

## The useGhostStream Hook

```typescript
// src/hooks/use-ghost-stream.ts
// Owns the EventSource lifecycle for the active session and dispatches every
// message into the ghost store. Components never touch the EventSource.
export function useGhostStream(sessionId: string | null) {
  useEffect(() => {
    if (!sessionId) return
    const source = new EventSource(`${API_URL}/api/stream/${sessionId}`)

    source.onmessage = (e) => {
      const msg = JSON.parse(e.data) as RedisMessage
      switch (msg.type) {
        case 'spawn': useGhostStore.getState().spawn(msg.descriptor); break
        case 'chunk': useGhostStore.getState().appendChunk(msg.target, msg.data); break
        case 'done':  useGhostStore.getState().markDone(); break
        case 'ping':  break
        default:
          // Forward-compat: the protocol will grow (waiting/offer/withdraw).
          // Unknown types are logged and ignored — never thrown on.
          logger.warn('[ghost-stream] unknown message type', { msg })
      }
    }

    source.onerror = () => { /* EventSource auto-reconnects; log only */ }
    return () => source.close()
  }, [sessionId])
}
```

**Lifecycle rules:**
- Open on canvas mount (once the active session id is known), close on unmount.
- `EventSource` reconnects automatically on drop — don't hand-roll retry loops.
  A pair that was mid-stream during a drop is lost; the ghost store should
  discard any pair still un-`done` after a reconnect rather than show a stub.
- The backend sends `ping` every 25s; silence much longer than that means the
  connection is dead even if the browser hasn't noticed.

---

## Accept / Reject Flow

Per node in the pair — the user may accept the context and reject the question.

```
User clicks accept/reject on each pair node
  │
  ├── ACCEPT side effects (frontend owns materialization):
  │     1. Write accepted ghost(s) to Supabase as real nodes:
  │        { owner: 'ai', content: streamedText, canvas_id, session_id }
  │        + the connecting edge rows
  │     2. Do NOT fire POST /api/canvas-event for them — the agent pipeline
  │        must not react to its own output (see API-CONTRACT Known Gap #5)
  │     3. Animate ghost → real (opacity 100%, solid border, solid edge)
  │
  ├── REJECT side effects:
  │     1. RejectionReasonSelector — too_abstract | too_technical | skip_for_now
  │     2. Remove the ghost elements
  │
  └── Either way, ONE call: POST /api/ghost-status with both node statuses
        ⚠ requires thread_id + turn_index — not yet delivered over SSE
          (API-CONTRACT Known Gap #1). Blocked until the backend enriches
          the done/spawn message; build the store to hold this metadata.
```

Rejection is not failure — it is signal. The backend converts the reason into
negative constraints for future prompts, so the reason selector is mandatory
UI, not decoration.

---

## Ghost Store Shape

```typescript
// src/stores/ghost-store.ts
// Pending pairs keyed by trigger node — the one-pair-per-node rule falls out
// of the data structure instead of being checked imperatively.
type GhostPairState = {
  descriptor: SpawnDescriptor
  contextText: string
  questionText: string
  streamed: boolean                        // set by done — gates the controls
  meta?: { thread_id: string; turn_index: number }  // pending Known Gap #1
}

type GhostStore = {
  pairs: Record<string, GhostPairState>    // key = trigger_node_id
  spawn(d: SpawnDescriptor): void          // replaces existing pair for the node
  appendChunk(ghostId: string, data: string): void
  markDone(): void
  resolve(triggerNodeId: string): void     // remove after accept/reject completes
}
```

---

## What NOT to Do

```typescript
// ❌ Never subscribe to Supabase Realtime for ghosts (or anything else)
// ❌ Never render ghost layout from anything but the SpawnDescriptor
// ❌ Never let chunks create nodes — a chunk whose target has no spawned
//    frame is a protocol error: log it, drop it
// ❌ Never auto-accept, auto-reject, or fade a ghost on a timer
// ❌ Never open more than one EventSource per session
// ❌ Never throw on an unknown SSE message type
```
