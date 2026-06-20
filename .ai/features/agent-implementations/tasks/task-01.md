---
feature: "agent-implementations"
type: task
task_id: task-01
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement Attunement and Orchestrator — the two infrastructure agents that route every agent pipeline call. These produce structured output (not streamed), use `models.fast()` (gemini-2.5-flash) from `src/lib/llm.ts` with thinking OFF (no providerOptions).

## Files to Touch
```
CREATE:
  src/agents/attunement.ts    → cognitive mode classifier
  src/agents/orchestrator.ts  → agent router
```

## Attunement agent

```typescript
// Model: models.fast() (gemini-2.5-flash), thinking OFF
// No tools
// Structured output: AttunementState
// Input: last 3-5 nodes from session (read from Supabase, NOT via tool)
// Output: { cognitive_mode, question_style, phase_shift_suggested, confidence }
```

Attunement reads the QUALITY of thinking from language:
- Exploratory → lots of "what if", "maybe", "what about"
- Transitional → sensing convergence, bridging language
- Declarative → "therefore", "specifically", naming precisely

## Orchestrator agent

```typescript
// Model: models.fast() (gemini-2.5-flash), thinking OFF
// No tools
// Input: AttunementState + canvas signals + subscription tier
// Output: { route: AgentRole, question_style: string }
```

Routing priority (Orchestrator must follow exactly):
1. `both_existing=true` edge (not question) → ARTICULATOR
2. `edge_type='question'` → OUTER_SUBCONSCIOUS
3. `phase_shift_suggested && phase='diverging'` → EXPANDER (bridging)
4. `phase='converging' && last_action='node_created'` → STRESS_TESTER
5. `phase='diverging' && last_action='node_created'` → EXPANDER
6. always queued → OBSERVER

Tier enforcement: Orchestrator receives `available_agents` from `getAvailableAgents(tier)` — routes only to agents in that list.

## Load before writing

Fetch https://mastra.ai/llms.txt for current Agent API. Load `.ai/skills/create-mastra-agent.md`.

## Depends On
`core-types` story (AttunementState type), `ghost-streaming` task-01 (`getAvailableAgents` from tier.ts).

## Definition of Done
- [ ] `attunementAgent` uses `models.fast()` from `src/lib/llm.ts` (gemini-2.5-flash, thinking OFF)
- [ ] `orchestratorAgent` uses `models.fast()` from `src/lib/llm.ts` (gemini-2.5-flash, thinking OFF)
- [ ] System prompts are constants (no dynamic interpolation from user input)
- [ ] Orchestrator only routes to agents in `available_agents` list
- [ ] `npm run build` compiles
