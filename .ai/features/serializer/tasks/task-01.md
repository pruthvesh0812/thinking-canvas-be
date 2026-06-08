---
feature: "serializer"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement `tiers.ts` (tier classification logic) and `rules.ts` (per-agent inclusion rules).

## Files to Touch
```
CREATE:
  src/serializer/tiers.ts   → classifies each thread message position into Tier 0-4
  src/serializer/rules.ts   → per-agent rules table (which tiers + which fields per agent)
```

## tiers.ts — Tier Classification

```typescript
type Tier = 0 | 1 | 2 | 3 | 4

// Given a list of thread messages (ordered by position), return the tier for each message:
// Tier 0 — Canvas anchor (original_intent box) — always first, separate from messages
// Tier 1 — Active (the current trigger node message) — always the latest
// Tier 2 — Recent (last 3 messages before active)
// Tier 3 — Mid (positions 4 to 10 from end)
// Tier 4 — Compressed (positions 11+ from end, grouped in blocks of 5)

function classifyTiers(messages: ThreadMessage[]): Map<string, Tier>
```

## rules.ts — Per-Agent Inclusion Table

The table from SERIALIZATION.md transcribed as code:

```typescript
type SerializationRule = {
  includeRejectionInsights: boolean
  includeNorthStar: boolean
  includeClickMoment: boolean
  activeNode: 'full+attunement' | 'full' | 'summary'
  tier2: 'full' | 'full+contradictions' | 'summary'
  tier3: 'summary+marker' | 'summary+flag' | 'summary' | 'na'
  tier4: 'trail+markers' | 'extract_contradictions' | 'trail' | 'na'
  includeAttunement: boolean
  includeGhostHistory: 'own' | 'none' | 'summary'
  threadType: 'canvas-stateful' | 'stateless'
}

const SERIALIZATION_RULES: Record<AgentRole, SerializationRule>
```

Full values from SERIALIZATION.md → Per-Agent Serialization Rules table.

## Depends On
`core-types` story must be complete (AgentRole, ThreadMessage types).

## Definition of Done
- [ ] `classifyTiers()` correctly assigns Tier 0-4 based on message position
- [ ] `SERIALIZATION_RULES` covers all 5 agent roles
- [ ] Articulator + Outer Sub marked as `threadType: 'stateless'` (no thread history)
- [ ] `npm run build` compiles
