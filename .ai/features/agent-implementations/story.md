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
  src/agents/attunement.ts         → models.fast() (gemini-2.5-flash), thinking OFF
  src/agents/orchestrator.ts       → models.fast() (gemini-2.5-flash), thinking OFF
  src/agents/expander.ts           → models.content() (gemini-2.5-flash-lite), thinking OFF
  src/agents/stress-tester.ts      → models.content() (gemini-2.5-flash-lite), thinking OFF
  src/agents/articulator.ts        → models.content() (gemini-2.5-flash-lite), thinking OFF
  src/agents/observer.ts           → models.fast() + providerOptions: { google: models.thinking('high') }
  src/agents/outer-subconscious.ts → models.fast() + providerOptions: { google: models.thinking('high') }
```

## Agent Model Routing (from LLM-LAYER.md — authoritative; supersedes ARCHITECTURE.md)

| Agent | Model | Thinking | Tools |
|---|---|---|---|
| Attunement | models.fast() (gemini-2.5-flash) | OFF | none |
| Orchestrator | models.fast() (gemini-2.5-flash) | OFF | none |
| Expander | models.content() (gemini-2.5-flash-lite) | OFF | get_window, traverse_trail, semantic_promote |
| Stress-Tester | models.content() (gemini-2.5-flash-lite) | OFF | get_branch, semantic_promote |
| Articulator | models.content() (gemini-2.5-flash-lite) | OFF | traverse_trail, get_path, get_content |
| Observer | models.fast() (gemini-2.5-flash) | thinking('high') via providerOptions | get_big_picture, get_content, traverse_trail, get_siblings |
| Outer Sub | models.fast() (gemini-2.5-flash) | thinking('high') via providerOptions | get_content |

All model instantiation goes through `src/lib/llm.ts` (non-negotiable #12) — never `google(...)` directly in agent files.

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
- Model routing must come from `src/lib/llm.ts` (`models.fast()` / `models.content()` / `models.thinking()`) per `LLM-LAYER.md` — do not call `google(...)` directly in agent files
- Observer and Outer Sub use `models.fast()` + `providerOptions: { google: models.thinking('high') }` (thinkingBudget 8000) passed at call-site — not baked into the model instance

## Task Breakdown
- **task-01:** Attunement + Orchestrator (infrastructure — no streaming, structured output)
- **task-02:** Expander + Stress-Tester + Articulator (content agents, streaming)
- **task-03:** Observer + Outer Subconscious (deep-thinking agents, streaming, high thinking)
