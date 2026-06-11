---
last-verified: 2026-06-11
stale-after-days: 60
---

# LLM-LAYER.md

> **Load this when:** Adding or modifying any agent, writing model calls, changing models, working with embeddings, or adding thinking mode to any component.

---

## Stack Layers

```
Your Agents  (src/agents/*.ts)       ← Mastra Agent class
    │
Mastra       (@mastra/core)           ← agent execution, tools, memory
    │
AI SDK       (ai)                     ← generateText, streamText, embed
    │
Provider     (@ai-sdk/google)         ← Google adapter
    │
Gemini API                            ← actual model
```

Mastra does NOT instantiate models — it accepts AI SDK model instances. Both `ai` and `@ai-sdk/google` are required alongside Mastra.

---

## The Rule

> **Never import `@ai-sdk/google` or `@ai-sdk/*` directly outside `src/lib/llm.ts`.**

All model instantiation lives in `src/lib/llm.ts`. Agents, pipelines, and tools import from there. This keeps provider swaps to a single file.

---

## src/lib/llm.ts — What It Exports

```typescript
// Model instances — pass directly to Mastra Agent or generateText/streamText
models.fast()       // gemini-2.5-flash          — Orchestrator, Attunement
models.content()    // gemini-2.5-flash-lite      — Expander, Stress-Tester, Articulator
models.thinking(budget: 'low' | 'high')           // gemini-2.5-flash — Observer, Outer Sub, Rejection Insights

// Thinking config — spread into providerOptions at call site (not baked into model instance)
// models.thinking('high') returns GoogleLanguageModelOptions, not a model

// Embedding utility
generateEmbedding(text: string): Promise<number[]>  // gemini-embedding-exp-03-07, 3072-dim
```

---

## Usage Patterns

### Mastra agent (no thinking)
```typescript
import { Agent } from '@mastra/core'
import { models } from '../lib/llm.js'

export const expanderAgent = new Agent({
  model: models.content(),
  // ...
})
```

### Direct call with thinking mode
```typescript
import { streamText } from 'ai'
import { models } from '../lib/llm.js'

await streamText({
  model: models.fast(),
  providerOptions: { google: models.thinking('high') },
  prompt: '...',
})
```

### Embedding (node save pipeline + semantic_promote)
```typescript
import { generateEmbedding } from '../lib/llm.js'

const embedding = await generateEmbedding(node.content)
```

---

## Agent → Model Mapping

| Agent / Component | Model | Thinking |
|---|---|---|
| Expander | `models.content()` | OFF |
| Stress-Tester | `models.content()` | OFF |
| Articulator | `models.content()` | OFF |
| Attunement Layer | `models.fast()` | OFF |
| Orchestrator | `models.fast()` | OFF |
| Observer | `models.fast()` | `thinking('high')` |
| Outer Subconscious | `models.fast()` | `thinking('high')` |
| Rejection Insights Engine | `models.fast()` | `thinking('low')` |
| Directional summary (node save) | `models.fast()` | OFF |
| Embeddings | `generateEmbedding()` | N/A |

---

## Swapping Providers

To swap all agents to a different provider, update only `src/lib/llm.ts`:
1. Replace `@ai-sdk/google` import with the new provider (e.g. `@ai-sdk/anthropic`)
2. Update model IDs inside `models.*`
3. Update `models.thinking()` — thinking config shape varies by provider
4. Update `embeddingModel` — Claude has no embeddings; use Voyage AI or similar

Note: embeddings may require a separate provider swap since not all LLM providers offer embedding models.
