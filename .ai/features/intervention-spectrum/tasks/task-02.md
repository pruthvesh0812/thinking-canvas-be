---
feature: "intervention-spectrum"
type: task
task_id: task-02
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Wire the currently-dead `updatePhase()` so a session transitions
**`diverging → converging` once** (one-way latch, v1), with hysteresis. This
unlocks the Stress-Tester, which is unreachable today. See DESIGN.md §4c.

## Files to Touch
```
MODIFY:
  src/db/sessions.ts   → a guarded transition helper around the existing updatePhase()
  (call site lands with the judge — task-03; this task provides the mechanism + threshold)
```

## Mechanism
```typescript
// v1 = ONE-WAY latch. Never converging → diverging (that is re-divergence, deferred).
// Flip only on a confident/sustained diverging→converging signal from Attunement.
export async function maybeAdvancePhase(
  session: Session,
  attunement: Pick<AttunementOutput, 'phase_shift_suggested' | 'confidence'>,
): Promise<SessionPhase> {
  if (session.current_phase === 'converging') return 'converging'      // latched
  const confident = attunement.phase_shift_suggested
    && (attunement.confidence ?? 0) >= PHASE_SHIFT_MIN_CONFIDENCE       // hysteresis
  if (confident) { await updatePhase(session.id, 'converging'); return 'converging' }
  return 'diverging'
}
```
- `PHASE_SHIFT_MIN_CONFIDENCE` is the hysteresis threshold (tune; DESIGN §10 open).
- No transitions log in v1 (deferred with branching).

## Depends On
None (uses existing `sessions` + Attunement). Consumed by task-03.

## Definition of Done
- [ ] `updatePhase()` is called on a confident `diverging→converging` shift only
- [ ] Never flips `converging→diverging` (v1 one-way latch)
- [ ] Hysteresis threshold applied — no flip on a single low-confidence read
- [ ] A converging session can route to the Stress-Tester (previously unreachable) — verified
- [ ] `npm run build` compiles
