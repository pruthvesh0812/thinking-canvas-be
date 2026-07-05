---
feature: "intervention-spectrum"
type: task
task_id: task-09
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Ratify the architecture changes into the canonical context docs via the
**`update-ai-context`** skill — the Redis protocol amendment, the judge role that
retires the Orchestrator, and the v1 one-way phase latch. See DESIGN.md §9, §10.

## Files to Touch
```
MODIFY:
  CLAUDE.md                       → amend non-negotiable #9; note judge replaces Orchestrator; Observer content-only
  .ai/context/CANVAS-SYNC.md      → RedisMessage carries waiting/offer/withdraw; decide→wait→generate flow
  .ai/context/AGENT-PIPELINE.md   → the judge (maturity + routing); the handshake; retire Orchestrator routing
  .ai/context/CORE-CONCEPTS.md    → judge role; v1 one-way phase latch; Observer reverts to content agent
```

## Notes
- Run **after** the code lands (this ratifies what actually shipped).
- Non-negotiable #9 becomes "Redis pub/sub = intervention signals (`waiting`/`offer`/
  `withdraw`/`spawn`/`chunk`/`done`); the ghost stream is the maximal form" — still
  no canvas *state* over Redis.
- Keep `.ai/features/branching/story.md` referenced as the deferred follow-on
  (re-divergence, local phase, per-branch guard key).

## Depends On
task-01 … task-08 (ratify the shipped design).

## Definition of Done
- [ ] Non-negotiable #9 amended (intervention signals; ghost is the max form; no canvas state over Redis)
- [ ] CANVAS-SYNC.md reflects `waiting`/`offer`/`withdraw` + the handshake
- [ ] AGENT-PIPELINE.md + CORE-CONCEPTS.md document the judge + v1 phase latch; Observer gate-mode removed
- [ ] `last-verified` dates refreshed on touched context files
