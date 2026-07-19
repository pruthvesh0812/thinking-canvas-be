---
feature: "canvas-core"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/canvas-core-<timestamp>]"
---

## What
A working thinking surface: the canvas page renders, the user creates and edits
human nodes, everything persists to Supabase and notifies the backend — the
write-then-notify loop, live end to end.

## Why
This is the product's core interaction ("Add node with text" is P0 — without
it nothing works) and the first story that exercises the full data flow the
backend was built against.

## Context to Load
`CORE-CONCEPTS.md` + `CANVAS-RENDERING.md` + `STATE-MANAGEMENT.md`

## Depends On
contract-layer

## Blast Radius
Canvas page, canvas + session stores, persistence hook, HumanNode.

## Files to Touch
```
CREATE:
  src/components/canvas/Canvas.tsx           (React Flow wrapper, nodeTypes const)
  src/components/canvas/nodes/HumanNode.tsx
  src/components/canvas/NorthStarHeader.tsx  (reads canvas.original_intent, read-only)
  src/stores/canvas-store.ts
  src/stores/session-store.ts
  src/hooks/use-canvas-persistence.ts        (hydrate + persistNode + rollback)
MODIFY:
  src/app/canvas/[canvasId]/page.tsx
```

## Contract Impact
- Supabase: reads `canvases`/`sessions`/`nodes`; inserts `nodes` (owner:'human',
  client-generated UUIDs); position updates (no canvas-event for positions).
- Backend: `POST /api/session/start` on mount when no active session;
  `POST /api/canvas-event` (`node.created`) after each content commit.
- ⚠ Node edits persist but have no backend event (Known Gap #3) — do not
  invent one; leave a contract-seam comment at the edit path.

## Risks
- Persist-on-blur semantics: an empty node abandoned without content should
  not fire canvas-event (backend would summarize an empty string).
- Requires seeded canvas rows until canvas-dashboard lands — document the
  seeding step (Supabase dashboard insert) in the story PR.

## Definition of Done
Open a seeded canvas → session auto-starts → create nodes (click / `n`), type,
blur → rows visible in Supabase with correct canvas_id/session_id → backend
logs show the canvas-event and a summary written onto the row → reload
rehydrates the identical canvas including positions.

## Task Breakdown
NONE — implement directly from this story.
