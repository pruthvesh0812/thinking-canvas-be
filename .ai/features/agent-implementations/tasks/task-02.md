---
feature: "agent-implementations"
type: task
task_id: task-02
story: ../story.md
created: 2026-06-09
status: draft
---

## Scope
Implement Expander, Stress-Tester, and Articulator — the three content agents that stream responses. All use `gemini-3.1-flash-lite` with auto thinking.

## Files to Touch
```
CREATE:
  src/agents/expander.ts       → opens cognitive jumps ahead, adaptive to attunement mode
  src/agents/stress-tester.ts  → finds gaps, weak assumptions, contradictions
  src/agents/articulator.ts    → completes half-formed connections between two nodes
```

## Expander agent

```typescript
// Model: gemini-3.1-flash-lite, thinking auto
// Tools: get_window, traverse_trail, semantic_promote
// Trigger: node created in diverge phase (most common agent)
// Output: 1 reframe|mirror|pattern|reference|contradiction|appreciation + 1 question (usually)

// Adaptive to attunement.question_style:
//   opening   → "what if", "what else", expanding outward
//   bridging  → sensing convergence, bridging questions
//   closing   → "what specifically", "what breaks this", narrowing
```

## Stress-Tester agent

```typescript
// Model: gemini-3.1-flash-lite, thinking auto
// Tools: get_branch, semantic_promote
// Trigger: phase switches to converging + node created
// Output: finds gaps, weak assumptions, contradictions in current thinking
// Serialization: extracts contradictions from thread — flags them for stress-testing
```

## Articulator agent

```typescript
// Model: gemini-3.1-flash-lite, thinking auto
// Tools: traverse_trail, get_path, get_content
// Trigger: edge drawn between two existing nodes (both_existing=true, not question)
// Stateless — no thread history, just the two endpoint nodes + edge context
// Output: 2-3 possible articulations of what the connection means
```

## Ghost pair output format

All content agents output content for the ghost pair:
- Context node content (1 paragraph max, 40-60 words)
- Question node content (1 sentence — a genuine cognitive question)
- Articulator: 2-3 possible articulations for the context node (no question node)

## Load before writing

Fetch https://mastra.ai/llms.txt for current Agent API. Load `.ai/skills/create-mastra-agent.md`. Load `cursor-tools` story to confirm tool names.

## Depends On
task-01 (Attunement output type shapes), `cursor-tools` story both tasks (tools imported here).

## Definition of Done
- [ ] All 3 agents use `gemini-3.1-flash-lite` with no explicit thinking config (auto)
- [ ] System prompts are constants
- [ ] Articulator is stateless — receives only the two endpoint nodes, no thread history
- [ ] All agents use `agent.stream()` interface (not `agent.generate()`)
- [ ] `npm run build` compiles
