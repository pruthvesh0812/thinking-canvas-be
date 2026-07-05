---
feature: "intervention-spectrum"
type: task
task_id: task-07
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
The **show ruleset** (backend half): `directness = f(attention state, show-rule)`
plus the backend-authored card **headline**, and the **Impact Check** (fingerprint
compare → staleness warnings for matrix cases 12–15, 24). See DESIGN.md §5, §6.

## Files to Touch
```
CREATE:
  src/lib/intervention.ts        → decideDirectness(state, showRule) (+ receptivity read, shared w/ task-08)
MODIFY:
  src/pipeline/agent-pipeline.ts → at show: set offer.directness + headline; publish offer / spawn…done
  src/routes/intervention.ts     → ghost-interaction endpoints run the Impact Check
```

## Show ruleset
```typescript
// glow-first ARRIVAL is universal; this decides directness only (FE picks glow vs card by viewport)
export function decideDirectness(
  state: 'waiting' | 'thinking',
  showRule: ShowRule,           // per-action modulation (hover-old-ghost always reveals, etc.)
): InterventionDirectness {     // 'direct' | 'subtle'
  // waiting → direct; thinking → subtle; showRule can override (DESIGN §5c)
}
```
- Backend authors the **headline** from the agent's output (one line, "found/expanded …").
- Tier-locked pick → surface the upgrade offer on the card (from task-03's flag).

## Impact Check
```typescript
// recompute the canvas fingerprint and compare to the offer's context_fingerprint
// none     → show as-is
// material → show-with-warning ("may not capture your latest change — regenerate?") or re-trigger
```

## Depends On
task-04 (generation/show step + routes), task-06 (mutation events), task-01 (fingerprint).

## Definition of Done
- [ ] `decideDirectness` returns `direct|subtle` from attention state + show-rule
- [ ] Backend authors the sidebar-card headline from the agent output
- [ ] Impact Check: `material` → warning payload / re-trigger; `none` → show as-is
- [ ] Tier-locked → upgrade offer surfaced on the card
- [ ] `npm run build` compiles
