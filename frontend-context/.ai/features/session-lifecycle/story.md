---
feature: "session-lifecycle"
type: story
created: 2026-07-05
status: draft
git_branch: "[set at implementation: feature/session-lifecycle-<timestamp>]"
---

## What
The session arc: north star capture on canvas creation, phase toggle, the
three-screen Session Complete modal, unresolved-thread extraction, and
carry-forward into the next session.

## Why
Session Complete is the human-controlled gate for all end-of-session AI
activity — the Observer only ever speaks here. Without it the product has a
beginning but no end, and nothing learns across sessions.

## Context to Load
`CORE-CONCEPTS.md` + `SESSION-FLOWS.md`

## Depends On
ghost-interaction (screen 1 accepts observations onto the canvas using the
same materialization path)

## Blast Radius
`/canvas/new` page, session components (new), session store, api.ts.

## Files to Touch
```
CREATE:
  src/components/session/PhaseToggle.tsx
  src/components/session/SessionCompleteModal.tsx   (3-screen shell + state machine)
  src/components/session/ObserverSuggestions.tsx    (screen 1 — session_learnings cards)
  src/components/session/UnresolvedThreads.tsx      (screen 2 — frontend-computed)
MODIFY:
  src/app/canvas/new/page.tsx      (north star capture → canvases insert → session/start)
  src/stores/session-store.ts      (phase, modal state)
  src/lib/api.ts                   (sessionComplete wrapper)
```

## Contract Impact
- Supabase: `canvases` insert (original_intent, INSERT-once); `sessions.current_phase`
  write (toggle); reads + writes `session_learnings` (screen 2 choices, carry-forward
  load on next start).
- Backend: `POST /api/session/complete` (async — screen 1 shows an "Observer is
  reading your canvas" state and polls `session_learnings`).
- ⚠ `carry_forward_ids` ordering asymmetry — see SESSION-FLOWS.md → the modal
  note. v1: complete with `[]`, write screen-2 choices from the frontend.

## Risks
- Phase toggle → converging makes the Stress-Tester eligible; verify a
  challenge ghost actually arrives (this exercises a backend path nothing
  else does).
- Unresolved extraction is frontend-computed (question edges unanswered, empty
  nodes, unfollowed contradictions) — define "unanswered" precisely: no
  outgoing follow-up node from the question edge's target.

## Definition of Done
New canvas via north star prompt (intent visible, not editable). Toggle to
converging → stress-test ghost appears. Session Complete → observer
observations listed → unresolved threads listed with carry choices → session
closed; reopening the canvas starts a new session with carried items rendered
as visually distinct pre-loaded nodes.

## Task Breakdown
NONE — implement directly from this story.
