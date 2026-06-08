---
feature: "serializer"
type: story
created: 2026-06-09
status: draft
---

## What
Implement the serializer system (`src/serializer/`) that converts canvas-scoped agent threads into structured text for LLM context — applying tiered compression, per-agent rules, and rejection insight injection.

## Why
LLMs receive a linear context window. Raw JSON loses graph structure. The serializer is the single place that converts typed thread messages into the node-anchored format that preserves spatial topology, direction, and ghost history without bloating context. Every agent call passes through `serialize()`.

## Blast Radius
| Component | Impact |
|---|---|
| `src/serializer/index.ts` | Main entry point — called before every agent invocation |
| `src/serializer/tiers.ts` | Classifies each thread message into Tier 0–4 |
| `src/serializer/rules.ts` | Per-agent inclusion/exclusion rules |
| `src/serializer/rejection.ts` | Loads + formats rejection insights block |
| All pipeline functions | Call `serialize()` in Step 6 |

## Files to Touch
```
CREATE:
  src/serializer/tiers.ts     → tier classification (Anchor | Active | Recent | Mid | Compressed)
  src/serializer/rules.ts     → per-agent rules (which tiers + which fields to include)
  src/serializer/rejection.ts → load active insights + format NEGATIVE CONSTRAINTS block
  src/serializer/index.ts     → main serialize(thread, agentRole, canvasId) function
```

## Tier Classification Logic (from SERIALIZATION.md)

| Tier | Nodes | Format |
|---|---|---|
| Tier 0 — Anchor | `canvases.original_intent` | Full north star box |
| Tier 1 — Active | Current trigger node | Full content + attunement + ghost history |
| Tier 2 — Recent | Last 3 nodes | Full content + ghost outcome |
| Tier 3 — Mid | Nodes 4–10 | Summary + direction_marker only |
| Tier 4 — Compressed | 10+ | Blocks of 5, trail + response pattern only |

## Per-agent serialization rules (key differences)

- **Articulator + Outer Sub:** Stateless — no thread history, just the trigger node(s). No rejection injection.
- **Expander + Stress-Tester + Observer:** Full thread, all tiers, WITH rejection injection.
- **Observer:** Summaries only for Tier 2+, never full content (sees everything but briefly).

## Supabase Migration
No.

## Inngest Events
No.

## Risks
- Serializer output format is the contract between backend and all agents — changes affect every agent's behaviour
- `rejection.ts` must decrement `turns_remaining` AFTER the agent responds, not before serialization

## Task Breakdown
- **task-01:** tiers.ts (classification logic) + rules.ts (per-agent inclusion table)
- **task-02:** rejection.ts (insights block formatter) + index.ts (main serialize function)
