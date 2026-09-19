---
feature: "observer-structure-ui"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/observer-structure-ui-<timestamp>]"
---

> ⚠ **Blocked backend-side.** `POST /api/observer-edge-status` is schema-only
> (API-CONTRACT Known Gap #2) and structures are surfaced only as flat
> `session_learnings` today. Confirm the backend has (a) the edge-status route
> and (b) a way to read full `observer_structures` + `observer_edges` for the
> Session Complete screen before starting. Everything else in the frontend is
> ready for it.

## What
The Observer's interactive form: anchor highlighting on existing canvas nodes,
hover-revealed observation DAG (ghost-state), per-EDGE accept/reject with
connection feedback, and node materialization once all incoming edges are
accepted.

## Why
The Observer deliberately doesn't produce ghost pairs — it lets the user pull
the thread themselves. This is the most philosophically distinctive UI in the
product and the only per-edge consent surface.

## Context to Load
`CORE-CONCEPTS.md` (→ The Observer Structure) + `GHOST-STREAMING.md` + `API-CONTRACT.md`

## Depends On
session-lifecycle + backend gap closure (above)

## Blast Radius
Observer components (new), observer store, Session Complete screen 1, api.ts.

## Files to Touch
```
CREATE:
  src/components/observer/AnchorHighlight.tsx
  src/components/observer/StructureOverlay.tsx      (leveled DAG, ghost-state)
  src/components/observer/EdgeFeedbackSelector.tsx  (not_related | wrong_direction |
                                                     too_indirect | already_obvious)
  src/stores/observer-store.ts
MODIFY:
  src/components/session/ObserverSuggestions.tsx    (cards → interactive structures)
  src/lib/api.ts                                    (observerEdgeStatus wrapper — once route exists)
```

## Contract Impact
- Supabase reads: `observer_structures` + `observer_edges`.
- Backend: `POST /api/observer-edge-status` per edge decision.
- Core rules to encode (from CORE-CONCEPTS.md): a node materializes only when
  ALL incoming edges are accepted; rejects BATCH — the pending structure stays
  visible while the user flags, tears down only when they finish, and the
  Observer re-thinks; already-accepted nodes stay committed.

## Risks
- The batch-reject lifecycle is the subtle part — rejecting one edge must NOT
  remove the rest before the user has judged them. Model it as an explicit
  "flagging" state in the observer store with a done action.
- Level layout: strict level-k → level-k+1 edges mean a simple column layout
  works — don't reach for a graph-layout library.

## Definition of Done
Anchors glow on Session Complete screen 1 → hover reveals the structure →
accepting all edges into a level-0 node materializes it as a real `owner:'ai'`
node → rejecting an edge (with feedback) enters flagging state, and finishing
tears down the pending remainder → backend receives one edge-status call per
decision.

## Task Breakdown
NONE — implement directly from this story (after unblocking).
