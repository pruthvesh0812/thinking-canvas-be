---
last-verified: 2026-07-05
verified-against: backend src/streaming/tokens.ts + src/streaming/spawn.ts + src/routes/stream.ts + src/agents/*.ts prompt constants + all three streaming pipelines (read line-by-line — NOT the backend design docs, which describe an unimplemented server-side split)
stale-after-days: 30
---

# GHOST-STREAMING.md

> **Load this when:** Working on the SSE hook, ghost node rendering, the ghost
> store, accept/reject flow, or anything touching `spawn`/`chunk`/`done` handling.

---

## The Protocol (frontend side)

One `EventSource` per active session. Every ghost pair arrives as this sequence:

```
spawn ──1.5s──▶ chunk* ──▶ done
                  └─ EVERY chunk targets context_node.ghost_id (see below).
                     There is NO separate stream for the question node.
```

The 1.5s gap is a deliberate backend sleep (`step.sleep('ghost-animation','1500ms')`)
— it exists so the frontend can animate empty ghost frames onto the canvas
before text starts arriving. Use it.

```typescript
type RedisMessage =
  | { type: 'spawn'; descriptor: SpawnDescriptor }
  | { type: 'chunk'; target: string; data: string }   // target = ALWAYS the context ghost_id
  | { type: 'done' }
  | { type: 'ping' }                                   // keepalive — ignore
```

> ⚠️ **The single most important thing on this page.** The backend streams the
> agent's **raw output** — one stream, all chunks tagged with
> `context_node.ghost_id` — and that raw text contains inline control markers
> (`[NODE_TYPE: …]`, `[QUESTION]`, `[ARTICULATION n]`). The question node is
> **never** streamed to separately, and the markers are **never** stripped
> server-side. The frontend parses the markers and routes the text itself. This
> is verified against `src/streaming/tokens.ts` (`streamAgentOutput` publishes
> every token to a single ghost id) — the backend's own design comments describe
> a server-side split that **was never implemented**. See "Content Delivery"
> below and API-CONTRACT Known Gap #6.

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

On `chunk`: `target` is **always** `context_node.ghost_id`. Append `data` to the
pair's accumulating raw buffer, then re-derive the split (context text, question
text, node type) from that buffer — see "Content Delivery" next. Do **not** look
up a node by `target` and render `data` verbatim: that paints raw markers and
leaves the question node forever empty.

On `done`: mark the pair streamed — enable the accept/reject controls.
(Controls before `done` would let the user judge a half-streamed thought.)

---

## Content Delivery — One Raw Stream, You Parse the Markers

The `node_type` in the SpawnDescriptor is only a **pre-assigned default** (the
backend mints it before the agent runs). The real node type and the context /
question split live in the streamed text as markers. Grammar, verified from the
agent prompt constants in `src/agents/*.ts`:

```
[NODE_TYPE: reframe|mirror|pattern|reference|contradiction|appreciation]
<context paragraph>
[QUESTION]
<question sentence>
```

- **Expander / Stress-Tester / Outer Subconscious** emit the above.
  `[QUESTION]` is present except for a rare Expander `appreciation` (no question).
- **Articulator** emits **no `[QUESTION]`**; instead its body is 2–3 options:
  ```
  [NODE_TYPE: …]
  [ARTICULATION 1]
  <one reading>
  [ARTICULATION 2]
  <another reading>
  [ARTICULATION 3]   (optional)
  <a third>
  ```
  Render these as selectable options inside the single context node — there is
  no question node for the Articulator.

**Parsing rules (do this in the ghost store's `appendChunk`, not in components):**
1. **Buffer, then parse.** Markers can be split across chunk boundaries
   (`"[QUEST"` + `"ION]"`). Accumulate the raw stream per pair and re-parse the
   whole buffer on each chunk — never regex a single `data` payload.
2. `[NODE_TYPE: x]` → set the context node's rendered type to `x` (this
   **overrides** the descriptor default). Strip the marker line from display.
3. Text after the `[NODE_TYPE]` line and before `[QUESTION]` → **context** node.
4. Text after `[QUESTION]` → **question** node (render it into
   `question_node.ghost_id`'s frame — which you created from the descriptor at
   `spawn`, not from any chunk `target`).
5. Never show a partial marker (e.g. a trailing `"["`) as ghost text — hold
   incomplete bracket sequences in the buffer until they resolve.

The persisted, accept-time content is this parsed text with markers stripped
(context text → the `owner:'ai'` context node; question text → the question node).

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
        // target is always the context ghost id; the store buffers + parses (markers → context/question split)
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
- **The backend closes the connection after every `done`** (verified in
  `src/routes/stream.ts` — the handler resolves on the first `done`). So a
  reconnect is routine, not an error, and it happens after *every* ghost — treat
  `onerror`/reconnect as normal flow. Upstash pub/sub has **no replay**, so any
  `spawn` published during the reconnect window is lost; and two generations that
  overlap on one session (a debounced Expander + an immediate Articulator) will
  see the first `done` cut the second short. This is a backend wart
  (API-CONTRACT Known Gap #6b) — until it's fixed, don't assume every triggered
  agent produces a visible ghost.
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
  raw: string                              // accumulated stream (markers included)
  nodeType: ContextNodeType                // starts = descriptor default, overridden by [NODE_TYPE:]
  contextText: string                      // parsed from raw — markers stripped
  questionText: string                     // parsed from raw (text after [QUESTION])
  articulations?: string[]                 // Articulator only — parsed [ARTICULATION n] sections
  streamed: boolean                        // set by done — gates the controls
  meta?: { thread_id: string; turn_index: number }  // pending Known Gap #1
}

type GhostStore = {
  pairs: Record<string, GhostPairState>    // key = trigger_node_id
  spawn(d: SpawnDescriptor): void          // replaces existing pair for the node
  // target is always the context ghost id; appendChunk pushes onto `raw` then
  // re-parses raw → { nodeType, contextText, questionText, articulations }.
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
// ❌ Never render chunk `data` verbatim — it carries [NODE_TYPE:]/[QUESTION]/
//    [ARTICULATION] markers; parse them out (Content Delivery) or the user sees
//    raw markup and the question node stays empty
// ❌ Never wait for chunks targeting the question ghost id — they never come;
//    the question text is parsed out of the context stream
// ❌ Never auto-accept, auto-reject, or fade a ghost on a timer
// ❌ Never open more than one EventSource per session
// ❌ Never throw on an unknown SSE message type
```
