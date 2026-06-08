---
feature: "serializer"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement `rejection.ts` (NEGATIVE CONSTRAINTS block formatter) and `index.ts` (the main `serialize()` function that assembles everything).

## Files to Touch
```
CREATE:
  src/serializer/rejection.ts   → load active insights + format NEGATIVE CONSTRAINTS block
  src/serializer/index.ts       → main serialize(thread, agentRole, canvasId) function
```

## rejection.ts

```typescript
// Loads active rejection_insights for canvas + formats as NEGATIVE CONSTRAINTS block
// Returns empty string if no active insights (Articulator/Outer Sub also skip)

async function buildRejectionBlock(canvas_id: string): Promise<string>

// Format:
// NEGATIVE CONSTRAINTS (active — do not violate):
// ─────────────────────────────────────────────
// [HARD BLOCK]           Avoid high-level analogies and metaphors
//                        Source: seq:14, reason: Too Abstract
// [APPROACH PIVOT]       Keep core insight, simplify language and framing
//                        Source: seq:11, reason: Too Technical
// [DEFERRAL — 2 turns]   Pause convergence framing theme this session
//                        Source: seq:9, reason: Skip for now
// ─────────────────────────────────────────────
```

## index.ts — serialize()

```typescript
// Main entry point called by all pipeline functions before agent invocation
async function serialize(
  thread: AgentThread,
  agentRole: AgentRole,
  canvas: Canvas,
): Promise<string>

// Assembly order:
// 1. Tier 0 — Canvas North Star anchor box (always first)
// 2. Session boundary marker (if thread has a boundary marker message)
// 3. NEGATIVE CONSTRAINTS block (if agent rule says includeRejectionInsights=true)
// 4. Messages in tier order (Tier 1 → Tier 4), formatted per-tier per-agent rules
```

## Tier format templates (from SERIALIZATION.md)

Each tier renders as node-anchored format. Tier 1 example:
```
────────────────────────────────────────────────
[seq:16 | nodeId_abc | contradicts | ★ACTIVE]
CONTENT: "full text"
INCOMING: [seq:15 | establishes] ──logical──▶ "summary"
ATTUNEMENT: transitional | question_style: bridging | confidence: 0.81
MY LAST RESPONSE [triggered by seq:15]:
  [contradiction] "..." STATUS: ⧗ PENDING (1 node created while pending)
────────────────────────────────────────────────
```

## Depends On
task-01 (tiers.ts + rules.ts), `db-layer` task-02 (rejection-insights.ts for loading).

## Definition of Done
- [ ] `serialize()` produces structured text matching the format in SERIALIZATION.md
- [ ] NEGATIVE CONSTRAINTS block is injected for Expander, Stress-Tester, Observer — NOT for Articulator or Outer Sub
- [ ] Stateless agents (Articulator, Outer Sub) receive only Tier 0 + Tier 1 (active node only)
- [ ] `npm run build` compiles
