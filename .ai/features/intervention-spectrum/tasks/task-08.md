---
feature: "intervention-spectrum"
type: task
task_id: task-08
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
The **receptivity model** — offer-response (deferred / dismissed / ignored /
"process now") tunes future intensity + timer length — and the **offer purge**
(fold the response into a running aggregate, then delete the row). See DESIGN.md
§4f (Retention), §8.

## Files to Touch
```
MODIFY:
  src/lib/intervention.ts          → receptivity aggregate (decayed) + read for intensity/timer
  src/routes/intervention.ts       → /dismiss + /process(defer) update receptivity
  src/pipeline/session-complete.ts → purge resolved offers for the session
  src/db/intervention-offers.ts    → purge helpers (by session; TTL sweep for abandoned waits)
```

## The trap to avoid (DESIGN §8)
Offer-response ≠ content-rejection. **Never write `rejection_insights` here.** A
deferred timer / ignored glow means "not now," not "bad idea." It feeds a separate
**receptivity aggregate** only (a small decayed counter on the session/canvas).

## Purge (ephemeral offers)
- At a terminal status, first **fold the receptivity signal** into the aggregate,
  then the offer row is eligible for deletion.
- `session-complete` purges resolved offers for the session; a **TTL sweep** cleans
  up abandoned `waiting` offers (their `waitForEvent` already expired them).
- Permanent record stays on the thread (`ghost_pair`) + `AiContribution` — not here.

## Depends On
task-04 (offers + routes). Integrates with the existing `session-complete` pipeline.

## Definition of Done
- [ ] dismiss / defer / ignore update a **decayed receptivity aggregate** — NOT `rejection_insights`
- [ ] Receptivity tunes intensity + timer length
- [ ] `session-complete` purges resolved offers; TTL sweep removes abandoned `waiting` offers
- [ ] Receptivity signal is folded in before the row is purged
- [ ] `npm run build` compiles
