---
feature: "intervention-spectrum"
type: task
task_id: task-03
story: ../story.md
created: 2026-07-05
status: draft
---

## Scope
Repurpose the Orchestrator into the **judge**: one call over Attunement + the
**full canvas-map** → `{ mature, route, locus_node_ids, headroom, confidence }`,
single best agent, tier-locked → upgrade offer. Retire the Orchestrator; the
Observer becomes a content agent only. See DESIGN.md §4b.

## Files to Touch
```
MODIFY:
  src/agents/orchestrator.ts → the judge (new prompt, canvas-map input, new output schema)
  src/mastra.ts              → register the judge; drop the orchestrator registration
  src/agents/observer.ts     → no gate-mode role (content agent only)
```

## Output schema
```typescript
export const judgeOutputSchema = z.object({
  mature: z.boolean(),
  route: z.enum(AGENT_ROLES).nullable(),      // null when not mature
  locus_node_ids: z.array(z.string()).default([]),
  headroom: z.string().nullable(),            // what/where the augmentation is
  confidence: z.number().min(0).max(1),
})
```

## Prompt (constant — never user-interpolated)
- Per-agent, **locus-specific** maturity rubric (DESIGN §4b table) with **evidence**;
  no agent passes → `mature=false`.
- **Single best** agent. `session.current_phase` gates {Expander, Stress-Tester};
  Outer-Sub / Articulator are phase-agnostic and can outrank on stronger evidence.
- **Dedup vs. the FULL active rejection-insight set** — never re-offer a refusal.
- **Tier:** pick the genuine best; if tier-locked, DON'T substitute — flag an upgrade
  offer (consumed at show, task-07).
- Input: full canvas-map (content) via the serializer `canvas-map` path + Attunement.
- Model: `models.fast()` + `models.thinking('high')`.

## Depends On
task-01 (types), task-02 (phase gating). Uses the existing serializer canvas-map +
`db/rejection-insights`.

## Definition of Done
- [ ] Judge system prompt is a constant
- [ ] Output `{ mature, route, locus_node_ids, headroom, confidence }` validated by Zod
- [ ] Reads full canvas-map content + Attunement + **all** active rejection insights
- [ ] Single best agent; phase gates Expander/Stress-Tester
- [ ] Tier-locked best → upgrade-offer flag (no weaker substitution)
- [ ] Orchestrator retired from `mastra.ts`; Observer has no gate role
- [ ] `npm run build` compiles
