---
last-verified: 2026-06-09
stale-after-days: 60
---

# Skill: Create a Mastra Agent

> Load AGENT-PIPELINE.md + this file before writing any agent.
> Fetch https://mastra.ai/llms.txt for current API if unsure.

---

## Checklist before writing

1. Identify the agent role (Expander / Stress-Tester / Articulator / Observer / Outer Sub / Attunement / Orchestrator)
2. Confirm model and thinking config from ARCHITECTURE.md → Agent Model Routing table
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
import { google } from '@ai-sdk/google'
import { get_content } from '../tools/get-content'
// import other tools as needed

// System prompt is a constant — never interpolated from user data
const AGENT_NAME_SYSTEM_PROMPT = `
You are the <Role> for ThinkingCanvas...
` as const

export const agentNameAgent = new Agent({
  name: '<AgentName>',
  model: google('<model-string>', {
    thinkingConfig: { thinkingBudget: <budget> }
    // -1 = high thinking (Observer, Outer Sub)
    //  0 = OFF (Attunement, Orchestrator)
    // omit for auto (Expander, Stress-Tester, Articulator)
  }),
  instructions: AGENT_NAME_SYSTEM_PROMPT,
  tools: { get_content /*, other tools */ },
})
```

---

## Model + Thinking config reference

| Agent | Model string | thinkingBudget |
|---|---|---|
| Expander | `gemini-3.1-flash-lite` | omit (auto) |
| Stress-Tester | `gemini-3.1-flash-lite` | omit (auto) |
| Articulator | `gemini-3.1-flash-lite` | omit (auto) |
| Observer | `gemini-3.1-flash-lite` | `-1` (high) |
| Outer Subconscious | `gemini-3.1-flash-lite` | `-1` (high) |
| Attunement | `gemini-2.5-flash` | `0` (OFF) |
| Orchestrator | `gemini-2.5-flash` | `0` (OFF) |

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

---

## Prohibited

```typescript
// ❌ Never use agent.memory — threads are managed in Supabase (src/db/threads.ts)
// ❌ Never build system prompt from user input
// ❌ Never call agent.generate() for content agents — must stream
// ❌ Never use a model not listed in ARCHITECTURE.md Agent Model Routing
```
