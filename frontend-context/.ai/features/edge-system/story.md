---
feature: "edge-system"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/edge-system-<timestamp>]"
---

## What
Typed directed edges: the four edge components, the type selector on connect,
correct `edge_type`/`both_existing` at write time, and the question-edge pulse.

## Why
"The data structure lives or dies here" (P0). The edge flags are also the
backend's routing signals — a question edge fires the Outer Subconscious
immediately, a both-existing edge fires the Articulator immediately. Wrong
flags = wrong agent = broken product feel.

## Context to Load
`CORE-CONCEPTS.md` + `CANVAS-RENDERING.md` + `STATE-MANAGEMENT.md`

## Depends On
canvas-core

## Blast Radius
Edge components, EdgeTypeSelector, persistence hook, canvas store.

## Files to Touch
```
CREATE:
  src/components/canvas/edges/LogicalEdge.tsx
  src/components/canvas/edges/DoubtEdge.tsx
  src/components/canvas/edges/QuestionEdge.tsx      (pulsing animation)
  src/components/canvas/edges/AssociativeEdge.tsx   (render-only; not user-selectable)
  src/components/canvas/EdgeTypeSelector.tsx
MODIFY:
  src/components/canvas/Canvas.tsx                  (edgeTypes const, onConnect)
  src/hooks/use-canvas-persistence.ts               (persistEdge)
```

## Contract Impact
- Supabase: inserts `edges` with `edge_type` + `both_existing` set at draw time
  (see CANVAS-RENDERING.md → both_existing).
- Backend: `POST /api/canvas-event` (`edge.created`) after the insert. Expect
  immediate pipelines for question / both-existing edges once ghost-streaming
  lands — nothing visible yet in this story.

## Risks
- The edge row must not be written until a type is chosen (Escape cancels) —
  a default-typed edge would mis-route agents.
- `both_existing` derivation: edge drawn via connect-two-nodes is true; the
  auto-edge of a "create child node" gesture is false. Get the gesture
  distinction right before the flag.

## Definition of Done
Connect two existing nodes → selector appears → choosing question renders the
pulsing edge and the Supabase row shows `edge_type='question'`,
`both_existing=true`; backend logs show the outer-sub pipeline firing; Escape
during selection leaves no row behind.

## Task Breakdown
NONE — implement directly from this story.
