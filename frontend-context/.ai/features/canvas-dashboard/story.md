---
feature: "canvas-dashboard"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/canvas-dashboard-<timestamp>]"
---

## What
The multi-canvas home: list the user's canvases with title, intent excerpt and
last-session info; create and open canvases. Removes the manual row-seeding
crutch from canvas-core.

## Why
Canvases are permanent containers and users think across several of them —
the workspace model needs a front door.

## Context to Load
`CORE-CONCEPTS.md` + `SESSION-FLOWS.md`

## Depends On
session-lifecycle (open-canvas flow reuses its session start + carry-forward)

## Blast Radius
Dashboard page only.

## Files to Touch
```
MODIFY:
  src/app/page.tsx        (replace placeholder with canvas grid)
CREATE:
  src/components/canvas/CanvasCard.tsx
```

## Contract Impact
Supabase reads: `canvases` joined with latest `sessions` (status, end_time)
and node counts. No backend endpoints.

## Risks
- Node counts across many canvases can get query-heavy — one aggregate query,
  not N+1 per card.

## Definition of Done
Dashboard lists all of the user's canvases; [New Canvas] → north star capture;
clicking a card opens the canvas through the standard session-start flow.
Anonymous users see their single canvas.

## Task Breakdown
NONE — implement directly from this story.
