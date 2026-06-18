---
last-verified: 2026-06-18
verified-against: ThinkingCanvas_TechnicalBuild.docx (post single-user refactor; added exhaustiveness-guard convention)
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

// ✅ Narrow a discriminated union with a type guard instead of casting —
// ThreadMessage's assistant variants are a discriminated union on turn_type
// (ghost_pair | observer_structure | ...future variants). A formatter that
// only handles one variant should narrow to it explicitly, so adding a new
// variant later forces every such call site to be re-examined by the
// compiler instead of silently reaching a field that isn't there at runtime.
type GhostPairMsg = Extract<ThreadMessage, { role: 'assistant'; turn_type: 'ghost_pair' }>
function asGhostPairMsg(msg: ThreadMessage | undefined): GhostPairMsg | null {
  return msg && msg.role === 'assistant' && msg.turn_type === 'ghost_pair' ? msg : null
}
// ❌ const gp = (msg as AssistantMsg).ghost_pair   — unsafe, survives a missing case
// ✅ const gp = asGhostPairMsg(msg)?.ghost_pair    — null when it isn't this variant
```

---

## Mastra Patterns

```typescript
// ✅ All model instantiation via src/lib/llm.ts — never import @ai-sdk/google directly (see LLM-LAYER.md)
import { models } from '../lib/llm.js'

// ✅ gemini-2.5-flash-lite (models.content()) for content agents — Expander, Stress-Tester, Articulator
export const expanderAgent = new Agent({
  id: 'expander',
  name: 'Expander',
  model: models.content(),
  instructions: EXPANDER_SYSTEM_PROMPT,
  tools: { get_window, traverse_trail, semantic_promote }
})

// ✅ gemini-2.5-flash (models.fast()) + thinking:high for Observer and Outer Sub
// thinkingConfig is passed as providerOptions at call-site, not baked into the model
export const observerAgent = new Agent({
  id: 'observer',
  name: 'Observer',
  model: models.fast(),
  instructions: OBSERVER_SYSTEM_PROMPT,
  tools: { get_big_picture, get_content, traverse_trail, get_siblings }
})

const stream = await observerAgent.stream(serializedContext, {
  providerOptions: { google: models.thinking('high') }
})

// ✅ gemini-2.5-flash (models.fast()) for Attunement/Orchestrator/Summary (thinking:OFF)
export const attunementAgent = new Agent({
  id: 'attunement',
  name: 'Attunement',
  model: models.fast(),
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

## Comments in Complex Functions

Default: **no comments.** Don't restate what well-named code already says.

**Exception — complex functions:** When a function has multiple non-obvious steps or a
reader would need to hold the whole algorithm in mind to follow it, add a short
step-label comment before each logical phase. The goal is a scannable map of the
function — not a line-by-line narration.

```typescript
// ✅ Step labels for a multi-phase function
export async function serialize(thread, agentRole, canvas) {
  // 1. Fetch all referenced nodes + canvas edges + rejection block in parallel
  const [...] = await Promise.all([...])

  // 2. Build lookup maps (nodeMap, seqMap)
  ...

  // 3. Classify messages into tiers
  const tierMap = classifyTiers(thread.messages)

  // 4. Assemble output: north star → session boundary → rejection block → tiers 1-4
  ...
}

// ❌ Narration — don't do this
// Call the database to get the node by its ID
const node = await getNode(id)
```

When to add step comments:
- The function has 3+ distinct logical phases
- The order of steps matters and isn't obvious from the code
- A new reader would have to trace the whole function to understand the shape

When NOT to add them:
- Simple CRUD functions (`getNode`, `createThread`, etc.)
- Functions whose name + parameter names already tell the full story
- Short functions (< ~20 lines)

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
