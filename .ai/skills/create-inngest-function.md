---
last-verified: 2026-06-09
stale-after-days: 60
---

# Skill: Create an Inngest Function

> Load AGENT-PIPELINE.md + this file before writing any pipeline function.
> Fetch https://www.inngest.com/llms.txt for current Inngest API if unsure.

---

## Two pipeline types

| Type | Debounce | When to use |
|---|---|---|
| **Debounced** | `debounce: { period: '10s', key: 'event.data.session_id' }` | Main agent pipeline (fires on pause, not every event) |
| **Immediate** | No debounce config | Articulator, Outer Sub, Rejection Insights, Session Complete |

---

## File location

```
src/pipeline/<name>.ts   # kebab-case filename
```

Register every new function in `src/index.ts` → Inngest serve handler.

---

## Debounced template (main agent pipeline pattern)

```typescript
// src/pipeline/<name>.ts
import { inngest } from '../lib/inngest'
import { step } from 'inngest'

export const myPipeline = inngest.createFunction(
  {
    id: 'my-pipeline',
    debounce: { period: '10s', key: 'event.data.session_id' },
  },
  { event: 'canvas/node.created' },
  async ({ event, step }) => {
    // Step 1: Always name steps — they are idempotent and retryable
    const result = await step.run('step-name', async () => {
      // All side effects inside named steps
      return { value: 'data' }
    })

    // Sleep for frontend animation
    await inngest.sleep('delay-name', '1500ms')

    // Step 2: Use returned value from previous step
    await step.run('next-step', async () => {
      console.log(result.value)
    })
  }
)
```

## Immediate template (no debounce)

```typescript
export const rejectionInsights = inngest.createFunction(
  { id: 'rejection-insights' },   // no debounce config
  { event: 'canvas/ghost.rejected' },
  async ({ event, step }) => {
    await step.run('classify-rejection', async () => {
      // ...
    })
  }
)
```

---

## Inngest event naming convention

```
canvas/noun.verb

Examples:
  canvas/node.created
  canvas/edge.created
  canvas/ghost.rejected
  canvas/session.completed
  canvas/edge.existing-nodes   (both_existing=true, not question)
  canvas/edge.question         (edge_type='question')
```

---

## Sending events

```typescript
// From a Hono route handler:
import { inngest } from '../lib/inngest'

await inngest.send({
  name: 'canvas/node.created',
  data: {
    canvas_id: event.canvas_id,
    session_id: event.session_id,
    node_id: event.node_id,
  },
})
```

---

## Step order for agent pipeline (reference)

1. Attunement (gemini-2.5-flash)
2. canAgentFire() check — drop silently if pending ghost
3. Orchestrator → route decision
4. Build SpawnDescriptor + publish SPAWN to Redis
5. inngest.sleep('ghost-animation', '1500ms')
6. Load canvas thread + serialize + inject rejection_insights
7. Agent stream → publish chunks to Redis
8. Publish DONE + save thread to Supabase

---

## Prohibited

```typescript
// ❌ Never mutate external state outside of step.run()
// ❌ Never use session_id as a debounce key on the main pipeline — always session_id
// ❌ Never skip canAgentFire() before routing
// ❌ Never skip rejection_insights injection before agent call
// ❌ Never use Supabase Realtime from a pipeline — Redis pub/sub for ghost streaming only
```
