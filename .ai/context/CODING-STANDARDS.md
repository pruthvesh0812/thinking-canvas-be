---
last-verified: 2026-06-08
verified-against: ThinkingCanvas_TechnicalBuild.docx (post single-user refactor)
stale-after-days: 90
---

# CODING-STANDARDS.md

> **Load this when:** Starting any new feature, reviewing code, or unsure about conventions.

---

## Non-Negotiables

1. **canAgentFire() before every Orchestrator route** — never skip
2. **Tier enforcement server-side** in Orchestrator — never trust client claims
3. **canvases.original_intent is immutable** — INSERT once, never UPDATE
4. **Agent prompts are constants** — never build from user input
5. **Agent threads are per-canvas** — `canvas_id` is the thread key, never `session_id`
6. **Types in `types/index.ts`** — never define NodeDelta, GhostPair etc. locally
7. **RLS on every Supabase table** — `auth.uid() = user_id` policy before use
8. **No Supabase Realtime** — backend never pushes to canvas. Single-user workspace.
9. **Redis = ghost streaming only** — spawn/chunk/done messages only. No canvas state over Redis.
10. **Load rejection_insights before every agent call** — inject as NEGATIVE CONSTRAINTS
11. **Backend never writes user nodes/edges** — those are frontend → Supabase direct writes
12. **SpawnDescriptor defines structure, agent defines content** — ghost layout = frontend; text = agent

---

## Package Manager

**npm only.** No pnpm, no yarn, no bun.

```bash
npm install [package]     # install dependency
npm run dev               # start dev server
npm run build             # compile
npm run test              # tests
```

---

## TypeScript Conventions

```typescript
// ✅ canvas_id + session_id always present on canvas-related types
type NodeDelta = {
  node_id: string
  canvas_id: string   // required
  session_id: string  // required
  ...
}

// ✅ SpawnDescriptor pre-assigns ghost IDs before agent is called
const descriptor = buildSpawnDescriptor({
  trigger_node_id, session_id, agent_role,
  context_node_type,
  has_question_node: true
})
// ghost_ids are crypto.randomUUID() — used by frontend to target chunks

// ✅ Zod for all API inputs
import { z } from 'zod'
const canvasEventSchema = z.object({
  canvas_id: z.string().uuid(),
  session_id: z.string().uuid(),
  node_id: z.string().uuid(),
})

// ❌ Never use `any`
// ❌ Never use type assertions (as X) unless unavoidable
```

---

## Mastra Patterns

```typescript
// ✅ gemini-3.1-flash-lite for content agents
// ✅ thinking:high for Observer and Outer Sub
import { google } from '@ai-sdk/google'

export const observerAgent = new Agent({
  name: 'Observer',
  model: google('gemini-3.1-flash-lite', {
    thinkingConfig: { thinkingBudget: -1 }  // -1 = high
  }),
  instructions: OBSERVER_SYSTEM_PROMPT,
  tools: { get_big_picture, get_content, traverse_trail }
})

// ✅ gemini-2.5-flash for Attunement/Orchestrator/Summary (thinking:OFF)
export const attunementAgent = new Agent({
  name: 'Attunement',
  model: google('gemini-2.5-flash', {
    thinkingConfig: { thinkingBudget: 0 }   // 0 = OFF
  }),
  instructions: ATTUNEMENT_SYSTEM_PROMPT
})

// ✅ Always stream content agents
const stream = await expanderAgent.stream(serializedContext)

// ❌ Never use agent.memory — use canvas-scoped agent_threads in Supabase
```

---

## Inngest Patterns

```typescript
// ✅ Debounce by session_id
export const agentPipeline = inngest.createFunction(
  { id: 'agent-pipeline', debounce: { period: '10s', key: 'event.data.session_id' } },
  { event: 'canvas/node.created' },
  async ({ event, step }) => {
    const attunement = await step.run('attunement', async () => { ... })
    await step.run('publish-spawn', async () => { ... })
    await inngest.sleep('ghost-animation', '1500ms')
    await step.run('stream-context', async () => { ... })
  }
)

// ✅ Immediate pipelines (no debounce)
export const rejectionInsights = inngest.createFunction(
  { id: 'rejection-insights' },  // no debounce config
  { event: 'canvas/ghost.rejected' },
  async ({ event, step }) => { ... }
)

// ✅ Steps are idempotent — safe to retry
// ✅ All Supabase writes inside named steps
// ❌ Never mutate external state outside of steps
```

---

## Upstash Redis Patterns

```typescript
// ✅ Only for ghost node pub/sub
import { Redis } from '@upstash/redis'
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
})

// ✅ Channel: canvas:stream:${sessionId}
// ✅ Message types: spawn | chunk | done | ping
await redis.publish(`canvas:stream:${sessionId}`,
  JSON.stringify({ type: 'chunk', target: ghost_id, data: token }))

// ❌ Never publish canvas state (nodes, edges) to Redis
// ❌ Never use Redis as a persistent store
// ❌ Never use Redis as a job queue — Inngest handles that
```

---

## Supabase Patterns

```typescript
// ✅ Service role key on backend
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ✅ canvas_id + session_id on every relevant write
await supabase.from('nodes').insert({
  canvas_id: event.data.canvas_id,
  session_id: event.data.session_id,
  ...
})

// ✅ original_intent = INSERT only
await supabase.from('canvases').insert({ original_intent, title, user_id })
// ❌ Never: await supabase.from('canvases').update({ original_intent })

// ❌ Never use supabase.channel() — Realtime is disabled
// ❌ Never write user-created nodes/edges from backend
```

---

## Hono Patterns

```typescript
// ✅ SSE endpoint — stateless Redis subscriber
app.get('/api/stream/:sessionId', async (c) => {
  return streamSSE(c, async (stream) => {
    const sub = redis.subscribe(`canvas:stream:${c.req.param('sessionId')}`)
    sub.on('message', async (_, msg) => {
      await stream.writeSSE({ data: msg })
      if (JSON.parse(msg).type === 'done') sub.unsubscribe()
    })
  })
})

// ✅ Validate all inputs with Zod
app.post('/api/canvas-event', zValidator('json', canvasEventSchema), async (c) => {
  const event = c.req.valid('json')
  ...
})
```

---

## Prohibited Patterns

```typescript
// ❌ supabase.channel()              — Realtime disabled
// ❌ Supabase Realtime subscribe      — disabled entirely
// ❌ Redis.publish(canvas state)      — Redis for ghost streaming only
// ❌ Backend write to nodes/edges     — frontend writes directly to Supabase
// ❌ agent.memory                     — use canvas-scoped agent_threads
// ❌ Dynamic agent prompts            — constants only
// ❌ session_id as thread key         — canvas_id is the thread key
// ❌ original_intent update           — immutable
// ❌ pnpm / yarn / bun                — npm only
// ❌ Skip canAgentFire()              — always check before routing
// ❌ Skip rejection_insights inject   — always load before agent call
```
