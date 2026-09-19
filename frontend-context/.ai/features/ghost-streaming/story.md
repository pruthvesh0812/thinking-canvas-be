---
feature: "ghost-streaming"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/ghost-streaming-<timestamp>]"
---

## What
The SSE consumer end to end: EventSource hook, ghost store, ghost node/edge
components, and the spawn → animate → stream → done rendering sequence. After
this story, thinking on the canvas makes ghosts appear.

## Why
This is the "felt experience" moment — the primary AI interaction that proves
the core value. It is also the frontend half of the backend's most carefully
specified protocol.

## Context to Load
`CORE-CONCEPTS.md` + `GHOST-STREAMING.md` + `CANVAS-RENDERING.md`

## Depends On
edge-system (ghosts anchor to real nodes and arrive via edge-triggered agents too)

## Blast Radius
Ghost layer (new), Canvas.tsx (ghost merge), debounce indicator.

## Files to Touch
```
CREATE:
  src/hooks/use-ghost-stream.ts        (EventSource lifecycle + dispatch)
  src/stores/ghost-store.ts            (pairs keyed by trigger_node_id)
  src/components/ghost/GhostContextNode.tsx
  src/components/ghost/GhostQuestionNode.tsx
  src/components/canvas/edges/GhostEdge.tsx
  src/components/canvas/DebounceIndicator.tsx
  src/hooks/use-debounce-indicator.ts
MODIFY:
  src/components/canvas/Canvas.tsx     (merge ghost layer into nodes/edges)
```

## Contract Impact
- `GET /api/stream/:sessionId` — one EventSource per active session.
- Handles `spawn`/`chunk`/`done`/`ping`; unknown types logged + ignored
  (forward-compat non-negotiable #10).
- Rendering derives strictly from SpawnDescriptor (non-negotiable #3).
- ⚠ **Known Gap #6:** every `chunk` targets `context_node.ghost_id` and carries
  RAW agent text with `[NODE_TYPE:]`/`[QUESTION]`/`[ARTICULATION]` markers. The
  store must buffer + parse (markers split across chunks) and route the question
  text into the question frame itself — the backend never streams the question
  node separately. See GHOST-STREAMING.md → Content Delivery.
- ⚠ **Known Gap #6b:** the connection closes after every `done` (reconnect is
  routine); discard any un-`done` pair after a reconnect.

## Risks
- The 1.5s spawn→chunk window is the animation budget — an entrance animation
  longer than that will still be moving when text arrives.
- Reconnect: EventSource auto-reconnects; pairs left un-`done` across a drop
  must be discarded, not shown as stubs (GHOST-STREAMING.md → Lifecycle).
- Appreciation-without-question renders full-opacity/no-reject — easy to miss.

## Definition of Done
Create a node, pause ~10s → debounce dot shows → ghost frames animate in →
raw stream arrives on the context ghost id and the store parses it: `[NODE_TYPE:]`
sets the context node's type, context text fills the context node, and the text
after `[QUESTION]` fills the **question** node (no markers visible anywhere) →
`done` marks the pair streamed. An Articulator pair (existing-nodes edge) renders
its `[ARTICULATION n]` options in the single context node, no question node.
Question edge produces an immediate pair with no debounce wait. A second spawn on
the same node replaces the first pair. A mid-stream reconnect discards the
partial pair rather than showing a stub.

## Task Breakdown
NONE — implement directly from this story.
