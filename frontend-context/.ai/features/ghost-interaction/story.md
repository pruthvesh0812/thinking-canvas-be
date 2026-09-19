---
feature: "ghost-interaction"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/ghost-interaction-<timestamp>]"
---

## What
The consent threshold: per-node accept/reject controls on streamed pairs, the
rejection reason selector, ghost→real materialization, and the
`POST /api/ghost-status` report.

## Why
"AI offers, human decides" only becomes true here. Rejection with a reason is
also the input to the backend's entire learning loop (Rejection Insights →
negative constraints) — this story is signal collection, not just cleanup.

## Context to Load
`CORE-CONCEPTS.md` + `GHOST-STREAMING.md` + `API-CONTRACT.md`

## Depends On
ghost-streaming. ⚠ Partially **blocked by API-CONTRACT Known Gap #1** — see
Contract Impact.

## Blast Radius
Ghost components, ghost store, persistence hook, api.ts.

## Files to Touch
```
CREATE:
  src/components/ghost/GhostControls.tsx          (per-node accept/reject, gated on done)
  src/components/ghost/RejectionReasonSelector.tsx (too_abstract | too_technical | skip_for_now)
MODIFY:
  src/stores/ghost-store.ts        (resolve flow + meta for thread_id/turn_index)
  src/hooks/use-canvas-persistence.ts (materialize accepted ghosts: owner:'ai',
                                       ghost_id reused as the real node id)
  src/lib/api.ts                   (ghostStatus wrapper)
```

## Contract Impact
- `POST /api/ghost-status` — **Known Gap #1: the stream doesn't deliver
  thread_id/turn_index yet.** Required backend change (enrich `done` or
  `spawn`); coordinate before or during this story. Build the store to hold
  the metadata either way.
- Accept: Supabase inserts for accepted node(s)+edge(s), owner:'ai', **no
  canvas-event fired** (the pipeline must not react to its own output —
  Known Gap #5 documents the enrichment consequence). Persist the store's
  **parsed** `contextText` / `questionText` (markers stripped) — never the raw
  stream (Known Gap #6, GHOST-STREAMING → Content Delivery).
- Reject: reason is mandatory UI; backend defaults to skip_for_now if omitted.

## Risks
- Mixed outcomes (context accepted, question rejected) are one API call with
  two statuses — not two calls.
- Ghost→real animation must end in a node visually identical to other
  `owner:'ai'` real nodes (persistent role marker, full opacity).

## Definition of Done
Accept a pair → both nodes turn real with solid edges, rows exist in Supabase
with `owner='ai'` and the ghost ids → `ghost-status` logged 200 backend-side.
Reject with "too_abstract" → ghosts vanish, backend logs the
rejection-insights pipeline firing. Mixed accept/reject works. Appreciation
node shows acknowledge-only UI.

## Task Breakdown
NONE — implement directly from this story.
