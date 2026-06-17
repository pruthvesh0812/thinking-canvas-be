---
last-verified: 2026-06-17
stale-after-days: 60
---

# Skill: Create a Mastra Agent

> Load AGENT-PIPELINE.md + this file before writing any agent.
> Fetch https://mastra.ai/llms.txt for current API if unsure.

---

## Checklist before writing

1. Identify the agent role (Expander / Stress-Tester / Articulator / Observer / Outer Sub / Attunement / Orchestrator)
2. Confirm model and thinking config from `src/lib/llm.ts` / LLM-LAYER.md (also summarised in ARCHITECTURE.md → Agent Model Routing table)
3. Identify which cursor tools the agent needs (AGENT-PIPELINE.md → Cursor Tools Reference)
4. Write the system prompt as a constant — never build from user input
5. Does this agent get rejection_insights injected? (Expander, Stress-Tester, Observer → YES. Articulator, Outer Sub → NO)

---

## File location

```
src/agents/<name>.ts   # camelCase + Agent export
```

---

## Template

```typescript
// src/agents/<name>.ts
import { Agent } from '@mastra/core/agent'
import { models } from '../lib/llm.js'
import { get_content } from '../tools/get-content.js'
// import other tools as needed

// System prompt is a constant — never interpolated from user data
const AGENT_NAME_SYSTEM_PROMPT = `
You are the <Role> for ThinkingCanvas...
` as const

export const agentNameAgent = new Agent({
  id: '<agent-id>',
  name: '<AgentName>',
  model: models.content(), // or models.fast() — see table below
  instructions: AGENT_NAME_SYSTEM_PROMPT,
  tools: { get_content /*, other tools */ },
})

// For Observer / Outer Sub: pass thinking config as providerOptions at call-site,
// never bake it into the model instance:
// await agentNameAgent.stream(serializedContext, {
//   providerOptions: { google: models.thinking('high') },
// })
```

---

## Model + Thinking config reference

| Agent | llm.ts helper | Thinking |
|---|---|---|
| Expander | `models.content()` (gemini-2.5-flash-lite) | OFF |
| Stress-Tester | `models.content()` (gemini-2.5-flash-lite) | OFF |
| Articulator | `models.content()` (gemini-2.5-flash-lite) | OFF |
| Observer | `models.fast()` (gemini-2.5-flash) | `models.thinking('high')` via providerOptions |
| Outer Subconscious | `models.fast()` (gemini-2.5-flash) | `models.thinking('high')` via providerOptions |
| Attunement | `models.fast()` (gemini-2.5-flash) | OFF |
| Orchestrator | `models.fast()` (gemini-2.5-flash) | OFF |

---

## Streaming (content agents only)

```typescript
// Always stream content agents — never use agent.generate()
const stream = await agentNameAgent.stream(serializedContext)
for await (const token of stream.textStream) {
  await redis.publish(
    `canvas:stream:${sessionId}`,
    JSON.stringify({ type: 'chunk', target: ghostId, data: token })
  )
}
```

**Exception — Observer and Attunement use `.generate()` with structured output,**
never `.stream()`. Both produce a fixed-shape object (Attunement: classifier
fields; Observer: `{anchor_node_ids, nodes, edges}` — see `src/agents/observer.ts`)
rather than freeform prose tokens, so there's nothing to stream token-by-token:

```typescript
const { object } = await agentNameAgent.generate(serializedContext, {
  structuredOutput: { schema: agentOutputSchema },
  providerOptions: { google: models.thinking('high') }, // Observer only
})
```

---

## Prohibited

```typescript
// ❌ Never use agent.memory — threads are managed in Supabase (src/db/threads.ts)
// ❌ Never build system prompt from user input
// ❌ Never call agent.generate() for prose content agents — must stream (Observer/Attunement are the only structured-output exceptions)
// ❌ Never import @ai-sdk/google directly — use models.* from src/lib/llm.ts (see LLM-LAYER.md)
// ❌ Never bake thinkingConfig into the model instance — pass via providerOptions at call-site
// ❌ Never trust ghost/node IDs emitted by the LLM — Observer must remap local labels to crypto.randomUUID() server-side
```
