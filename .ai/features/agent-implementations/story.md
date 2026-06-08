---
feature: "agent-implementations"
type: story
created: 2026-06-09
status: draft
---

## What
Implement all 7 agent files in `src/agents/` — the two infrastructure agents (Attunement, Orchestrator) and five content agents (Expander, Stress-Tester, Observer, Articulator, Outer Subconscious).

## Why
Agents are the core intelligence layer. The pipeline functions (Story 9) call these agents. Without them, the pipeline has nowhere to route to.

## Blast Radius
| Component | Impact |
|---|---|
| `src/agents/*.ts` | 7 new agent files |
| `src/pipeline/*.ts` | Import agents from here |

## Files to Touch
```
CREATE:
  src/agents/attunement.ts         → gemini-2.5-flash, thinking:OFF
  src/agents/orchestrator.ts       → gemini-2.5-flash, thinking:OFF
  src/agents/expander.ts           → gemini-3.1-flash-lite, auto thinking
  src/agents/stress-tester.ts      → gemini-3.1-flash-lite, auto thinking
  src/agents/articulator.ts        → gemini-3.1-flash-lite, auto thinking
  src/agents/observer.ts           → gemini-3.1-flash-lite, thinking:high (-1)
  src/agents/outer-subconscious.ts → gemini-3.1-flash-lite, thinking:high (-1)
```

## Agent Model Routing (from ARCHITECTURE.md)

| Agent | Model | thinkingBudget | Tools |
|---|---|---|---|
| Attunement | gemini-2.5-flash | 0 (OFF) | none |
| Orchestrator | gemini-2.5-flash | 0 (OFF) | none |
| Expander | gemini-3.1-flash-lite | auto | get_window, traverse_trail, semantic_promote |
| Stress-Tester | gemini-3.1-flash-lite | auto | get_branch, semantic_promote |
| Articulator | gemini-3.1-flash-lite | auto | traverse_trail, get_path, get_content |
| Observer | gemini-3.1-flash-lite | -1 (high) | get_big_picture, get_content, traverse_trail, get_siblings |
| Outer Sub | gemini-3.1-flash-lite | -1 (high) | get_content |

## System Prompt Rules (from CODING-STANDARDS.md)

- System prompts are CONSTANTS — `const AGENT_SYSTEM_PROMPT = \`...\` as const`
- Never build prompts from user input
- Rejection insights are injected at call time by the serializer — NOT hardcoded in the prompt
- Load `.ai/skills/create-mastra-agent.md` before writing each agent

## Adaptive Attunement (Attunement agent output shape)

```typescript
// Attunement structured output
type AttunementState = {
  cognitive_mode: 'exploratory' | 'transitional' | 'declarative'
  question_style: 'opening' | 'bridging' | 'closing'
  phase_shift_suggested: boolean
  confidence: number  // 0-1
}
```

## Orchestrator Routing Rules (priority order)

```
1. both_existing edge (not question)    → ARTICULATOR (immediate pipeline)
2. question edge                        → OUTER_SUBCONSCIOUS (immediate pipeline)
3. phase_shift_suggested + diverging    → EXPANDER (bridging style)
4. converging + node_created            → STRESS_TESTER
5. diverging + node_created             → EXPANDER
6. always queued                        → OBSERVER
```

## Supabase Migration
No.

## Inngest Events
No.

## Risks
- Fetch https://mastra.ai/llms.txt before implementing to confirm current Agent API surface
- `gemini-3.1-flash-lite` is the correct model string — NOT `gemini-flash-lite-preview` (deprecated May 2026)
- Observer and Outer Sub must use `thinkingBudget: -1` (high) — not `thinkingBudget: 1`

## Task Breakdown
- **task-01:** Attunement + Orchestrator (infrastructure — no streaming, structured output)
- **task-02:** Expander + Stress-Tester + Articulator (content agents, streaming)
- **task-03:** Observer + Outer Subconscious (deep-thinking agents, streaming, high thinking)
